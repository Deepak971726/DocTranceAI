import { api } from "./axios";
import {
  logProcessFailed,
  logProcessFinished,
  logProcessStarted,
} from "@/lib/processLogger";
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
    logProcessStarted("Load documents", params);
    try {
      const { data } = await api.get<Page<DocumentItem>>("/documents", { params });
      logProcessFinished("Load documents", { total: data.total });
      return data;
    } catch (error) {
      logProcessFailed("Load documents", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  get: async (documentId: string): Promise<DocumentItem> => {
    logProcessStarted("Load document details", { documentId });
    try {
      const { data } = await api.get<DocumentItem>(`/documents/${documentId}`);
      logProcessFinished("Load document details", { documentId, status: data.status });
      return data;
    } catch (error) {
      logProcessFailed("Load document details", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  upload: async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<DocumentUploadResponse> => {
    logProcessStarted("Upload file", { filename: file.name, bytes: file.size });
    const formData = new FormData();
    formData.append("file", file);
    try {
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
      logProcessFinished("Upload file", {
        filename: file.name,
        documentId: data.document.id,
      });
      return data;
    } catch (error) {
      logProcessFailed("Upload file", {
        filename: file.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  delete: async (documentId: string): Promise<MessageResponse> => {
    logProcessStarted("Delete document", { documentId });
    try {
      const { data } = await api.delete<MessageResponse>(`/documents/${documentId}`);
      logProcessFinished("Delete document", { documentId });
      return data;
    } catch (error) {
      logProcessFailed("Delete document", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  search: async (payload: SearchPayload): Promise<SearchResult[]> => {
    logProcessStarted("Semantic document search", {
      selectedDocuments: payload.document_ids?.length ?? 0,
    });
    try {
      const { data } = await api.post<SearchResult[]>("/documents/search/semantic", payload);
      logProcessFinished("Semantic document search", { results: data.length });
      return data;
    } catch (error) {
      logProcessFailed("Semantic document search", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  summary: async (documentId: string): Promise<SummaryResponse> => {
    logProcessStarted("Generate document summary", { documentId });
    try {
      const { data } = await api.post<SummaryResponse>(`/documents/${documentId}/summary`);
      logProcessFinished("Generate document summary", {
        documentId,
        citations: data.citations.length,
      });
      return data;
    } catch (error) {
      logProcessFailed("Generate document summary", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
  faqs: async (documentId: string): Promise<FaqResponse> => {
    logProcessStarted("Generate document FAQs", { documentId });
    try {
      const { data } = await api.post<FaqResponse>(`/documents/${documentId}/faqs`);
      logProcessFinished("Generate document FAQs", {
        documentId,
        faqs: data.faqs.length,
      });
      return data;
    } catch (error) {
      logProcessFailed("Generate document FAQs", {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
};
