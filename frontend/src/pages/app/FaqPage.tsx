import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useFaqs } from "@/hooks/useGeneration";

export default function FaqPage() {
  const { documentId } = useParams();
  const [query, setQuery] = useState("");
  const faqs = useFaqs(documentId);
  const filtered = useMemo(
    () =>
      (faqs.data?.faqs ?? []).filter((faq) =>
        `${faq.question} ${faq.answer}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [faqs.data?.faqs, query],
  );

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="FAQ generator" title="Generated FAQs" description="Search, expand, and copy grounded question-answer pairs." />
      <div className="flex items-center gap-3 rounded-3xl border bg-card p-3">
        <Search className="ml-2 h-5 w-5 text-muted-foreground" />
        <Input className="border-0 bg-transparent shadow-none focus-visible:ring-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search FAQs" />
      </div>
      {faqs.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-4">
          {filtered.map((faq) => (
            <Card key={faq.question}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{faq.question}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${faq.question}\n${faq.answer}`);
                      toast.success("FAQ copied.");
                    }}
                    aria-label="Copy FAQ"
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

