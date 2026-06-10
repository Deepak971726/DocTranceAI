import { api } from "./axios";
import type {
  DocumentItem,
  DocumentUploadResponse,
  FaqResponse,
  MessageResponse,
  Page,
  SearchPayload,
  SearchResult,
  SummaryResponse,
} from "@/types/api";

export interface ListDocumentsParams {
  limit?: number;
  offset?: number;
}

export const documentsApi = {
  list: async (params: ListDocumentsParams = {}): Promise<Page<DocumentItem>> => {
    const { data } = await api.get<Page<DocumentItem>>("/documents", { params });
    return data;
  },
  get: async (documentId: string): Promise<DocumentItem> => {
    const { data } = await api.get<DocumentItem>(`/documents/${documentId}`);
    return data;
  },
  upload: async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<DocumentUploadResponse>("/documents/upload", formData, {
      // Let Axios set the correct multipart boundary. Overriding Content-Type can break uploads
      // and sometimes surfaces as a browser-side "Network Error".
      onUploadProgress: (event) => {
        if (!event.total || !onProgress) {
          return;
        }
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });
    return data;
  },
  delete: async (documentId: string): Promise<MessageResponse> => {
    const { data } = await api.delete<MessageResponse>(`/documents/${documentId}`);
    return data;
  },
  search: async (payload: SearchPayload): Promise<SearchResult[]> => {
    const { data } = await api.post<SearchResult[]>("/documents/search/semantic", payload);
    return data;
  },
  summary: async (documentId: string): Promise<SummaryResponse> => {
    const { data } = await api.post<SummaryResponse>(`/documents/${documentId}/summary`);
    return data;
  },
  faqs: async (documentId: string): Promise<FaqResponse> => {
    const { data } = await api.post<FaqResponse>(`/documents/${documentId}/faqs`);
    return data;
  },
};

