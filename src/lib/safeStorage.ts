// Acesso seguro a localStorage/sessionStorage.
// Em iframes sandbox SEM allow-same-origin (ex.: previews) qualquer acesso lança
// SecurityError e pode quebrar a aplicação inteira. Fallback em memória mantém o
// app funcional (estado dura só na sessão atual).
type SafeStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function makeFallback(): SafeStore {
  const mem = new Map<string, string>();
  return {
    getItem(k: string) { return mem.has(k) ? mem.get(k)! : null; },
    setItem(k: string, v: string) { mem.set(k, String(v)); },
    removeItem(k: string) { mem.delete(k); },
  };
}

function makeSafe(kind: "local" | "session"): SafeStore {
  const fallback = makeFallback();
  const raw = () => (kind === "session" ? window.sessionStorage : window.localStorage);
  return {
    getItem(k: string) { try { return raw().getItem(k); } catch { return fallback.getItem(k); } },
    setItem(k: string, v: string) { try { raw().setItem(k, String(v)); } catch { fallback.setItem(k, String(v)); } },
    removeItem(k: string) { try { raw().removeItem(k); } catch { fallback.removeItem(k); } },
  };
}

export const safeLocalStorage: SafeStore = makeSafe("local");
export const safeSessionStorage: SafeStore = makeSafe("session");
export const isStorageAvailable = (kind: "local" | "session"): boolean => {
  try { const s = kind === "session" ? window.sessionStorage : window.localStorage; const k = "__lh_probe__"; s.setItem(k, "1"); s.removeItem(k); return true; } catch { return false; }
};
