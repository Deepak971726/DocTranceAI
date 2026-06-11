import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { documentsApi, type ListDocumentsParams } from "@/api/documents.api";
import { getApiErrorMessage } from "@/api/axios";
import { queryKeys } from "@/services/queryKeys";

export function useDocuments(params: ListDocumentsParams = { limit: 50, offset: 0 }) {
  return useQuery({
    queryKey: queryKeys.documents(params),
    queryFn: () => documentsApi.list(params),
  });
}

export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: documentId ? queryKeys.document(documentId) : ["document", "missing"],
    queryFn: () => documentsApi.get(documentId as string),
    enabled: Boolean(documentId),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(file, setProgress),
    onSuccess: () => {
      toast.success("Upload accepted. Processing has started.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents() });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
    onSettled: () => setProgress(0),
  });

  return { ...mutation, progress };
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => {
      toast.success("Document deleted.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents() });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}

export function useSearchDocuments() {
  return useMutation({
    mutationFn: documentsApi.search,
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
}
