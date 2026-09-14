// Origem React (C3) — normalização de `_debugSource` e construção do descritor
// de seleção a partir do helper que roda DENTRO do app (WebContainer/Vite).

import { normalizeStudioPath } from "./fileTree";
import type { StudioElementDescriptor, StudioReactSource, StudioRect } from "./bridgeProtocol";

/**
 * Normaliza o `fileName` do `_debugSource` para um caminho relativo do workspace.
 * Aceita `/src/App.tsx`, `src/App.tsx`, `file:///.../src/App.tsx` e caminhos
 * absolutos do SO. Nunca devolve caminho sensível/`..`.
 */
export function normalizeReactSourcePath(raw: string): string | null {
  let p = String(raw ?? "").trim();
  if (!p) return null;
  p = p.replace(/^file:\/\//i, "").replace(/\\/g, "/");
  p = p.split("?")[0].split("#")[0];
  const srcIdx = p.lastIndexOf("/src/");
  if (srcIdx >= 0) {
    p = p.slice(srcIdx + 1); // mantém "src/..."
  } else {
    p = p.replace(/^\/+/, "");
    const rootIdx = p.indexOf("src/");
    if (rootIdx > 0) p = p.slice(rootIdx);
  }
  const norm = normalizeStudioPath(p);
  if (!norm) return null;
  if (norm.split("/").some((s) => s === "..")) return null;
  if (/\.env/i.test(norm)) return null;
  return norm;
}

export interface ReactSelectionInput {
  tagName?: string;
  id?: string;
  className?: string;
  selector?: string;
  path?: string;
  innerText?: string;
  attributes?: Record<string, string>;
  rect?: StudioRect;
  /** `_debugSource` cru do fiber React. */
  source?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
  /** Nome do componente React (fiber.type/elementType.displayName|name). */
  componentName?: string | null;
}

/** Constrói o descritor de seleção a partir do payload do helper React. */
export function descriptorFromReactSelection(input: ReactSelectionInput): StudioElementDescriptor {
  const file = input.source?.fileName ? normalizeReactSourcePath(input.source.fileName) : null;
  const reactSource: StudioReactSource | undefined = file
    ? {
        file,
        line: typeof input.source?.lineNumber === "number" ? input.source.lineNumber : undefined,
        column: typeof input.source?.columnNumber === "number" ? input.source.columnNumber : undefined,
        componentName: input.componentName ?? undefined,
      }
    : undefined;
  const tag = String(input.tagName ?? "").toLowerCase();
  return {
    tagName: tag || "element",
    id: input.id || undefined,
    classes: String(input.className ?? "").split(/\s+/).filter(Boolean).slice(0, 12),
    attributes: input.attributes ?? {},
    selector: input.selector || tag || "element",
    path: input.path || "",
    text: input.innerText ? input.innerText.replace(/\s+/g, " ").trim().slice(0, 120) : undefined,
    rect: input.rect ?? { x: 0, y: 0, width: 0, height: 0 },
    reactSource,
  };
}
