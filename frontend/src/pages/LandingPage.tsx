import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FileText, MessageSquareText, ShieldCheck, UploadCloud } from "lucide-react";
import { BrandMark } from "@/components/common/BrandMark";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: UploadCloud, title: "Upload", desc: "PDF, DOCX, and TXT files validated, chunked, and embedded automatically." },
  { icon: FileText, title: "Process", desc: "Extraction, chunking, and vector indexing run in the background." },
  { icon: MessageSquareText, title: "Chat", desc: "Ask questions across one or many documents with streaming answers." },
  { icon: ShieldCheck, title: "Cite", desc: "Every answer traces back to the exact page and chunk it came from." },
];

const capabilities = ["Document Q&A", "Multi-document chat", "Executive summaries", "20 auto-generated FAQs", "Semantic search"];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="liquid-ambient pointer-events-none absolute inset-0" />
      <div className="premium-grid pointer-events-none absolute inset-0 opacity-40" />

      <header className="liquid-nav sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild variant="premium" size="sm">
              <Link to="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="liquid-chip inline-flex rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">
              AI document intelligence
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
              Ask your documents. Trust every answer.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Upload PDFs, DOCX files, policies, and reports. Get cited AI answers, summaries, and
              FAQs grounded in your own content.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="premium">
                <Link to="/register">
                  Start for free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30, rotateX: 6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel rounded-[2rem] p-5"
          >
            <div className="liquid-card rounded-[1.5rem] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Document workspace</p>
                  <p className="text-xs text-muted-foreground">Local AI ready</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  Indexed
                </span>
              </div>
              <div className="space-y-3">
                {["Policy.pdf", "Board-report.docx", "Research-notes.txt"].map((item, index) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.08, duration: 0.42 }}
                    className="liquid-row flex items-center justify-between rounded-2xl border p-4"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-primary" />
                      {item}
                    </span>
                    <span className="text-xs text-muted-foreground">Ready</span>
                  </motion.div>
                ))}
              </div>
              <div className="liquid-chip mt-5 rounded-2xl p-4 text-sm leading-6 text-primary">
                "Summarize key risks and cite exact source chunks."
              </div>
            </div>
          </motion.div>
        </section>

        <section className="border-y border-white/25 bg-card/30 py-16 backdrop-blur-2xl">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-10 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Workflow</p>
              <h2 className="mt-3 font-display text-3xl font-semibold">How it works</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, desc }, index) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.05, duration: 0.42 }}
                >
                  <Card className="h-full transition-transform hover:-translate-y-1">
                    <CardContent className="p-5">
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 lg:grid-cols-2">
          <Card>
            <CardContent className="p-8">
              <h2 className="font-display text-2xl font-semibold">What you can do</h2>
              <ul className="mt-6 space-y-3">
                {capabilities.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-8">
              <h2 className="font-display text-2xl font-semibold">Built on free local AI</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Powered by local Ollama models, so you do not need an OpenAI API key. The backend
                works with Node.js, PostgreSQL, Qdrant vector search, and Supabase storage.
              </p>
              <blockquote className="liquid-row mt-6 rounded-2xl border-l-4 border-primary p-4 text-sm italic text-muted-foreground">
                "DocTraceAI gives our team cited answers without forcing everyone to read long SOPs."
              </blockquote>
              <p className="mt-3 text-sm font-semibold">Maya Shah, Operations Lead</p>
            </CardContent>
          </Card>
        </section>

        <section className="border-t border-white/25 bg-card/30 py-16 text-center backdrop-blur-2xl">
          <div className="mx-auto max-w-xl px-4">
            <h2 className="font-display text-3xl font-semibold">Ready to get started?</h2>
            <p className="mt-3 text-muted-foreground">Free to use. No credit card required.</p>
            <Button asChild size="lg" variant="premium" className="mt-6">
              <Link to="/register">
                Create your workspace <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <p className="text-sm text-muted-foreground">Built for document intelligence teams.</p>
        </div>
      </footer>
    </div>
  );
}
