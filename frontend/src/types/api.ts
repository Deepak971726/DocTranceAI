export type ThemeMode = "light" | "dark" | "system";
export type DocumentStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
export type MessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type MessageStatus = "PENDING" | "COMPLETED" | "FAILED";
export type PlanName = "FREE" | "PRO" | "BUSINESS";
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  role?: "USER" | "ADMIN";
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  request_id: string | null;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MessageResponse {
  message: string;
}

export interface DocumentMetadata {
  [key: string]: unknown;
}

export interface DocumentItem {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  status: DocumentStatus;
  processing_error: string | null;
  page_count: number | null;
  chunk_count: number;
  document_metadata: DocumentMetadata;
  created_at: string;
  updated_at: string;
}

export interface DocumentUploadResponse {
  document: DocumentItem;
  message: string;
}

export interface Citation {
  reference: string;
  document_id: string;
  document_name: string;
  page_number: number | null;
  chunk_id: string;
  chunk_index: number;
  score: number | null;
  excerpt: string;
}

export interface SearchResult extends Citation {}

export interface SummaryResponse {
  document_id: string;
  content: string;
  citations: Citation[];
}

export interface FaqItem {
  question: string;
  answer: string;
  citations: string[];
}

export interface FaqResponse {
  document_id: string;
  faqs: FaqItem[];
}

export interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  status: MessageStatus;
  content: string;
  citations: Array<Record<string, unknown>>;
  model_name: string | null;
  created_at: string;
}

export interface ChatResponse {
  conversation_id: string;
  message_id: string;
  answer: string;
  citations: Citation[];
}

export interface UsageEntry {
  usage_date: string;
  documents_uploaded: number;
  questions_asked: number;
  storage_bytes: number;
  ai_requests: number;
  embedding_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface SubscriptionResponse {
  plan_name: PlanName;
  status: SubscriptionStatus;
  usage_limits: Record<string, unknown>;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiKeyCreatedResponse extends ApiKeyItem {
  key: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export interface RefreshPayload {
  refresh_token: string;
}

export interface ChatRequestPayload {
  question: string;
  conversation_id?: string | null;
  document_ids: string[];
  stream?: boolean;
}

export interface SearchPayload {
  query: string;
  document_ids?: string[] | null;
  top_k?: number;
}
