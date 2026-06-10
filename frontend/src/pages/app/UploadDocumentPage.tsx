import { useNavigate } from "react-router-dom";
import { SectionHeader } from "@/components/common/SectionHeader";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { Card, CardContent } from "@/components/ui/card";
import { useUploadDocument } from "@/hooks/useDocuments";

export default function UploadDocumentPage() {
  const navigate = useNavigate();
  const upload = useUploadDocument();

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Upload"
        title="Add documents to DocTraceAI"
        description="Files are validated before upload, then processed by the backend worker without a message queue."
      />
      <UploadDropzone
        isUploading={upload.isPending}
        progress={upload.progress}
        onFile={(file) =>
          upload.mutate(file, {
            onSuccess: () => navigate("/documents"),
          })
        }
      />
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-3">
          {["PDF page citations", "DOCX heading extraction", "TXT plain text search"].map((item) => (
            <div key={item} className="rounded-2xl border bg-background p-4 text-sm font-semibold">{item}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

