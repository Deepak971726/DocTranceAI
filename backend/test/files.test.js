import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  sanitizeFilename,
  validateFileContent,
} from "../src/utils/files.js";

test("filenames are reduced to a safe basename", () => {
  assert.equal(
    sanitizeFilename("../../Client Contract (final).PDF"),
    "Client_Contract_final.pdf",
  );
});

test("PDF magic bytes are required", async () => {
  await validateFileContent(".pdf", Buffer.from("%PDF-1.7\ncontent"));
  await assert.rejects(
    validateFileContent(".pdf", Buffer.from("not a pdf")),
    /not a valid PDF/,
  );
});

test("DOCX container members are required", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<document/>");
  await validateFileContent(".docx", await zip.generateAsync({ type: "nodebuffer" }));
  await assert.rejects(
    validateFileContent(".docx", Buffer.from("PK-not-a-valid-archive")),
    /corrupted/,
  );
});

test("TXT rejects binary content", async () => {
  await validateFileContent(".txt", Buffer.from("Readable UTF-8 text"));
  await assert.rejects(
    validateFileContent(".txt", Buffer.from("text\0binary")),
    /Binary content/,
  );
});
