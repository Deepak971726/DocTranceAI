import { config } from "../config.js";
import { RAG_SYSTEM_PROMPT, RAG_USER_PROMPT } from "../constants/prompts.js";
import { embeddings, llm } from "../integrations/ollama.js";
import { vectorStore } from "../integrations/qdrant.js";
import { log, logProcessFinished, logProcessStarted } from "../logger.js";

export class RAGService {
  async retrieve({ userId, query, documentIds, topK = config.ragTopK }) {
    logProcessStarted("Retrieve RAG context", {
      user_id: userId,
      query,
      document_ids: documentIds ?? null,
      top_k: topK,
      score_threshold: config.ragScoreThreshold,
    });
    const queryVector = await embeddings.embedQuery(query);
    log("info", "rag_query_embedding_created", {
      message: "RAG query embedding created.",
      user_id: userId,
      dimensions: queryVector.length,
    });
    const hits = await vectorStore.search({
      userId,
      queryVector,
      documentIds,
      topK,
      scoreThreshold: config.ragScoreThreshold,
    });
    log("info", "rag_vector_hits_received", {
      message: "RAG vector search hits received.",
      user_id: userId,
      hits: hits.length,
      scores: hits.map((hit) => hit.score),
    });
    const citations = [];
    const contextBlocks = [];
    for (const [index, hit] of hits.entries()) {
      const reference = `C${index + 1}`;
      const text = String(hit.payload.chunk_text ?? "");
      const citation = {
        reference,
        document_id: String(hit.payload.document_id),
        document_name: String(hit.payload.filename ?? "Unknown document"),
        page_number:
          hit.payload.page_number === null || hit.payload.page_number === undefined
            ? null
            : Number(hit.payload.page_number),
        chunk_id: String(hit.payload.chunk_id),
        chunk_index: Number(hit.payload.chunk_index ?? 0),
        score: Number(hit.score),
        excerpt: text.slice(0, 500),
      };
      citations.push(citation);
      contextBlocks.push(
        `[${reference}] Document: ${citation.document_name}; Page: ${
          citation.page_number ?? "N/A"
        }; Chunk: ${citation.chunk_index}\n${text}`,
      );
    }
    logProcessFinished("Retrieve RAG context", {
      user_id: userId,
      citations: citations.length,
      context_chars: contextBlocks.join("\n\n").length,
    });
    return { context: contextBlocks.join("\n\n"), citations };
  }

  async answer({ question, retrieval }) {
    logProcessStarted("Generate RAG answer", {
      question,
      citations: retrieval.citations.length,
      context_chars: retrieval.context.length,
    });
    if (retrieval.citations.length === 0) {
      const fallback = "I could not find enough information in the selected documents.";
      logProcessFinished("Generate RAG answer", { answer: fallback });
      return fallback;
    }
    const answer = await llm.generate(
      RAG_SYSTEM_PROMPT,
      RAG_USER_PROMPT({ question, context: retrieval.context }),
    );
    logProcessFinished("Generate RAG answer", { answer });
    return answer;
  }
}

export const ragService = new RAGService();
