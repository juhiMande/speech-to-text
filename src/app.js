import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import transcriptionsRouter from "./routes/transcriptions.js";
import ttsRouter from "./routes/tts.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok", engine: "Gemini Live" }));
  app.use("/api/transcriptions", transcriptionsRouter);
  app.use("/api/tts", ttsRouter);

  app.use(express.static(publicDir));

  app.use("/api", (_req, res) => res.status(404).json({ detail: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ detail: "Invalid JSON body" });
    console.error(err);
    res.status(500).json({ detail: "Something went wrong on the server" });
  });

  return app;
}
