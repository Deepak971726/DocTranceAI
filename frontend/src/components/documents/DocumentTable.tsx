import { Link } from "react-router-dom";
import { FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/documents/StatusBadge";
import { formatBytes, formatDateTime } from "@/utils/format";
import type { DocumentItem } from "@/types/api";

interface DocumentTableProps {
  documents: DocumentItem[];
  onDelete: (documentId: string) => void;
  deletingId?: string;
}

export function DocumentTable({ documents, onDelete, deletingId }: DocumentTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border bg-card">
      <div className="hidden grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.4fr] border-b px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground md:grid">
        <span>Name</span>
        <span>Status</span>
        <span>Size</span>
        <span>Updated</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="divide-y">
        {documents.map((document) => (
          <article
            key={document.id}
            className="grid gap-4 px-5 py-4 md:grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.4fr] md:items-center"
          >
            <Link to={`/documents/${document.id}`} className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">{document.original_filename}</span>
                <span className="block text-xs text-muted-foreground">
                  {document.chunk_count} chunks {document.page_count ? `· ${document.page_count} pages` : ""}
                </span>
              </span>
            </Link>
            <div>
              <StatusBadge status={document.status} />
            </div>
            <p className="text-sm text-muted-foreground">{formatBytes(document.file_size)}</p>
            <p className="text-sm text-muted-foreground">{formatDateTime(document.updated_at)}</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="icon" aria-label="Document menu">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(document.id)}
                disabled={deletingId === document.id}
                aria-label={`Delete ${document.original_filename}`}
              >
                <Trash2 className="h-5 w-5 text-destructive" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

