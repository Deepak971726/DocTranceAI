import { useQuery } from "@tanstack/react-query";
import { documentsApi } from "@/api/documents.api";
import { queryKeys } from "@/services/queryKeys";

export function useSummary(documentId: string | undefined) {
  return useQuery({
    queryKey: documentId ? queryKeys.summary(documentId) : ["summary", "missing"],
    queryFn: () => documentsApi.summary(documentId as string),
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 15,
  });
}

export function useFaqs(documentId: string | undefined) {
  return useQuery({
    queryKey: documentId ? queryKeys.faqs(documentId) : ["faqs", "missing"],
    queryFn: () => documentsApi.faqs(documentId as string),
    enabled: Boolean(documentId),
    staleTime: 1000 * 60 * 15,
  });
}

