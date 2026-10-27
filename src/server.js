import http from "node:http";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { createApp } from "./app.js";
import { attachTranscribeSocket } from "./realtime/transcribeSocket.js";

async function main() {
  await initDb();

  const server = http.createServer(createApp());
  attachTranscribeSocket(server);

  server.listen(config.port, () => {
    console.log(`Speech to Text running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
