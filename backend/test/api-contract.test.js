import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { app } from "../src/app.js";

test("liveness and required API routes are exposed", async () => {
  const live = await request(app).get("/api/v1/health/live");
  assert.equal(live.status, 200);
  assert.deepEqual(live.body, { status: "ok" });
  assert.ok(live.headers["x-request-id"]);

  const protectedRequests = [
    request(app).post("/api/v1/documents/upload"),
    request(app).post("/api/v1/chat"),
    request(app).get("/api/v1/conversations"),
    request(app).get("/api/v1/messages"),
  ];
  for (const responsePromise of protectedRequests) {
    const response = await responsePromise;
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "authentication_error");
  }
});

test("invalid auth requests use the stable validation envelope", async () => {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ email: "not-an-email", password: "short" });
  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, "request_validation_error");
  assert.ok(Array.isArray(response.body.error.details.errors));
  assert.ok(response.body.error.request_id);
});
