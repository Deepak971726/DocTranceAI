import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chatApi } from "@/api/chat.api";
import { getApiErrorMessage } from "@/api/axios";
import { queryKeys } from "@/services/queryKeys";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: () => chatApi.conversations(),
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? queryKeys.messages(conversationId) : ["messages", "none"],
    queryFn: () => chatApi.messages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useAskQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.ask,
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(response.conversation_id) });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.deleteConversation,
    onSuccess: () => {
      toast.success("Conversation deleted.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

