import { config } from "./config.js";
import { closeDatabase } from "./db.js";
import { documentProcessor } from "./services/documents.js";
import { log, logProcessFailed } from "./logger.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

log("info", "document_worker_started");
while (!stopping) {
  try {
    const processed = await documentProcessor.processOne();
    if (!processed) {
      await wait(config.workerPollMs);
    }
  } catch (error) {
    logProcessFailed("Document worker iteration", error);
    await wait(config.workerPollMs);
  }
}
await closeDatabase();
log("info", "document_worker_stopped");
