import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-primary">404</p>
        <h1 className="mt-3 font-display text-5xl font-semibold">Page not found</h1>
        <p className="mt-4 text-muted-foreground">This route does not exist in DocTraceAI.</p>
        <Button asChild className="mt-8">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}

