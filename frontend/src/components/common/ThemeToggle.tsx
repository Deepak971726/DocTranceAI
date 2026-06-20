import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setThemeMode } from "@/store/slices/themeSlice";

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const [systemDark, setSystemDark] = useState(false);
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  const nextMode = isDark ? "light" : "dark";
  const label = `Switch to ${nextMode} theme`;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => dispatch(setThemeMode(nextMode))}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        "liquid-chip group relative inline-flex h-10 items-center justify-center gap-2 overflow-hidden rounded-full px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact && "w-10 px-0",
        className,
      )}
    >
      <span className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 opacity-0 transition-opacity group-hover:opacity-100" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ opacity: 0, rotate: -70, scale: 0.65 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 70, scale: 0.65 }}
          transition={{ duration: 0.2 }}
          className="relative z-10"
        >
          {isDark ? (
            <Moon className="h-4 w-4 text-indigo-300" aria-hidden="true" />
          ) : (
            <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
      {!compact && (
        <motion.span
          key={isDark ? "dark-label" : "light-label"}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative z-10"
        >
          {isDark ? "Dark" : "Light"}
        </motion.span>
      )}
    </motion.button>
  );
}
