import { config } from "../config.js";
import { AIServiceError } from "../errors.js";
import { log, logProcessFailed } from "../logger.js";

async function ollamaFetch(path, options) {
  const started = performance.now();
  const method = options?.method ?? "GET";
  log("info", "ollama_request_started", {
    message: `Ollama request started: ${method} ${path}`,
    method,
    path,
    body: ollamaBodyForLog(options?.body),
  });
  try {
    const response = await fetch(`${config.ollamaBaseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
      signal: AbortSignal.timeout(config.ollamaRequestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    log("info", "ollama_request_finished", {
      message: `Ollama request finished: ${method} ${path} -> ${response.status}`,
      method,
      path,
      status_code: response.status,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    });
    return response;
  } catch (error) {
    logProcessFailed("Ollama request", error, {
      method,
      path,
      duration_ms: Math.round((performance.now() - started) * 100) / 100,
    });
    throw new AIServiceError("The AI service request failed.", { cause: error });
  }
}

function ollamaBodyForLog(rawBody) {
  if (!rawBody) {
    return "(empty)";
  }
  try {
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    if (Array.isArray(body?.input)) {
      return {
        ...body,
        input_count: body.input.length,
        input_preview: body.input.slice(0, 3),
        input: `<${body.input.length} embedding inputs>`,
      };
    }
    return body;
  } catch {
    return rawBody;
  }
}

export class OllamaEmbeddingProvider {
  get dimensions() {
    return config.embeddingDimensions;
  }

  async embedDocuments(texts) {
    return this.#embed(texts);
  }

  async embedQuery(text) {
    const [vector] = await this.#embed([text]);
    return vector;
  }

  async #embed(texts) {
    if (texts.length === 0) {
      return [];
    }
    log("info", "ollama_embedding_started", {
      message: "Ollama embedding started.",
      model: config.embeddingModel,
      texts: texts.length,
      dimensions: this.dimensions,
      preview: texts.slice(0, 3),
    });
    const response = await ollamaFetch("/api/embed", {
      method: "POST",
      body: JSON.stringify({
        model: config.embeddingModel,
        input: texts,
        truncate: true,
        dimensions: this.dimensions,
      }),
    });
    const payload = await response.json();
    const vectors = payload.embeddings ?? [];
    if (
      vectors.length !== texts.length ||
      vectors.some((vector) => vector.length !== this.dimensions)
    ) {
      throw new AIServiceError("Embedding provider returned an unexpected vector shape.", {
        details: { expected_dimensions: this.dimensions },
      });
    }
    log("info", "ollama_embedding_finished", {
      message: "Ollama embedding finished.",
      model: config.embeddingModel,
      vectors: vectors.length,
      dimensions: vectors[0]?.length ?? 0,
    });
    return vectors;
  }
}

export class OllamaChatService {
  get modelName() {
    return config.ollamaChatModel;
  }

  payload(systemPrompt, userPrompt, stream, { numPredict = 256, jsonMode = false } = {}) {
    const payload = {
      model: this.modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream,
      think: false,
      keep_alive: config.ollamaKeepAlive,
      options: {
        temperature: 0.1,
        top_p: 0.9,
        num_predict: numPredict,
        num_ctx: config.ollamaContextTokens,
      },
    };
    if (jsonMode) {
      payload.format = "json";
    }
    return payload;
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    log("info", "ollama_chat_generation_started", {
      message: "Ollama chat generation started.",
      model: this.modelName,
      stream: false,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      options,
    });
    const response = await ollamaFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify(this.payload(systemPrompt, userPrompt, false, options)),
    });
    const payload = await response.json();
    const content = payload?.message?.content;
    if (!content?.trim()) {
      throw new AIServiceError("The language model returned an empty response.");
    }
    log("info", "ollama_chat_generation_finished", {
      message: "Ollama chat generation finished.",
      model: this.modelName,
      content: content.trim(),
    });
    return content.trim();
  }

  async *stream(systemPrompt, userPrompt) {
    log("info", "ollama_chat_stream_started", {
      message: "Ollama chat stream started.",
      model: this.modelName,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
    });
    const response = await ollamaFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify(this.payload(systemPrompt, userPrompt, true)),
    });
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        let payload;
        try {
          payload = JSON.parse(line);
        } catch (error) {
          throw new AIServiceError("The AI service returned malformed streaming data.", {
            cause: error,
          });
        }
        if (payload?.message?.content) {
          log("info", "ollama_chat_stream_fragment", {
            message: "Ollama chat stream fragment received.",
            model: this.modelName,
            fragment_chars: payload.message.content.length,
            fragment: payload.message.content,
          });
          yield payload.message.content;
        }
      }
    }
    log("info", "ollama_chat_stream_finished", {
      message: "Ollama chat stream finished.",
      model: this.modelName,
    });
  }

  async ready() {
    log("info", "ollama_readiness_probe_started", {
      message: "Ollama readiness probe started.",
    });
    await ollamaFetch("/api/tags", { method: "GET" });
    log("info", "ollama_readiness_probe_finished", {
      message: "Ollama readiness probe finished.",
    });
  }
}

export const embeddings = new OllamaEmbeddingProvider();
export const llm = new OllamaChatService();
