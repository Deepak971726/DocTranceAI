import { config } from "../config.js";
import { VectorDatabaseError } from "../errors.js";
import { log, logProcessFailed } from "../logger.js";

async function qdrantRequest(path, options = {}) {
  const started = performance.now();
  const method = options.method ?? "GET";
  log("info", "qdrant_request_started", {
    message: `Qdrant request started: ${method} ${path}`,
    method,
    path,
    body: qdrantBodyForLog(options.body),
  });
  const headers = {
    "Content-Type": "application/json",
    ...(config.qdrantApiKey ? { "api-key": config.qdrantApiKey } : {}),
    ...options.headers,
  };
  try {
    const response = await fetch(`${config.qdrantUrl}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 60000),
    });
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Qdrant ${response.status}: ${body.slice(0, 500)}`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) {
      log("info", "qdrant_request_finished", {
        message: `Qdrant request finished: ${method} ${path} -> ${response.status}`,
        method,
        path,
        status_code: response.status,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
      });
      return null;
    }
    const payload = await response.json();
    log("info", "qdrant_request_finished", {
      message: `Qdrant request finished: ${method} ${path} -> ${response.status}`,
      method,
      path,
      status_code: response.status,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
      response: qdrantResponseForLog(payload),
    });
    return payload;
  } catch (error) {
    if (options.allowNotFound && error?.status === 404) {
      log("warn", "qdrant_request_not_found_allowed", {
        message: `Qdrant request returned 404 and was allowed: ${method} ${path}`,
        method,
        path,
      });
      return null;
    }
    logProcessFailed("Qdrant request", error, {
      method,
      path,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    });
    throw new VectorDatabaseError(undefined, { cause: error });
  }
}

function qdrantBodyForLog(rawBody) {
  if (!rawBody) {
    return "(empty)";
  }
  try {
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    if (Array.isArray(body?.query)) {
      return {
        ...body,
        query: `<vector ${body.query.length} dimensions>`,
      };
    }
    if (Array.isArray(body?.points)) {
      return {
        ...body,
        points: body.points.map((point) => ({
          id: point.id,
          vector: Array.isArray(point.vector)
            ? `<vector ${point.vector.length} dimensions>`
            : point.vector,
          payload: point.payload,
        })),
      };
    }
    return body;
  } catch {
    return rawBody;
  }
}

function qdrantResponseForLog(payload) {
  if (Array.isArray(payload?.result?.points)) {
    return {
      points: payload.result.points.length,
      scores: payload.result.points.map((point) => point.score),
    };
  }
  if (Array.isArray(payload?.result)) {
    return { result_items: payload.result.length };
  }
  return payload;
}

export class QdrantVectorStore {
  async ensureCollection() {
    const collectionPath = `/collections/${encodeURIComponent(config.qdrantCollection)}`;
    const existing = await qdrantRequest(collectionPath, {
      method: "GET",
      allowNotFound: true,
    });
    if (existing) {
      return;
    }
    await qdrantRequest(collectionPath, {
      method: "PUT",
      body: JSON.stringify({
        vectors: { size: config.embeddingDimensions, distance: "Cosine" },
        hnsw_config: { payload_m: 16 },
        on_disk_payload: true,
      }),
    });
    for (const fieldName of ["user_id", "document_id"]) {
      await qdrantRequest(`${collectionPath}/index?wait=true`, {
        method: "PUT",
        body: JSON.stringify({ field_name: fieldName, field_schema: "keyword" }),
      });
    }
  }

  async upsertChunks({ chunks, vectors, filename, createdAt }) {
    if (chunks.length !== vectors.length) {
      throw new VectorDatabaseError("Chunk and vector counts do not match.");
    }
    await qdrantRequest(
      `/collections/${encodeURIComponent(config.qdrantCollection)}/points?wait=true`,
      {
        method: "PUT",
        body: JSON.stringify({
          points: chunks.map((chunk, index) => ({
            id: chunk.qdrant_point_id,
            vector: vectors[index],
            payload: {
              user_id: chunk.user_id,
              document_id: chunk.document_id,
              chunk_id: chunk.id,
              chunk_index: chunk.chunk_index,
              page_number: chunk.page_number,
              chunk_text: chunk.chunk_text,
              filename,
              created_at: new Date(createdAt).toISOString(),
            },
          })),
        }),
      },
    );
  }

  async search({ userId, queryVector, documentIds, topK, scoreThreshold }) {
    const must = [{ key: "user_id", match: { value: String(userId) } }];
    if (documentIds?.length) {
      must.push({ key: "document_id", match: { any: documentIds.map(String) } });
    }
    const response = await qdrantRequest(
      `/collections/${encodeURIComponent(config.qdrantCollection)}/points/query`,
      {
        method: "POST",
        body: JSON.stringify({
          query: queryVector,
          filter: { must },
          limit: topK,
          score_threshold: scoreThreshold,
          with_payload: true,
          with_vector: false,
        }),
      },
    );
    return (response?.result?.points ?? response?.result ?? []).map((point) => ({
      pointId: point.id,
      score: Number(point.score),
      payload: point.payload ?? {},
    }));
  }

  async deleteDocument({ userId, documentId }) {
    await qdrantRequest(
      `/collections/${encodeURIComponent(config.qdrantCollection)}/points/delete?wait=true`,
      {
        method: "POST",
        body: JSON.stringify({
          filter: {
            must: [
              { key: "user_id", match: { value: String(userId) } },
              { key: "document_id", match: { value: String(documentId) } },
            ],
          },
        }),
      },
    );
  }

  async ready() {
    await qdrantRequest("/collections", { method: "GET", timeoutMs: 5000 });
  }
}

export const vectorStore = new QdrantVectorStore();
