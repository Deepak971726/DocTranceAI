import { FAQ_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT } from "../constants/prompts.js";
import { withTransaction } from "../db.js";
import { AIServiceError, NotFoundError, ValidationError } from "../errors.js";
import { llm } from "../integrations/ollama.js";
import { log, logProcessFinished, logProcessStarted } from "../logger.js";
import { getSubscription, incrementUsage } from "../repositories/account.js";
import { getDocument, listDocumentChunks } from "../repositories/documents.js";

export function formatContext(chunks) {
  return chunks
    .map(
      (chunk) =>
        `[C${chunk.chunk_index + 1}] Page ${chunk.page_number ?? "N/A"}; Chunk ${
          chunk.chunk_index
        }\n${chunk.chunk_text}`,
    )
    .join("\n\n");
}

export function contextBatches(chunks, maxChars) {
  const batches = [];
  let current = [];
  let currentSize = 0;
  for (const chunk of chunks) {
    if (current.length > 0 && currentSize + chunk.chunk_text.length > maxChars) {
      batches.push(formatContext(current));
      current = [];
      currentSize = 0;
    }
    current.push(chunk);
    currentSize += chunk.chunk_text.length;
  }
  if (current.length > 0) {
    batches.push(formatContext(current));
  }
  return batches;
}

export function sampleChunks(chunks, limit) {
  if (chunks.length <= limit) {
    return chunks;
  }
  const step = (chunks.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => chunks[Math.round(index * step)]);
}

export function parseJsonObject(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new AIServiceError("The AI service returned non-JSON FAQ data.");
  }
  try {
    const payload = JSON.parse(cleaned.slice(start, end + 1));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("FAQ payload is not an object");
    }
    return payload;
  } catch (error) {
    throw new AIServiceError("The AI service returned malformed FAQ JSON.", { cause: error });
  }
}

export function parseFaqItems(payload) {
  const rawItems = payload.faqs ?? payload.faq ?? payload.questions;
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const items = [];
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      continue;
    }
    const question = String(rawItem.question ?? rawItem.q ?? "").trim();
    const answer = String(rawItem.answer ?? rawItem.a ?? "").trim();
    if (!question || !answer) {
      continue;
    }
    const rawCitations =
      rawItem.citations ?? rawItem.citation ?? rawItem.references ?? [];
    let citations = [];
    if (typeof rawCitations === "string") {
      citations = rawCitations.match(/C\d+/gi) ?? [];
    } else if (Array.isArray(rawCitations)) {
      citations = rawCitations
        .map((value) => String(value).replace(/^\[|\]$/g, "").trim())
        .filter(Boolean)
        .map((value) => (/^\d+$/.test(value) ? `C${value}` : value));
    }
    if (citations.length === 0) {
      citations = answer.match(/C\d+/gi) ?? [];
    }
    items.push({ question, answer, citations: [...new Set(citations)] });
  }
  return items;
}

function tokenSet(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export function groundFaq(faq, chunks) {
  const validReferences = new Set(chunks.map((chunk) => `C${chunk.chunk_index + 1}`));
  let citations = faq.citations
    .map((citation) => citation.toUpperCase())
    .filter((citation) => validReferences.has(citation));
  if (citations.length === 0) {
    const queryTokens = tokenSet(`${faq.question} ${faq.answer}`);
    let bestChunk = chunks[0];
    let bestScore = -1;
    for (const chunk of chunks) {
      const chunkTokens = tokenSet(chunk.chunk_text);
      const score = [...queryTokens].filter((token) => chunkTokens.has(token)).length;
      if (score > bestScore) {
        bestChunk = chunk;
        bestScore = score;
      }
    }
    citations = [`C${bestChunk.chunk_index + 1}`];
  }
  const answer = /\[C\d+\]/i.test(faq.answer)
    ? faq.answer
    : `${faq.answer.replace(/\s+$/, "")} [${citations[0]}]`;
  return { question: faq.question, answer, citations: [...new Set(citations)] };
}

export function fallbackFaqs(chunks, seenQuestions, target) {
  const templates = [
    "What information is provided in {reference}?",
    "What key detail appears in {reference}?",
    "How can {reference} be summarized?",
    "Which fact is supported by {reference}?",
    "What does {reference} explain?",
    "What can be learned from {reference}?",
    "Which point is documented in {reference}?",
    "What evidence appears in {reference}?",
    "What is stated in {reference}?",
    "What should readers know from {reference}?",
    "What topic is covered in {reference}?",
    "Which insight comes from {reference}?",
    "What conclusion is supported by {reference}?",
    "What detail can be cited from {reference}?",
    "How does {reference} inform the reader?",
    "What claim appears in {reference}?",
    "Which idea is described in {reference}?",
    "What useful context comes from {reference}?",
    "What source detail is found in {reference}?",
    "Which documented point appears in {reference}?",
  ];
  const items = [];
  for (const template of templates) {
    for (const chunk of chunks) {
      const reference = `C${chunk.chunk_index + 1}`;
      const question = template.replace("{reference}", reference);
      const normalized = question.toLowerCase().replace(/\s+/g, " ");
      if (seenQuestions.has(normalized)) {
        continue;
      }
      const text = chunk.chunk_text.replace(/\s+/g, " ").trim();
      const sentence = (text.split(/(?<=[.!?])\s+/, 1)[0] ?? "").slice(0, 180).trim();
      if (!sentence) {
        continue;
      }
      seenQuestions.add(normalized);
      items.push({
        question,
        answer: `${sentence} [${reference}]`,
        citations: [reference],
      });
      if (items.length === target) {
        return items;
      }
    }
  }
  return items;
}

async function readyDocumentChunks(userId, documentId) {
  return withTransaction(
    async (client) => {
      const document = await getDocument(client, userId, documentId);
      if (!document) {
        throw new NotFoundError("Document not found.");
      }
      if (document.status !== "READY") {
        throw new ValidationError("Document must be READY before generation.");
      }
      const chunks = await listDocumentChunks(client, userId, documentId);
      if (chunks.length === 0) {
        throw new ValidationError("Document has no searchable content.");
      }
      return { document, chunks };
    },
    { userId },
  );
}

export class DocumentGenerationService {
  async summary(userId, documentId) {
    logProcessStarted("Generate document summary", {
      user_id: userId,
      document_id: documentId,
    });
    const { document, chunks } = await readyDocumentChunks(userId, documentId);
    const batches = contextBatches(chunks, 12000);
    log("info", "summary_context_prepared", {
      message: "Summary context prepared.",
      user_id: userId,
      document_id: documentId,
      chunks: chunks.length,
      batches: batches.length,
    });
    const partials = [];
    for (const [index, context] of batches.entries()) {
      log("info", "summary_batch_generation_started", {
        message: "Summary batch generation started.",
        user_id: userId,
        document_id: documentId,
        batch_index: index,
        batch_chars: context.length,
      });
      partials.push(
        await llm.generate(
          SUMMARY_SYSTEM_PROMPT,
          `Summarize this section of ${document.filename}:\n\n${context}`,
          { numPredict: 320 },
        ),
      );
      log("info", "summary_batch_generation_finished", {
        message: "Summary batch generation finished.",
        user_id: userId,
        document_id: documentId,
        batch_index: index,
      });
    }
    const content =
      partials.length === 1
        ? partials[0]
        : await llm.generate(
            SUMMARY_SYSTEM_PROMPT,
            `Combine these grounded partial summaries without adding facts:\n\n${partials.join(
              "\n\n---\n\n",
            )}`,
            { numPredict: 320 },
          );
    const citations = chunks.slice(0, 100).map((chunk) => ({
      reference: `C${chunk.chunk_index + 1}`,
      document_id: document.id,
      document_name: document.filename,
      page_number: chunk.page_number,
      chunk_id: chunk.id,
      chunk_index: chunk.chunk_index,
      score: null,
      excerpt: chunk.chunk_text.slice(0, 500),
    }));
    await withTransaction(
      (client) =>
        incrementUsage(client, userId, {
          aiRequests: batches.length + (partials.length > 1 ? 1 : 0),
        }),
      { userId },
    );
    logProcessFinished("Generate document summary", {
      user_id: userId,
      document_id: document.id,
      citations: citations.length,
      ai_requests: batches.length + (partials.length > 1 ? 1 : 0),
    });
    return { document_id: document.id, content, citations };
  }

  async faqs(userId, documentId) {
    logProcessStarted("Generate document FAQs", {
      user_id: userId,
      document_id: documentId,
    });
    const { document, chunks } = await readyDocumentChunks(userId, documentId);
    const context = formatContext(sampleChunks(chunks, 40));
    log("info", "faq_context_prepared", {
      message: "FAQ context prepared.",
      user_id: userId,
      document_id: documentId,
      sampled_chunks: sampleChunks(chunks, 40).length,
      context_chars: context.length,
    });
    let batch = [];
    try {
      const raw = await llm.generate(
        FAQ_SYSTEM_PROMPT,
        `Document: ${document.filename}\n\nGenerate exactly 20 new FAQs.\n\nContext:\n${context}`,
        { numPredict: 700, jsonMode: true },
      );
      batch = parseFaqItems(parseJsonObject(raw));
      log("info", "faq_model_batch_parsed", {
        message: "FAQ model batch parsed.",
        user_id: userId,
        document_id: documentId,
        parsed_items: batch.length,
      });
    } catch (error) {
      if (!(error instanceof AIServiceError)) {
        throw error;
      }
      log("warn", "faq_model_batch_parse_failed", {
        message: "FAQ model response could not be parsed; fallback FAQs will be used.",
        user_id: userId,
        document_id: documentId,
        error: error.message,
      });
    }
    const faqs = [];
    const seenQuestions = new Set();
    for (const item of batch) {
      const faq = groundFaq(item, chunks);
      const normalized = faq.question.toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalized || seenQuestions.has(normalized)) {
        continue;
      }
      seenQuestions.add(normalized);
      faqs.push(faq);
      if (faqs.length === 20) {
        break;
      }
    }
    if (faqs.length < 20) {
      faqs.push(...fallbackFaqs(chunks, seenQuestions, 20 - faqs.length));
    }
    if (faqs.length !== 20) {
      throw new AIServiceError("Unable to build exactly 20 grounded FAQs.");
    }
    await withTransaction(
      (client) => incrementUsage(client, userId, { aiRequests: 1 }),
      { userId },
    );
    logProcessFinished("Generate document FAQs", {
      user_id: userId,
      document_id: document.id,
      faqs: faqs.length,
    });
    return { document_id: document.id, faqs: faqs.slice(0, 20) };
  }
}

export const generationService = new DocumentGenerationService();
