import { app } from "./app.js";
import { config } from "./config.js";
import { closeDatabase, pool } from "./db.js";
import { llm } from "./integrations/ollama.js";
import { vectorStore } from "./integrations/qdrant.js";
import { log, logProcessFailed } from "./logger.js";

async function probeDependencies() {
  const probes = [
    ["postgres", () => pool.query("SELECT 1")],
    ["qdrant", () => vectorStore.ensureCollection()],
    ["ollama", () => llm.ready()],
  ];
  for (const [name, probe] of probes) {
    try {
      await probe();
      log("info", `probe_${name}_ok`);
    } catch (error) {
      logProcessFailed(`Probe ${name}`, error);
    }
  }
}

const server = app.listen(config.port, "0.0.0.0", () => {
  log("info", "app_ready", {
    port: config.port,
    environment: config.appEnv,
    api_prefix: config.apiV1Prefix,
  });
  probeDependencies().catch((error) => logProcessFailed("Startup probes", error));
});

async function shutdown(signal) {
  log("info", "app_shutting_down", { signal });
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
