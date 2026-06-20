import assert from "node:assert/strict";
import test from "node:test";
import { DocumentChunker } from "../src/services/chunking.js";

test("chunks preserve page numbers, metadata, and sequential indexes", () => {
  const text = Array.from({ length: 300 }, (_, index) => `word-${index}`).join(" ");
  const chunks = new DocumentChunker(200, 50).split([
    { text, pageNumber: 7, metadata: { heading: "Scope" } },
  ]);
  assert.ok(chunks.length > 2);
  assert.deepEqual(
    chunks.map((chunk) => chunk.chunkIndex),
    Array.from({ length: chunks.length }, (_, index) => index),
  );
  assert.ok(chunks.every((chunk) => chunk.pageNumber === 7));
  assert.ok(chunks.every((chunk) => chunk.chunkMetadata.heading === "Scope"));
});
