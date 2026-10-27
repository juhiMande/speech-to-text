import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { useMemoryDb } from "./helpers.js";

const app = createApp();

beforeEach(useMemoryDb);

async function make(overrides = {}) {
  const res = await request(app)
    .post("/api/transcriptions")
    .send({ title: "Meeting notes", text: "Kal ki meeting 10 baje hai, please join on time.", ...overrides });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test("health check", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("create and read one", async () => {
  const created = await make({ language: "Hindi + English" });
  const res = await request(app).get(`/api/transcriptions/${created.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "Meeting notes");
  assert.equal(res.body.language, "Hindi + English");
});

test("list with search and paging", async () => {
  await make({ title: "Groceries", text: "दूध और bread लाना है" });
  await make({ title: "Standup", text: "Yesterday I fixed the login bug" });
  await make({ title: "Call mom", text: "Shaam ko call karna" });

  const page = await request(app).get("/api/transcriptions?limit=2");
  assert.equal(page.body.total, 3);
  assert.equal(page.body.items.length, 2);

  const search = await request(app).get("/api/transcriptions?q=bread");
  assert.deepEqual(search.body.items.map((i) => i.title), ["Groceries"]);
});

test("update keeps fields that were not sent", async () => {
  const created = await make();
  const res = await request(app).put(`/api/transcriptions/${created.id}`).send({ title: "Updated" });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, "Updated");
  assert.equal(res.body.text, created.text);
});

test("delete", async () => {
  const created = await make();
  assert.equal((await request(app).delete(`/api/transcriptions/${created.id}`)).status, 204);
  assert.equal((await request(app).get(`/api/transcriptions/${created.id}`)).status, 404);
});

test("validation and not found", async () => {
  assert.equal((await request(app).post("/api/transcriptions").send({ text: "" })).status, 422);
  assert.equal((await request(app).put("/api/transcriptions/999").send({ title: "x" })).status, 404);
  assert.equal((await request(app).get("/api/transcriptions/abc")).status, 404);
});
