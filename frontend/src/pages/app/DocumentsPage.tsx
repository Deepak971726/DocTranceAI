import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Plus, Search } from "lucide-react";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteDocument, useDocuments } from "@/hooks/useDocuments";

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const documents = useDocuments();
  const deleteDocument = useDeleteDocument();

  const filtered = useMemo(() => {
    const items = documents.data?.items ?? [];
    return items.filter((d) => d.original_filename.toLowerCase().includes(query.toLowerCase()));
  }, [documents.data?.items, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">Manage your knowledge library</p>
        </div>
        <Button asChild size="sm">
          <Link to="/documents/upload"><Plus className="h-4 w-4" />Upload</Link>
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents..."
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>

      {documents.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No documents found</p>
          <p className="text-sm text-muted-foreground">Upload PDF, DOCX, or TXT files to get started.</p>
          <Button size="sm" onClick={() => navigate("/documents/upload")}>Upload document</Button>
        </div>
      ) : (
        <DocumentTable
          documents={filtered}
          onDelete={(id) => deleteDocument.mutate(id)}
          deletingId={deleteDocument.variables}
        />
      )}
    </div>
  );
}
