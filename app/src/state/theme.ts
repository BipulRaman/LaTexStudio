import { useEffect } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** Apply a theme to <html> and persist nothing (caller persists in settings). */
export function useThemeEffect(mode: ThemeMode) {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (resolved: "light" | "dark") => {
      root.classList.toggle("dark", resolved === "dark");
      root.classList.toggle("light", resolved === "light");
      root.style.colorScheme = resolved;
    };

    if (mode !== "system") {
      apply(mode);
      return;
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches ? "dark" : "light");
    const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
}
