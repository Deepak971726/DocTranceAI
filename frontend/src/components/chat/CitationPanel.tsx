import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Citation } from "@/types/api";

interface CitationPanelProps {
  citations: Citation[];
  activeReference?: string | null;
  onSelect?: (citation: Citation) => void;
}

export function CitationPanel({ citations, activeReference, onSelect }: CitationPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Source citations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Citations appear here after an answer.</p>
        ) : (
          citations.map((citation) => (
            <button
              key={`${citation.reference}-${citation.chunk_id}`}
              type="button"
              onClick={() => onSelect?.(citation)}
              className="w-full rounded-2xl border bg-background p-4 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-primary" />
                  {citation.document_name}
                </span>
                <Badge variant={activeReference === citation.reference ? "default" : "outline"}>
                  {citation.reference}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Page {citation.page_number ?? "N/A"} · Chunk {citation.chunk_index}
                {citation.score !== null ? ` · ${(citation.score * 100).toFixed(1)}% match` : ""}
              </p>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                {citation.excerpt}
              </p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

