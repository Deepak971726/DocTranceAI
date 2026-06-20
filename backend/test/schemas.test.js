import assert from "node:assert/strict";
import test from "node:test";
import { registerSchema, resetPasswordSchema } from "../src/schemas.js";

test("six-character strong passwords are accepted", () => {
  assert.equal(
    registerSchema.parse({
      email: "person@example.com",
      password: "Ab1!xy",
      full_name: "Person",
    }).password,
    "Ab1!xy",
  );
  assert.equal(
    resetPasswordSchema.parse({ token: "x".repeat(32), password: "Ab1!xy" }).password,
    "Ab1!xy",
  );
});

test("passwords shorter than six characters are rejected", () => {
  assert.throws(() =>
    registerSchema.parse({ email: "person@example.com", password: "A1!xy" }),
  );
});
