import { type ReactNode, useEffect } from "react";
import { useAppSelector } from "../store/hooks";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppSelector((s) => s.theme.mode);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolved = mode === "system" ? (media.matches ? "dark" : "light") : mode;
      root.classList.toggle("dark", resolved === "dark");
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
    };

    applyTheme();

    const onSystem = () => applyTheme();
    media.addEventListener("change", onSystem);
    return () => media.removeEventListener("change", onSystem);
  }, [mode]);

  return <>{children}</>;
}
