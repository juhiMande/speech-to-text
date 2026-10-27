import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";
import { attachTranscribeSocket } from "../src/realtime/transcribeSocket.js";

// pretends every audio chunk is one spoken word
class FakeTranscriber {
  name = "fake";
  words = [];
  constructor({ onText }) {
    this.onText = onText;
  }
  async start() {}
  sendAudio() {
    this.words.push(`word${this.words.length + 1}`);
    this.onText(this.words.join(" "));
  }
  async finish() {
    return this.words.join(" ");
  }
  close() {}
}

function startServer(createTranscriber) {
  const server = http.createServer();
  attachTranscribeSocket(server, { createTranscriber });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

function connect(server) {
  const ws = new WebSocket(`ws://localhost:${server.address().port}/ws/transcribe`);
  const queue = [];
  const waiters = [];
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    const waiter = waiters.shift();
    waiter ? waiter(msg) : queue.push(msg);
  });
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r)));
  return { ws, next };
}

test("streams partial text and returns the final transcript", async () => {
  const server = await startServer((callbacks) => new FakeTranscriber(callbacks));
  const { ws, next } = connect(server);

  assert.deepEqual(await next(), { type: "ready", engine: "fake" });

  ws.send(Buffer.alloc(3200));
  assert.deepEqual(await next(), { type: "partial", text: "word1" });

  ws.send(Buffer.alloc(3200));
  assert.equal((await next()).text, "word1 word2");

  ws.send(JSON.stringify({ type: "stop" }));
  const final = await next();
  assert.equal(final.type, "final");
  assert.equal(final.text, "word1 word2");

  ws.close();
  server.close();
});

test("reports a clear error when the engine cannot start", async () => {
  const server = await startServer(() => {
    throw new Error("GEMINI_API_KEY is not set on the server");
  });
  const { ws, next } = connect(server);

  const msg = await next();
  assert.equal(msg.type, "error");
  assert.match(msg.message, /GEMINI_API_KEY/);

  ws.close();
  server.close();
});
