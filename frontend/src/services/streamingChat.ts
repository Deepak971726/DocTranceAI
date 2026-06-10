import type { Citation } from "@/types/api";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

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

export async function streamChat(payload: StreamChatPayload, handlers: StreamHandlers) {
  const response = await fetch(`${apiBaseUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${handlers.accessToken}`,
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal: handlers.signal,
  });

  if (!response.ok || !response.body) {
    handlers.onError?.("Streaming request failed.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        handlers.onMetadata?.(JSON.parse(event.data) as StreamMetadata);
      } else if (event.type === "token") {
        const payloadData = JSON.parse(event.data) as { content: string };
        handlers.onToken(payloadData.content);
      } else if (event.type === "done") {
        handlers.onDone?.();
      } else if (event.type === "error") {
        const payloadData = JSON.parse(event.data) as { message?: string };
        handlers.onError?.(payloadData.message ?? "Streaming failed.");
      }
    }
  }
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

