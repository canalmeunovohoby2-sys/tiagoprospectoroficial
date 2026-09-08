import { useSyncExternalStore } from "react";
import { safeLocalStorage } from "@/lib/safeStorage";
import { applyBrandColor, readBrandColor } from "@/lib/brandColor";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return safeLocalStorage.getItem("lh-theme") === "light" ? "light" : "dark";
}

// ----- Tema compartilhado (store único) -----
// Todos os componentes (toggle do AppShell, BrandLogo, etc.) leem o MESMO estado,
// então alternar o tema atualiza a logo e as classes de fundo em qualquer lugar.
let currentTheme: Theme = initialTheme();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  applyBrandColor(readBrandColor());
  try { safeLocalStorage.setItem("lh-theme", theme); } catch { /* best-effort */ }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot(): Theme {
  return currentTheme;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const toggle = () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    apply(currentTheme);
    listeners.forEach((l) => l());
  };
  return { theme, toggle };
}

// Aplica o tema salvo assim que o módulo carrega (antes/na montagem).
if (typeof window !== "undefined") apply(currentTheme);
