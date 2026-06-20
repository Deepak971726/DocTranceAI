import type { Citation } from "@/types/api";
import { store } from "@/store";
import { logout, setCredentials } from "@/store/slices/authSlice";
import type { ApiErrorResponse, TokenResponse } from "@/types/api";
import { resolveApiBaseUrl } from "@/api/baseUrl";
import {
  logProcessFailed,
  logProcessFinished,
  logProcessStarted,
} from "@/lib/processLogger";

const apiBaseUrl = resolveApiBaseUrl();

export interface StreamChatPayload {
  question: string;
  document_ids: string[];
  conversation_id?: string | null;
}

export interface StreamMetadata {
  conversation_id: string;
  message_id: string;
  citations: Citation[];
}

export interface StreamHandlers {
  onMetadata?: (metadata: StreamMetadata) => void;
  onToken: (token: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
  accessToken: string;
}

const TOKEN_FLUSH_INTERVAL_MS = 80;
const TOKEN_FLUSH_CHARS = 120;

export async function streamChat(payload: StreamChatPayload, handlers: StreamHandlers) {
  logProcessStarted("Send user question", {
    selectedDocuments: payload.document_ids.length,
    conversationId: payload.conversation_id ?? null,
  });
  let response: Response;
  try {
    response = await openChatStream(payload, handlers.accessToken, handlers.signal);
    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken(handlers.signal);
      if (refreshedToken) {
        response = await openChatStream(payload, refreshedToken, handlers.signal);
      }
    }
  } catch (error) {
    logProcessFailed("Send user question", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error(
      "Cannot reach the DocTraceAI API. Check that the backend is running and CORS is allowing this frontend URL.",
    );
  }

  if (!response.ok || !response.body) {
    const message = await readStreamError(response);
    logProcessFailed("Send user question", { httpStatus: response.status, error: message });
    handlers.onError?.(message);
    return;
  }
  logProcessFinished("Send user question", { status: response.status });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokenBuffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let displayStarted = false;

  const flushTokens = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!tokenBuffer) {
      return;
    }
    handlers.onToken(tokenBuffer);
    tokenBuffer = "";
  };

  const appendToken = (content: string) => {
    if (!displayStarted) {
      displayStarted = true;
      logProcessStarted("Display answer");
    }
    tokenBuffer += content;
    if (tokenBuffer.length >= TOKEN_FLUSH_CHARS || /[\n.!?]\s*$/.test(tokenBuffer)) {
      flushTokens();
      return;
    }
    flushTimer ??= setTimeout(flushTokens, TOKEN_FLUSH_INTERVAL_MS);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const rawEvent of events) {
      const event = parseServerSentEvent(rawEvent);
      if (!event) {
        continue;
      }
      if (event.type === "metadata") {
        const metadata = JSON.parse(event.data) as StreamMetadata;
        logProcessFinished("Attach citations", {
          conversationId: metadata.conversation_id,
          citations: metadata.citations.length,
        });
        handlers.onMetadata?.(metadata);
      } else if (event.type === "token") {
        const payloadData = JSON.parse(event.data) as { content: string };
        appendToken(payloadData.content);
      } else if (event.type === "done") {
        flushTokens();
        logProcessFinished("Display answer");
        handlers.onDone?.();
      } else if (event.type === "error") {
        flushTokens();
        const payloadData = JSON.parse(event.data) as { message?: string };
        logProcessFailed("Display answer", {
          error: payloadData.message ?? "Streaming failed.",
        });
        handlers.onError?.(payloadData.message ?? "Streaming failed.");
      }
    }
  }
  flushTokens();
}

async function openChatStream(
  payload: StreamChatPayload,
  accessToken: string,
  signal?: AbortSignal,
) {
  return fetch(`${apiBaseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });
}

async function refreshAccessToken(signal?: AbortSignal): Promise<string | null> {
  const refreshToken = store.getState().auth.refreshToken;
  if (!refreshToken) {
    return null;
  }
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal,
  });
  if (!response.ok) {
    store.dispatch(logout());
    return null;
  }
  const tokens = (await response.json()) as TokenResponse;
  store.dispatch(setCredentials(tokens));
  return tokens.access_token;
}

async function readStreamError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    if (data?.error?.message) {
      return data.error.message;
    }
  } catch {
    // Fall through to status-based message.
  }
  if (response.status === 401) {
    return "Your session expired. Log in again and retry.";
  }
  if (response.status === 403) {
    return "The backend rejected this frontend origin. Check CORS_ORIGINS or restart the backend after the latest fix.";
  }
  if (response.status >= 500) {
    return "The backend failed while generating the answer. Check the backend terminal logs.";
  }
  return `Streaming request failed with HTTP ${response.status}.`;
}

function parseServerSentEvent(rawEvent: string): { type: string; data: string } | null {
  const lines = rawEvent.split("\n");
  const typeLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!typeLine || !dataLine) {
    return null;
  }
  return {
    type: typeLine.replace("event:", "").trim(),
    data: dataLine.replace("data:", "").trim(),
  };
}
