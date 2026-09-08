import { useEffect, useState } from "react";
import { safeLocalStorage } from "@/lib/safeStorage";
import { applyBrandColor, readBrandColor } from "@/lib/brandColor";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (safeLocalStorage.getItem("lh-theme") as Theme) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    // Cor de marca personalizada — aplica em qualquer página (persistida).
    applyBrandColor(readBrandColor());
    safeLocalStorage.setItem("lh-theme", theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
