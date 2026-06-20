import crypto from "node:crypto";
import { config } from "../config.js";
import { withTransaction } from "../db.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { embeddings } from "../integrations/ollama.js";
import { vectorStore } from "../integrations/qdrant.js";
import { storage } from "../integrations/storage.js";
import { log, logProcessFailed, logProcessFinished, logProcessStarted } from "../logger.js";
import { getSubscription, incrementUsage, recordAudit } from "../repositories/account.js";
import {
  claimDocument,
  createDocument,
  getDocument,
  markDocumentFailed,
  markDocumentProcessing,
  markDocumentReady,
  publicDocument,
  releaseDocumentForRetry,
  replaceDocumentChunks,
  softDeleteDocument,
  totalStorageBytes,
} from "../repositories/documents.js";
import { DocumentChunker } from "./chunking.js";
import { extractDocument } from "./extraction.js";

export class DocumentService {
  async upload({ userId, upload, requestId }) {
    logProcessStarted("Upload document", {
      user_id: userId,
      original_filename: upload.originalFilename,
      safe_filename: upload.safeFilename,
      bytes: upload.content.length,
    });
    const documentId = crypto.randomUUID();
    const storagePath = `${userId}/${documentId}/${crypto.randomBytes(16).toString("hex")}-${upload.safeFilename}`;

    const document = await withTransaction(
      async (client) => {
        const subscription = await getSubscription(client, userId, { forUpdate: true });
        const storageLimit = Number(subscription?.usage_limits?.storage_bytes ?? 100 * 1024 * 1024);
        const currentStorage = await totalStorageBytes(client, userId);
        if (currentStorage + upload.content.length > storageLimit) {
          throw new ValidationError("Your plan's storage limit has been reached.");
        }
        log("info", "document_upload_storage_limit_checked", {
          message: "Document upload storage limit checked.",
          user_id: userId,
          current_storage_bytes: currentStorage,
          upload_bytes: upload.content.length,
          storage_limit_bytes: storageLimit,
        });
        return createDocument(client, {
          id: documentId,
          userId,
          filename: upload.safeFilename,
          originalFilename: upload.originalFilename,
          contentType: upload.contentType,
          fileSize: upload.content.length,
          checksumSha256: upload.checksumSha256,
          storageBucket: config.supabaseStorageBucket,
          storagePath,
          status: "UPLOADING",
        });
      },
      { userId },
    );

    try {
      log("info", "document_storage_upload_started", {
        message: "Document bytes upload to private storage started.",
        document_id: documentId,
        user_id: userId,
        bucket: document.storage_bucket,
        path: document.storage_path,
        bytes: upload.content.length,
      });
      await storage.upload({
        bucket: document.storage_bucket,
        path: document.storage_path,
        content: upload.content,
        contentType: document.content_type,
      });
      log("info", "document_storage_upload_finished", {
        message: "Document bytes uploaded to private storage.",
        document_id: documentId,
        user_id: userId,
      });
      const processing = await withTransaction(
        async (client) => {
          const current = await getDocument(client, userId, documentId, { forUpdate: true });
          if (!current) {
            throw new NotFoundError("Document record disappeared during upload.");
          }
          const updated = await markDocumentProcessing(client, documentId);
          await incrementUsage(client, userId, {
            documentsUploaded: 1,
            storageBytes: Number(document.file_size),
          });
          await recordAudit(client, {
            userId,
            action: "document.uploaded",
            resourceType: "document",
            resourceId: documentId,
            requestId,
            metadata: { filename: document.filename, bytes: Number(document.file_size) },
          });
          return updated;
        },
        { userId },
      );
      logProcessFinished("Upload document", {
        document_id: documentId,
        user_id: userId,
        status: processing.status,
      });
      return publicDocument(processing);
    } catch (error) {
      logProcessFailed("Upload document", error, {
        document_id: documentId,
        user_id: userId,
      });
      await withTransaction(
        async (client) => {
          const current = await getDocument(client, userId, documentId, { forUpdate: true });
          if (current) {
            await markDocumentFailed(client, documentId, "Storage upload failed.");
          }
        },
        { userId },
      ).catch(() => undefined);
      throw error;
    }
  }

  async delete({ userId, documentId, requestId }) {
    logProcessStarted("Delete document", { user_id: userId, document_id: documentId });
    const document = await withTransaction(
      async (client) => {
        const result = await getDocument(client, userId, documentId, { forUpdate: true });
        if (!result) {
          throw new NotFoundError("Document not found.");
        }
        return result;
      },
      { userId },
    );
    await storage.delete({ bucket: document.storage_bucket, path: document.storage_path });
    await vectorStore.deleteDocument({ userId, documentId });
    await withTransaction(
      async (client) => {
        await softDeleteDocument(client, documentId);
        await recordAudit(client, {
          userId,
          action: "document.deleted",
          resourceType: "document",
          resourceId: documentId,
          requestId,
        });
      },
      { userId },
    );
    logProcessFinished("Delete document", { user_id: userId, document_id: documentId });
  }
}

export class DocumentProcessor {
  constructor() {
    this.chunker = new DocumentChunker(config.chunkSize, config.chunkOverlap);
  }

  async processOne(documentId = null) {
    const claimed = await withTransaction((client) =>
      claimDocument(client, {
        documentId,
        staleMinutes: config.workerStaleMinutes,
        maxRetries: config.workerMaxRetries,
      }),
    );
    if (!claimed) {
      return false;
    }

    logProcessStarted("Process document", {
      document_id: claimed.id,
      user_id: claimed.user_id,
      retry_count: claimed.retry_count,
    });
    try {
      log("info", "document_processing_download_started", {
        message: "Document processing download started.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        bucket: claimed.storage_bucket,
        path: claimed.storage_path,
      });
      const content = await storage.download({
        bucket: claimed.storage_bucket,
        path: claimed.storage_path,
      });
      log("info", "document_processing_download_finished", {
        message: "Document processing download finished.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        bytes: content.length,
      });
      const extraction = await extractDocument(claimed.filename, content);
      log("info", "document_text_extracted", {
        message: "Document text extracted.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        sections: extraction.sections.length,
        page_count: extraction.pageCount,
        metadata: extraction.metadata,
      });
      const textChunks = this.chunker.split(extraction.sections);
      log("info", "document_chunks_created", {
        message: "Document chunks created.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        chunks: textChunks.length,
        chunk_size: config.chunkSize,
        chunk_overlap: config.chunkOverlap,
      });
      if (textChunks.length === 0) {
        throw new ValidationError("No chunks were produced from this document.");
      }
      const vectors = await embeddings.embedDocuments(textChunks.map((chunk) => chunk.chunkText));
      log("info", "document_embeddings_created", {
        message: "Document embeddings created.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        vectors: vectors.length,
        dimensions: vectors[0]?.length ?? 0,
      });
      const rows = await withTransaction(
        async (client) => {
          const current = await getDocument(client, claimed.user_id, claimed.id, {
            forUpdate: true,
          });
          if (!current) {
            return [];
          }
          return replaceDocumentChunks(client, current, textChunks);
        },
        { userId: claimed.user_id },
      );
      log("info", "document_chunks_saved", {
        message: "Document chunks saved to PostgreSQL.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        chunks: rows.length,
      });
      if (rows.length === 0) {
        return true;
      }
      await vectorStore.ensureCollection();
      await vectorStore.deleteDocument({ userId: claimed.user_id, documentId: claimed.id });
      await vectorStore.upsertChunks({
        chunks: rows,
        vectors,
        filename: claimed.filename,
        createdAt: claimed.created_at,
      });
      log("info", "document_vectors_saved", {
        message: "Document vectors saved to Qdrant.",
        document_id: claimed.id,
        user_id: claimed.user_id,
        vectors: rows.length,
      });
      await withTransaction(
        (client) =>
          markDocumentReady(client, claimed.id, {
            pageCount: extraction.pageCount,
            chunkCount: rows.length,
            metadata: extraction.metadata,
          }),
        { userId: claimed.user_id },
      );
      logProcessFinished("Process document", {
        document_id: claimed.id,
        user_id: claimed.user_id,
        chunks: rows.length,
      });
    } catch (error) {
      logProcessFailed("Process document", error, {
        document_id: claimed.id,
        user_id: claimed.user_id,
      });
      await withTransaction(
        async (client) => {
          const current = await getDocument(client, claimed.user_id, claimed.id, {
            forUpdate: true,
          });
          if (!current) {
            return;
          }
          const safeError = `${error.constructor?.name ?? "Error"}: ${error.message}`;
          if (current.retry_count >= config.workerMaxRetries) {
            await markDocumentFailed(client, claimed.id, safeError);
          } else {
            await releaseDocumentForRetry(client, claimed.id, safeError);
          }
        },
        { userId: claimed.user_id },
      );
    }
    return true;
  }
}

export const documentService = new DocumentService();
export const documentProcessor = new DocumentProcessor();
