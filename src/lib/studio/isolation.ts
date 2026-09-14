// Cross-origin isolation para o WebContainer (C0).
//
// O WebContainer exige `window.crossOriginIsolated === true` (SharedArrayBuffer).
// O DaveLovable usa `Cross-Origin-Embedder-Policy: require-corp`; aqui usamos
// `credentialless` porque `require-corp` bloqueia recursos cross-origin sem CORP
// (ex.: o Monaco carregado via CDN), o que quebraria o editor. `credentialless`
// também produz `crossOriginIsolated === true` no Chrome e é a única divergência
// consciente em relação ao DaveLovable. Se o WebContainer exigir `require-corp`
// num navegador específico, a mitigação é self-hostar o Monaco.
//
// Estes headers são aplicados no dev server (vite.config.ts) e na produção
// (vercel.json). Ambos importam/repetem os mesmos valores.

export const WEB_CONTAINER_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

/** true quando o documento está cross-origin isolated (pré-requisito do WebContainer). */
export function isCrossOriginIsolated(): boolean {
  if (typeof window === "undefined") return false;
  const isolated = (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const hasSab = typeof SharedArrayBuffer !== "undefined";
  return isolated && hasSab;
}

/** Diagnóstico para a UI (mostra o motivo exato quando não suportado). */
export function isolationDiagnostic(): { isolated: boolean; reason?: string } {
  if (typeof window === "undefined") return { isolated: false, reason: "sem window (SSR/Node)" };
  if (typeof SharedArrayBuffer === "undefined") return { isolated: false, reason: "SharedArrayBuffer indisponível" };
  if ((window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated !== true) {
    return { isolated: false, reason: "documento não está crossOriginIsolated (faltam COOP/COEP)" };
  }
  return { isolated: true };
}
