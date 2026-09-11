import { useSyncExternalStore } from "react";
import { safeLocalStorage } from "@/lib/safeStorage";
import { applyBrandColor, readBrandColor, DEFAULT_BRAND } from "@/lib/brandColor";
import { supabase } from "@/integrations/supabase/client";

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

async function syncToSupabase(updates: Record<string, unknown>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.auth.updateUser({
      user_metadata: { ...user.user_metadata, ...updates },
    });
  } catch (e) {
    console.warn("[Theme] não sincronizou para Supabase:", e);
  }
}

function apply(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  applyBrandColor(readBrandColor());
  try {
    safeLocalStorage.setItem("lh-theme", theme);
  } catch {
    /* best-effort */
  }
  void syncToSupabase({ theme });
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

// Restaura preferências do usuário Supabase (theme + brandColor) quando houver sessão ativa.
export async function restorePreferences(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.user_metadata) return;

    const { theme: savedTheme, brand_color: savedBrand } = user.user_metadata as Record<string, unknown>;

    if (savedTheme === "light" || savedTheme === "dark") {
      currentTheme = savedTheme;
      const root = document.documentElement;
      if (savedTheme === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
      try {
        safeLocalStorage.setItem("lh-theme", savedTheme);
      } catch { /* best-effort */ }
    }

    if (typeof savedBrand === "string" && savedBrand.trim().startsWith("#")) {
      import("@/lib/brandColor").then(({ setBrandColor }) => setBrandColor(savedBrand));
    }

    listeners.forEach((l) => l());
  } catch (e) {
    console.warn("[Theme] não restaurou preferências:", e);
  }
}
