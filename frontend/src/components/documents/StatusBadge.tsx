import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/types/api";

const statusMap: Record<DocumentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" }> = {
  UPLOADING: { label: "Uploading", variant: "default" },
  PROCESSING: { label: "Processing", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

interface StatusBadgeProps {
  status: DocumentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusMap[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

