type ProcessContext = object;

export function logProcessStarted(process: string, context: ProcessContext = {}) {
  console.info(`[DocTraceAI] process_started | ${process} process started.`, {
    process,
    status: "started",
    message: `${process} process started.`,
    ...context,
  });
}

export function logProcessFinished(process: string, context: ProcessContext = {}) {
  console.info(
    `[DocTraceAI] process_finished_successfully | ${process} process finished successfully.`,
    {
      process,
      status: "success",
      message: `${process} process finished successfully.`,
      ...context,
    },
  );
}

export function logProcessFailed(process: string, context: ProcessContext = {}) {
  console.error(`[DocTraceAI] process_failed | ${process} process failed.`, {
    process,
    status: "failed",
    message: `${process} process failed.`,
    ...context,
  });
}
