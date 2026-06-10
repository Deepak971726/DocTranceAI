import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { FileCheck2, LockKeyhole, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/common/BrandMark";
import { ThemeToggle } from "@/components/common/ThemeToggle";

const trustItems = [
  { icon: FileCheck2, label: "Cited answers", text: "Every answer traces back to your source document." },
  { icon: LockKeyhole, label: "Private workspace", text: "Built for local Ollama-first document intelligence." },
  { icon: Sparkles, label: "Fast workflows", text: "Summaries, FAQs, and chat from one clean dashboard." },
];

export function AuthLayout() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="premium-grid pointer-events-none absolute inset-0 opacity-40" />
      <motion.div
        className="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
        animate={{ x: [0, 36, 0], y: [0, 22, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl"
        animate={{ x: [0, -28, 0], y: [0, -24, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <header className="relative z-10 flex h-16 items-center justify-between px-4 sm:px-8">
        <BrandMark />
        <ThemeToggle compact />
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <section className="hidden lg:block">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel rounded-[2rem] p-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-primary">DocTraceAI</p>
            <h1 className="mt-5 font-display text-5xl font-semibold tracking-tight">
              A cleaner way to trust your documents.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Upload policies, reports, notes, and PDFs. Ask questions, generate summaries, and keep
              every response tied to a visible source.
            </p>

            <div className="mt-8 grid gap-4">
              {trustItems.map(({ icon: Icon, label, text }, index) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + index * 0.08, duration: 0.45 }}
                  className="flex items-start gap-4 rounded-3xl border bg-background/70 p-4"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{text}</span>
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="flex justify-center">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
