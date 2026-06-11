import { Link } from "react-router-dom";
import { FileSearch } from "lucide-react";
import { cn } from "@/lib/cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "group flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-primary/20 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
        <span className="absolute inset-0 translate-x-[-140%] rotate-12 bg-white/25 transition-transform duration-500 group-hover:translate-x-[140%]" />
        <FileSearch className="relative h-4 w-4" />
      </span>
      <span className="font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
        DocTraceAI
      </span>
    </Link>
  );
}
