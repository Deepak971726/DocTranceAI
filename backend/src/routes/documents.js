import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { withTransaction } from "../db.js";
import { NotFoundError } from "../errors.js";
import { requireUser } from "../middleware/auth.js";
import { integerQuery, requireUuid, validateBody } from "../middleware/validation.js";
import {
  getDocument,
  listDocuments,
  publicDocument,
} from "../repositories/documents.js";
import { searchSchema } from "../schemas.js";
import { documentProcessor, documentService } from "../services/documents.js";
import { generationService } from "../services/generation.js";
import { ragService } from "../services/rag.js";
import { validateUpload } from "../utils/files.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

router.use(requireUser);

router.post("/upload", upload.single("file"), async (req, res) => {
  const validated = await validateUpload(req.file, { maxBytes: config.maxUploadBytes });
  const document = await documentService.upload({
    userId: req.user.id,
    upload: validated,
    requestId: req.requestId,
  });
  res.status(202).json({
    document,
    message: "Upload accepted and document processing started.",
  });
  setImmediate(() => {
    documentProcessor.processOne(document.id).catch(() => undefined);
  });
});

router.get("/", async (req, res) => {
  const limit = integerQuery(req.query.limit, {
    defaultValue: 20,
    min: 1,
    max: 100,
    name: "limit",
  });
  const offset = integerQuery(req.query.offset, {
    defaultValue: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    name: "offset",
  });
  const page = await withTransaction(
    (client) => listDocuments(client, req.user.id, { limit, offset }),
    { userId: req.user.id },
  );
  res.json({
    items: page.items.map(publicDocument),
    total: page.total,
    limit,
    offset,
  });
});

router.post("/search/semantic", validateBody(searchSchema), async (req, res) => {
  const result = await ragService.retrieve({
    userId: req.user.id,
    query: req.validatedBody.query,
    documentIds: req.validatedBody.document_ids,
    topK: req.validatedBody.top_k,
  });
  res.json(result.citations);
});

router.get("/:documentId", async (req, res) => {
  const documentId = requireUuid(req.params.documentId, "document_id");
  const document = await withTransaction(
    (client) => getDocument(client, req.user.id, documentId),
    { userId: req.user.id },
  );
  if (!document) {
    throw new NotFoundError("Document not found.");
  }
  res.json(publicDocument(document));
});

router.delete("/:documentId", async (req, res) => {
  const documentId = requireUuid(req.params.documentId, "document_id");
  await documentService.delete({
    userId: req.user.id,
    documentId,
    requestId: req.requestId,
  });
  res.json({ message: "Document deleted." });
});

router.post("/:documentId/summary", async (req, res) => {
  res.json(
    await generationService.summary(
      req.user.id,
      requireUuid(req.params.documentId, "document_id"),
    ),
  );
});

router.post("/:documentId/faqs", async (req, res) => {
  res.json(
    await generationService.faqs(
      req.user.id,
      requireUuid(req.params.documentId, "document_id"),
    ),
  );
});

export default router;
