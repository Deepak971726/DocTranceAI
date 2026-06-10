import { useParams } from "react-router-dom";
import { CitationPanel } from "@/components/chat/CitationPanel";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary } from "@/hooks/useGeneration";

export default function SummaryPage() {
  const { documentId } = useParams();
  const summary = useSummary(documentId);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Summary"
        title="Executive document summary"
        description="Generated from ordered chunks with source citations."
      />
      {summary.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Card>
            <CardContent className="prose prose-slate max-w-none p-6 dark:prose-invert">
              <MarkdownMessage content={summary.data?.content ?? "No summary available."} />
            </CardContent>
          </Card>
          <CitationPanel citations={summary.data?.citations ?? []} />
        </div>
      )}
    </div>
  );
}

