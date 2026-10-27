import { Router } from "express";
import * as repo from "../transcriptionsRepo.js";

const router = Router();

class ValidationError extends Error {}

function optionalString(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return value.trim();
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateCreate(body = {}) {
  const text = optionalString(body.text, "text", 20000);
  if (!text) throw new ValidationError("text is required");

  const duration = body.duration_seconds;
  if (duration !== undefined && duration !== null && (typeof duration !== "number" || duration < 0)) {
    throw new ValidationError("duration_seconds must be a positive number");
  }

  return {
    title: optionalString(body.title, "title", 200) || "Untitled",
    text,
    language: optionalString(body.language, "language", 50),
    engine: optionalString(body.engine, "engine", 30),
    duration_seconds: duration ?? null,
  };
}

function validateUpdate(body = {}) {
  const data = {
    title: optionalString(body.title, "title", 200),
    text: optionalString(body.text, "text", 20000),
    language: optionalString(body.language, "language", 50),
  };
  if (body.text !== undefined && !data.text) throw new ValidationError("text cannot be empty");
  if (body.title !== undefined && !data.title) throw new ValidationError("title cannot be empty");
  return data;
}

router.get("/", async (req, res) => {
  const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";

  const { items, total } = await repo.list({ q, skip, limit });
  res.json({ items, total, skip, limit });
});

router.post("/", async (req, res) => {
  const created = await repo.create(validateCreate(req.body));
  res.status(201).json(created);
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const item = id && (await repo.findById(id));
  if (!item) return res.status(404).json({ detail: "Transcription not found" });
  res.json(item);
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const updated = id && (await repo.update(id, validateUpdate(req.body)));
  if (!updated) return res.status(404).json({ detail: "Transcription not found" });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = id && (await repo.remove(id));
  if (!deleted) return res.status(404).json({ detail: "Transcription not found" });
  res.status(204).end();
});

// turn validation problems into 422s, let anything else fall through to the app handler
router.use((err, _req, res, next) => {
  if (err instanceof ValidationError) return res.status(422).json({ detail: err.message });
  next(err);
});

export default router;
