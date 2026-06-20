import path from "node:path";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ValidationError } from "../errors.js";
import { logProcessFinished, logProcessStarted } from "../logger.js";

function decodeHtml(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

export async function extractPdf(content) {
  logProcessStarted("Extract PDF text", { bytes: content.length });
  try {
    const document = await getDocument({
      data: new Uint8Array(content),
      disableWorker: true,
      useSystemFonts: true,
    }).promise;
    const sections = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        sections.push({ text, pageNumber, metadata: { page: pageNumber } });
      }
    }
    const pageCount = document.numPages;
    const metadataResult = await document.getMetadata().catch(() => ({}));
    const metadata = Object.fromEntries(
      Object.entries(metadataResult.info ?? {}).filter(
        ([, value]) => ["string", "number", "boolean"].includes(typeof value) && value !== "",
      ),
    );
    await document.destroy();
    logProcessFinished("Extract PDF text", {
      pages: pageCount,
      sections: sections.length,
      metadata,
    });
    return { sections, pageCount, metadata };
  } catch (error) {
    throw new ValidationError("PDF text extraction failed.", { cause: error });
  }
}

export async function extractDocx(content) {
  logProcessStarted("Extract DOCX text", { bytes: content.length });
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer: content });
    const sections = [];
    let currentHeading = null;
    let buffer = [];
    const flush = () => {
      const text = buffer.join("\n").trim();
      if (text) {
        sections.push({
          text,
          pageNumber: null,
          metadata: currentHeading ? { heading: currentHeading } : {},
        });
      }
      buffer = [];
    };

    for (const match of html.matchAll(/<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const tag = match[1].toLowerCase();
      const text = stripTags(match[2]);
      if (!text) {
        continue;
      }
      if (tag.startsWith("h")) {
        flush();
        currentHeading = text;
      }
      buffer.push(text);
    }
    flush();

    if (sections.length === 0) {
      const { value } = await mammoth.extractRawText({ buffer: content });
      if (value.trim()) {
        sections.push({ text: value.trim(), pageNumber: null, metadata: {} });
      }
    }
    const result = { sections, pageCount: null, metadata: {} };
    logProcessFinished("Extract DOCX text", { sections: sections.length });
    return result;
  } catch (error) {
    throw new ValidationError("DOCX text extraction failed.", { cause: error });
  }
}

export function extractTxt(content) {
  logProcessStarted("Extract TXT text", { bytes: content.length });
  const text = new TextDecoder("utf-8", { fatal: true })
    .decode(content)
    .replace(/^\uFEFF/, "")
    .trim();
  const result = {
    sections: text ? [{ text, pageNumber: null, metadata: {} }] : [],
    pageCount: null,
    metadata: {},
  };
  logProcessFinished("Extract TXT text", {
    sections: result.sections.length,
    chars: text.length,
  });
  return result;
}

export async function extractDocument(filename, content) {
  logProcessStarted("Extract document", { filename, bytes: content.length });
  const extension = path.extname(filename).toLowerCase();
  let result;
  if (extension === ".pdf") {
    result = await extractPdf(content);
  } else if (extension === ".docx") {
    result = await extractDocx(content);
  } else if (extension === ".txt") {
    result = extractTxt(content);
  } else {
    throw new ValidationError("Unsupported document type.");
  }
  if (result.sections.length === 0) {
    throw new ValidationError(
      "No extractable text was found. Scanned PDFs require a separate OCR pipeline.",
    );
  }
  logProcessFinished("Extract document", {
    filename,
    extension,
    sections: result.sections.length,
    page_count: result.pageCount,
  });
  return result;
}
