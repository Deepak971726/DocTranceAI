import assert from "node:assert/strict";
import test from "node:test";
import { OllamaChatService, OllamaEmbeddingProvider } from "../src/integrations/ollama.js";

test("default AI providers use local Ollama without an API key", () => {
  const provider = new OllamaEmbeddingProvider();
  assert.equal(provider.dimensions, 768);
  assert.equal(new OllamaChatService().modelName, "llama3:latest");
});

test("chat requests disable hidden reasoning and preserve generation options", () => {
  const service = new OllamaChatService();
  const payload = service.payload("system", "user", true);
  assert.equal(payload.think, false);
  assert.equal(payload.keep_alive, "30m");
  assert.equal(payload.options.num_ctx, 2048);
  assert.equal(payload.options.num_predict, 256);

  const longPayload = service.payload("system", "user", false, {
    numPredict: 2048,
    jsonMode: true,
  });
  assert.equal(longPayload.options.num_predict, 2048);
  assert.equal(longPayload.format, "json");
});
