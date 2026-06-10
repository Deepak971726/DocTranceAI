import { useId } from "react";
import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setThemeMode } from "@/store/slices/themeSlice";
import type { ThemeMode } from "@/types/api";

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

const themeOptions: Array<{
  mode: ThemeMode;
  label: string;
  icon: typeof Sun;
}> = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const id = useId();
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-full border bg-card/80 p-1 shadow-sm backdrop-blur-xl",
        className,
      )}
    >
      {themeOptions.map(({ mode: optionMode, label, icon: Icon }) => {
        const active = mode === optionMode;

        return (
          <button
            key={optionMode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Use ${label.toLowerCase()} theme`}
            title={label}
            onClick={() => dispatch(setThemeMode(optionMode))}
            className={cn(
              "relative isolate inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact && "w-8 px-0",
              active && "text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`theme-toggle-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
