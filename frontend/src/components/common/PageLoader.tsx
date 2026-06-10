import { Loader2 } from "lucide-react";

interface PageLoaderProps {
  label?: string;
}

export function PageLoader({ label = "Loading" }: PageLoaderProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card/80 p-8 shadow-soft">
        <div className="rounded-2xl bg-primary/10 p-4 text-primary">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

