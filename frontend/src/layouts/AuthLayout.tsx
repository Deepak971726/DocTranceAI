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
      <div className="liquid-ambient pointer-events-none absolute inset-0" />
      <div className="premium-grid pointer-events-none absolute inset-0 opacity-40" />

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
            className="glass-panel auth-showcase rounded-[2rem] p-8"
          >
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-primary">DocTraceAI</p>
            <h1 className="mt-5 bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text font-display text-5xl font-semibold tracking-tight text-transparent">
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
                  whileHover={{ x: 6, scale: 1.01 }}
                  transition={{ delay: 0.15 + index * 0.08, duration: 0.45 }}
                  className="liquid-row group flex items-start gap-4 rounded-3xl border p-4 shadow-sm transition-colors hover:border-primary/25"
                >
                  <span className="liquid-chip grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-primary transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{text}</span>
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="liquid-chip rounded-full border px-3 py-1.5">Local Ollama</span>
              <span className="liquid-chip rounded-full border px-3 py-1.5">Source citations</span>
              <span className="liquid-chip rounded-full border px-3 py-1.5">Private storage</span>
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
