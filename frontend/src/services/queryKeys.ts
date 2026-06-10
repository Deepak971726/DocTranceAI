export const queryKeys = {
  auth: ["auth"] as const,
  documents: (params?: object) => ["documents", params ?? {}] as const,
  document: (documentId: string) => ["document", documentId] as const,
  conversations: ["conversations"] as const,
  conversation: (conversationId: string) => ["conversation", conversationId] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  summary: (documentId: string) => ["summary", documentId] as const,
  faqs: (documentId: string) => ["faqs", documentId] as const,
  usage: ["usage"] as const,
  subscription: ["subscription"] as const,
  apiKeys: ["api-keys"] as const,
} as const;
