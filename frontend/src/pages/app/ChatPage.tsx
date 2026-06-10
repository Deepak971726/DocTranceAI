import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, Plus, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { CitationPanel } from "@/components/chat/CitationPanel";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConversationMessages, useConversations } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";
import { streamChat, type StreamMetadata } from "@/services/streamingChat";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  resetChatState,
  setActiveConversationId,
  setDraft,
  setSelectedDocumentIds,
  setStreaming,
} from "@/store/slices/chatSlice";
import { cn } from "@/lib/cn";
import type { ChatMessage, Citation } from "@/types/api";

export default function ChatPage() {
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const chat = useAppSelector((s) => s.chat);
  const token = useAppSelector((s) => s.auth.accessToken);
  const documents = useDocuments();
  const conversations = useConversations();
  const messages = useConversationMessages(chat.activeConversationId);
  const [streamedContent, setStreamedContent] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [streamMetadata, setStreamMetadata] = useState<StreamMetadata | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const docId = params.get("document");
    if (docId) dispatch(setSelectedDocumentIds([docId]));
  }, [dispatch, params]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.items, streamedContent]);

  const readyDocs = useMemo(
    () => (documents.data?.items ?? []).filter((d) => d.status === "READY"),
    [documents.data?.items],
  );

  const displayed: ChatMessage[] = [
    ...(messages.data?.items ?? []),
    ...(streamedContent
      ? [{
          id: streamMetadata?.message_id ?? "streaming",
          conversation_id: streamMetadata?.conversation_id ?? chat.activeConversationId ?? "",
          role: "ASSISTANT" as const,
          status: "PENDING" as const,
          content: streamedContent,
          citations: citations as unknown as Array<Record<string, unknown>>,
          model_name: "",
          created_at: new Date().toISOString(),
        }]
      : []),
  ];

  const submit = async () => {
    if (!token || !chat.draft.trim() || chat.selectedDocumentIds.length === 0 || chat.isStreaming) return;
    abortRef.current = new AbortController();
    let convId = chat.activeConversationId;
    setStreamedContent("");
    setCitations([]);
    setStreamMetadata(null);
    dispatch(setStreaming(true));
    try {
      await streamChat(
        { question: chat.draft, document_ids: chat.selectedDocumentIds, conversation_id: chat.activeConversationId },
        {
          accessToken: token,
          signal: abortRef.current.signal,
          onMetadata: (meta) => {
            setStreamMetadata(meta);
            convId = meta.conversation_id;
            setCitations(meta.citations);
            dispatch(setActiveConversationId(meta.conversation_id));
          },
          onToken: (t) => setStreamedContent((v) => v + t),
          onDone: () => {
            dispatch(resetChatState());
            void conversations.refetch();
            if (convId) void messages.refetch();
            setStreamedContent("");
          },
          onError: (msg) => toast.error(msg),
        },
      );
    } finally {
      dispatch(setStreaming(false));
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 overflow-hidden">
      {/* Conversations sidebar */}
      <div className="hidden w-56 shrink-0 flex-col gap-2 overflow-y-auto lg:flex">
        <div className="flex items-center justify-between py-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Conversations</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => { dispatch(setActiveConversationId(null)); dispatch(setDraft("")); setStreamedContent(""); }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {(conversations.data?.items ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No conversations yet</p>
        ) : (
          (conversations.data?.items ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => dispatch(setActiveConversationId(c.id))}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary",
                chat.activeConversationId === c.id && "bg-secondary font-medium",
              )}
            >
              {c.title}
            </button>
          ))
        )}
      </div>

      {/* Main chat */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border bg-card">
        {/* Document selector */}
        <div className="flex flex-wrap gap-2 border-b p-3">
          <p className="w-full text-xs font-medium text-muted-foreground">Select documents to chat with:</p>
          {readyDocs.map((doc) => {
            const selected = chat.selectedDocumentIds.includes(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() =>
                  dispatch(setSelectedDocumentIds(
                    selected
                      ? chat.selectedDocumentIds.filter((id) => id !== doc.id)
                      : [...chat.selectedDocumentIds, doc.id],
                  ))
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-secondary",
                )}
              >
                {doc.original_filename}
              </button>
            );
          })}
          {readyDocs.length === 0 && (
            <p className="text-xs text-muted-foreground">No ready documents. Upload and process one first.</p>
          )}
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {displayed.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Ask a question</p>
              <p className="text-sm text-muted-foreground">Select at least one document and type your question below.</p>
            </div>
          ) : (
            displayed.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </div>

        {/* Input */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea
              value={chat.draft}
              onChange={(e) => dispatch(setDraft(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              placeholder="Ask a question... (Enter to send, Shift+Enter for new line)"
              className="min-h-0 resize-none"
              rows={2}
            />
            {chat.isStreaming ? (
              <Button variant="destructive" size="icon" onClick={() => abortRef.current?.abort()}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={submit}
                disabled={!chat.draft.trim() || chat.selectedDocumentIds.length === 0}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Citations */}
      <div className="hidden w-64 shrink-0 xl:block">
        <CitationPanel citations={citations} />
      </div>
    </div>
  );
}
