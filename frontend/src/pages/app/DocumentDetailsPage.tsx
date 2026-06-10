import { Link, useParams } from "react-router-dom";
import { MessageSquareText, Sparkles } from "lucide-react";
import { SectionHeader } from "@/components/common/SectionHeader";
import { StatusBadge } from "@/components/documents/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocument } from "@/hooks/useDocuments";
import { formatBytes, formatDateTime } from "@/utils/format";

export default function DocumentDetailsPage() {
  const { documentId } = useParams();
  const document = useDocument(documentId);

  if (document.isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!document.data) {
    return <SectionHeader title="Document not found" description="This document is unavailable." />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Document details"
        title={document.data.original_filename}
        description="Inspect processing metadata and launch document-specific workflows."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/documents/${document.data.id}/summary`}>
                <Sparkles className="h-4 w-4" />
                Summary
              </Link>
            </Button>
            <Button asChild variant="premium">
              <Link to={`/chat?document=${document.data.id}`}>
                <MessageSquareText className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Status" value={<StatusBadge status={document.data.status} />} />
            <Info label="File size" value={formatBytes(document.data.file_size)} />
            <Info label="Chunks" value={String(document.data.chunk_count)} />
            <Info label="Pages" value={String(document.data.page_count ?? "N/A")} />
            <Info label="Created" value={formatDateTime(document.data.created_at)} />
            <Info label="Updated" value={formatDateTime(document.data.updated_at)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Available actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to={`/documents/${document.data.id}/summary`}>Generate executive summary</Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to={`/documents/${document.data.id}/faqs`}>Generate 20 FAQs</Link>
            </Button>
            <Button asChild className="w-full justify-start" variant="outline">
              <Link to={`/chat?document=${document.data.id}`}>Ask questions with citations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

