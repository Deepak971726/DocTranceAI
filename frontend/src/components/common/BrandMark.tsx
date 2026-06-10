import { Link } from "react-router-dom";
import { FileSearch } from "lucide-react";
import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
        <FileSearch className="h-4 w-4" />
      </span>
      <span className="font-semibold text-foreground">DocTraceAI</span>
    </Link>
  );
}
