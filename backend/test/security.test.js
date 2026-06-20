import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createAccessToken,
  decodeToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../src/security.js";

test("password hashes round trip through bcrypt", async () => {
  const password = "Strong!Password123";
  const digest = await hashPassword(password);
  assert.notEqual(digest, password);
  assert.equal(await verifyPassword(password, digest), true);
  assert.equal(await verifyPassword("wrong-password", digest), false);
});

test("access tokens enforce their token type", () => {
  const userId = crypto.randomUUID();
  const token = createAccessToken(userId, 3);
  const payload = decodeToken(token, "access");
  assert.equal(payload.sub, userId);
  assert.equal(payload.ver, 3);
  assert.throws(() => decodeToken(token, "refresh"), /Invalid token type/);
});

test("token hashing is stable and does not store plaintext", () => {
  assert.equal(hashToken("secret"), hashToken("secret"));
  assert.notEqual(hashToken("secret"), "secret");
});
