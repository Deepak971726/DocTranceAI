import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  isUploading: boolean;
  progress: number;
}

export function UploadDropzone({ onFile, isUploading, progress }: UploadDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    noClick: true,
    disabled: isUploading,
    onDrop: (acceptedFiles) => {
      const [file] = acceptedFiles;
      if (file) {
        onFile(file);
      }
    },
    onDropRejected: (rejections) => {
      const message = rejections[0]?.errors[0]?.message;
      toast.error(message ?? "Select one PDF, DOCX, or TXT file.");
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "liquid-card rounded-[2rem] border border-dashed p-8 text-center transition-colors",
        isDragActive && "border-primary text-primary",
      )}
    >
      <input {...getInputProps()} aria-label="Upload document" />
      <div className="liquid-chip mx-auto grid h-20 w-20 place-items-center rounded-3xl text-primary">
        <UploadCloud className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold">Drop your document here</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Supports PDF, DOCX, and TXT. Files are validated, stored privately, processed into chunks,
        embedded locally, and indexed for cited answers.
      </p>
      <Button className="mt-6" onClick={open} disabled={isUploading}>
        Select file
      </Button>
      {isUploading && (
        <div className="mx-auto mt-6 max-w-md">
          <div className="liquid-control h-3 overflow-hidden rounded-full">
            <div
              role="progressbar"
              aria-label="Document upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}
    </div>
  );
}
