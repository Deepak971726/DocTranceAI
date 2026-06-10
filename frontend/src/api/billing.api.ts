import { api } from "./axios";
import type {
  ApiKeyCreatedResponse,
  ApiKeyItem,
  SubscriptionResponse,
  UsageEntry,
} from "@/types/api";

export interface CreateApiKeyPayload {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export const billingApi = {
  usage: async (): Promise<UsageEntry[]> => {
    const { data } = await api.get<UsageEntry[]>("/usage");
    return data;
  },
  subscription: async (): Promise<SubscriptionResponse> => {
    const { data } = await api.get<SubscriptionResponse>("/subscription");
    return data;
  },
  apiKeys: async (): Promise<ApiKeyItem[]> => {
    const { data } = await api.get<ApiKeyItem[]>("/api-keys");
    return data;
  },
  createApiKey: async (payload: CreateApiKeyPayload): Promise<ApiKeyCreatedResponse> => {
    const { data } = await api.post<ApiKeyCreatedResponse>("/api-keys", payload);
    return data;
  },
  revokeApiKey: async (keyId: string): Promise<void> => {
    await api.delete(`/api-keys/${keyId}`);
  },
};

