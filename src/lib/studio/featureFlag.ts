// Feature flag do novo Site Studio (DaveLovable-like).
// O Studio convive com o layout legado até as fases 2–4 estarem funcionais.
//
// Precedência:
//   1. VITE_STUDIO_UI ("1"/"true"/"on" liga, "0"/"false"/"off" desliga)
//   2. localStorage["prospector-studio-ui"] === "1"
//   3. desligado por padrão
//
// Nunca lança: em ambiente de teste sem localStorage/import.meta.env retorna false.

const STORAGE_KEY = "prospector-studio-ui";

function readEnvFlag(): boolean | null {
  try {
    const raw = String((import.meta as { env?: Record<string, unknown> }).env?.VITE_STUDIO_UI ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return null;
    if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
    if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  } catch {
    /* import.meta.env indisponível */
  }
  return null;
}

export function isStudioUiEnabled(): boolean {
  const env = readEnvFlag();
  if (env !== null) return env;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStudioUiEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* armazenamento indisponível */
  }
}

export function studioUiFlagKey(): string {
  return STORAGE_KEY;
}
