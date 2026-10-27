import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { GeminiTranscriber } from "./geminiTranscriber.js";

const START_TIMEOUT_MS = 15000;

const defaultFactory = (callbacks) => new GeminiTranscriber({ ...config.gemini, ...callbacks });

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Protocol on /ws/transcribe
 *   client -> server  binary: 16 kHz mono PCM16 audio chunks
 *   client -> server  {"type":"stop"} when recording ends
 *   server -> client  {"type":"ready"|"partial"|"final"|"error", ...}
 */
export function attachTranscribeSocket(server, { createTranscriber = defaultFactory } = {}) {
  const wss = new WebSocketServer({ server, path: "/ws/transcribe" });

  wss.on("connection", async (ws) => {
    const send = (payload) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
    };

    let transcriber;
    let ready = false;
    let stopping = false;
    const startedAt = Date.now();

    // register handlers first so nothing sent during startup is lost
    ws.on("message", async (data, isBinary) => {
      if (!ready || stopping) return;

      if (isBinary) {
        try {
          transcriber.sendAudio(data);
        } catch (err) {
          send({ type: "error", message: err.message });
        }
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "stop") {
        stopping = true;
        const text = await transcriber.finish();
        send({
          type: "final",
          text,
          engine: transcriber.name,
          duration: Math.round((Date.now() - startedAt) / 100) / 10,
        });
        ws.close();
      }
    });

    ws.on("close", () => transcriber?.close());

    try {
      transcriber = createTranscriber({
        onText: (text) => send({ type: "partial", text }),
        onError: (message) => send({ type: "error", message }),
      });
      await withTimeout(
        transcriber.start(),
        START_TIMEOUT_MS,
        "Speech engine did not respond in time. Check the API key and network."
      );
    } catch (err) {
      console.error("Could not start speech engine:", err.message);
      send({ type: "error", message: `Could not start speech engine: ${err.message}` });
      ws.close();
      return;
    }

    ready = true;
    send({ type: "ready", engine: transcriber.name });
  });

  return wss;
}
