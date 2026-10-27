import "dotenv/config";

const list = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || "postgresql://stt:stt@localhost:5432/stt",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-live-preview",
    // e.g. "hi-IN,en-IN" – empty means auto detect
    languages: list(process.env.GEMINI_LANGUAGES),
  },
};
