import assert from "node:assert/strict";
import test from "node:test";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractDocx, extractPdf, extractTxt } from "../src/services/extraction.js";

test("PDF extraction preserves page numbers and text", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  page.drawText("Grounded PDF content", { x: 50, y: 700, size: 12, font });
  const result = await extractPdf(Buffer.from(await pdf.save()));

  assert.equal(result.pageCount, 1);
  assert.equal(result.sections[0].pageNumber, 1);
  assert.match(result.sections[0].text, /Grounded PDF content/);
});

test("DOCX extraction retains heading provenance", async () => {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Scope", heading: HeadingLevel.HEADING_1 }),
          new Paragraph("Grounded DOCX content."),
        ],
      },
    ],
  });
  const result = await extractDocx(await Packer.toBuffer(document));

  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].metadata.heading, "Scope");
  assert.match(result.sections[0].text, /Grounded DOCX content/);
});

test("TXT extraction strips a UTF-8 BOM", () => {
  const result = extractTxt(Buffer.from("\uFEFFGrounded text", "utf8"));
  assert.equal(result.sections[0].text, "Grounded text");
});
