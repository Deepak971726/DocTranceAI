import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Citation } from "@/types/api";

interface CitationPanelProps {
  citations: Citation[];
  activeReference?: string | null;
}

export function CitationPanel({ citations, activeReference }: CitationPanelProps) {
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
            <article
              key={`${citation.reference}-${citation.chunk_id}`}
              className="w-full rounded-2xl border bg-background p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{citation.document_name}</span>
                </span>
                <Badge variant={activeReference === citation.reference ? "default" : "outline"}>
                  {citation.reference}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Page {citation.page_number ?? "N/A"}
                {citation.score !== null ? ` - ${(citation.score * 100).toFixed(1)}% match` : ""}
              </p>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}
