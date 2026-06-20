import crypto from "node:crypto";
import path from "node:path";
import yauzl from "yauzl";
import { ValidationError } from "../errors.js";
import { log, logProcessFinished, logProcessStarted } from "../logger.js";

export const allowedTypes = Object.freeze({
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
});

const executableSignatures = [
  Buffer.from("MZ"),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
];

export function sanitizeFilename(filename) {
  const basename = path.posix.basename(String(filename).replaceAll("\\", "/"));
  const extension = path.extname(basename).toLowerCase();
  const rawStem = basename.slice(0, basename.length - extension.length);
  const stem = rawStem
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 180);
  const sanitized = `${stem || "document"}${extension}`;
  log("info", "upload_filename_sanitized", {
    message: "Upload filename sanitized.",
    original_filename: filename,
    sanitized_filename: sanitized,
  });
  return sanitized;
}

function inspectDocxArchive(content) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(content, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new ValidationError("The DOCX file is corrupted.", { cause: openError }));
        return;
      }

      let totalUncompressed = 0;
      let totalCompressed = 0;
      const names = new Set();
      let settled = false;

      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        reject(error);
      };

      zipfile.on("entry", (entry) => {
        names.add(entry.fileName);
        totalUncompressed += entry.uncompressedSize;
        totalCompressed += entry.compressedSize;
        if (
          totalUncompressed > 100 * 1024 * 1024 ||
          totalUncompressed / Math.max(1, totalCompressed) > 100
        ) {
          fail(new ValidationError("The DOCX archive has an unsafe compression ratio."));
          return;
        }
        zipfile.readEntry();
      });

      zipfile.on("end", () => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
          reject(new ValidationError("The DOCX container is invalid."));
          return;
        }
        resolve();
      });

      zipfile.on("error", (error) => {
        fail(new ValidationError("The DOCX file is corrupted.", { cause: error }));
      });

      zipfile.readEntry();
    });
  });
}

export async function validateFileContent(extension, content) {
  logProcessStarted("Validate file content", {
    extension,
    bytes: content?.length ?? 0,
  });
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw new ValidationError("The uploaded file is empty.");
  }
  if (executableSignatures.some((signature) => content.subarray(0, signature.length).equals(signature))) {
    throw new ValidationError("Executable files are not allowed.");
  }
  if (extension === ".pdf" && !content.subarray(0, 1024).toString("binary").trimStart().startsWith("%PDF-")) {
    throw new ValidationError("The file content is not a valid PDF.");
  }
  if (extension === ".docx") {
    await inspectDocxArchive(content);
  }
  if (extension === ".txt") {
    if (content.includes(0)) {
      throw new ValidationError("Binary content is not allowed in TXT files.");
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
    if (decoded.includes("\uFFFD")) {
      throw new ValidationError("TXT files must use UTF-8 encoding.");
    }
  }
  logProcessFinished("Validate file content", {
    extension,
    bytes: content.length,
  });
}

export async function validateUpload(file, { maxBytes }) {
  logProcessStarted("Validate upload", {
    original_filename: file?.originalname ?? null,
    mimetype: file?.mimetype ?? null,
    bytes: file?.size ?? 0,
    max_bytes: maxBytes,
  });
  if (!file) {
    throw new ValidationError("A file upload is required.");
  }
  if (file.size > maxBytes) {
    throw new ValidationError(`File exceeds the ${maxBytes} byte upload limit.`);
  }
  const originalFilename = file.originalname || "document";
  const safeFilename = sanitizeFilename(originalFilename);
  const extension = path.extname(safeFilename).toLowerCase();
  const contentType = allowedTypes[extension];
  if (!contentType) {
    throw new ValidationError("Only PDF, DOCX, and TXT files are supported.");
  }
  const declaredTypes = new Set([contentType, "application/octet-stream"]);
  if (file.mimetype && !declaredTypes.has(file.mimetype)) {
    throw new ValidationError("The declared file type does not match its extension.");
  }
  await validateFileContent(extension, file.buffer);
  const validated = {
    originalFilename: originalFilename.slice(0, 255),
    safeFilename,
    extension,
    contentType,
    content: file.buffer,
    checksumSha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
  };
  logProcessFinished("Validate upload", {
    original_filename: validated.originalFilename,
    safe_filename: validated.safeFilename,
    extension: validated.extension,
    content_type: validated.contentType,
    bytes: validated.content.length,
    checksum_sha256: validated.checksumSha256,
  });
  return validated;
}
