import { Router } from "express";
import * as googleTTS from "google-tts-api";

const router = Router();
const DEVANAGARI = /[\u0900-\u097F]/;

router.post("/", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(422).json({ detail: "text is required" });
  if (text.length > 5000) return res.status(422).json({ detail: "text is too long (max 5000 characters)" });

  // The Hindi voice handles Devanagari and Roman script, so mixed text goes to "hi"
  const lang = req.body.lang || (DEVANAGARI.test(text) ? "hi" : "en");

  try {
    // the service only accepts ~200 characters per request, so it is split into parts
    const parts = await googleTTS.getAllAudioBase64(text, { lang, splitPunct: ",.?!।" });
    const audio = Buffer.concat(parts.map((part) => Buffer.from(part.base64, "base64")));
    res.set("Content-Type", "audio/mpeg").send(audio);
  } catch (err) {
    res.status(502).json({ detail: `Text to speech failed: ${err.message}` });
  }
});

export default router;
