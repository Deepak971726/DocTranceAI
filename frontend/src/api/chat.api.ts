import { api } from "./axios";
import type {
  ChatMessage,
  ChatRequestPayload,
  ChatResponse,
  ConversationItem,
  MessageResponse,
  Page,
} from "@/types/api";

export const chatApi = {
  ask: async (payload: ChatRequestPayload): Promise<ChatResponse> => {
    const { data } = await api.post<ChatResponse>("/chat", { ...payload, stream: false });
    return data;
  },
  conversations: async (params = { limit: 50, offset: 0 }): Promise<Page<ConversationItem>> => {
    const { data } = await api.get<Page<ConversationItem>>("/conversations", { params });
    return data;
  },
  messages: async (conversationId: string): Promise<Page<ChatMessage>> => {
    const { data } = await api.get<Page<ChatMessage>>("/messages", {
      params: { conversation_id: conversationId, limit: 200, offset: 0 },
    });
    return data;
  },
  deleteConversation: async (conversationId: string): Promise<MessageResponse> => {
    const { data } = await api.delete<MessageResponse>(`/conversations/${conversationId}`);
    return data;
  },
};

