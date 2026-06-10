import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { billingApi } from "@/api/billing.api";
import { getApiErrorMessage } from "@/api/axios";
import { queryKeys } from "@/services/queryKeys";

export function useUsage() {
  return useQuery({ queryKey: queryKeys.usage, queryFn: billingApi.usage });
}

export function useSubscription() {
  return useQuery({ queryKey: queryKeys.subscription, queryFn: billingApi.subscription });
}

export function useApiKeys() {
  return useQuery({ queryKey: queryKeys.apiKeys, queryFn: billingApi.apiKeys });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: billingApi.createApiKey,
    onSuccess: () => {
      toast.success("API key created.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: billingApi.revokeApiKey,
    onSuccess: () => {
      toast.success("API key revoked.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

