// Tipos compartilhados do Site Studio (Fase 1 — shell/UI).

export type StudioView = "preview" | "code" | "split";
export type StudioDevice = "desktop" | "tablet" | "mobile";
export type StudioFileMap = Record<string, string>;

export interface StudioFileNode {
  name: string;
  path: string;
  isDir: boolean;
  children: StudioFileNode[];
}

export interface StudioTab {
  path: string;
  name: string;
  dirty: boolean;
}

/** Elemento selecionado no preview (Fase 4) + origem resolvida (source map). */
export interface StudioSelection {
  selector: string;
  tagName?: string;
  text?: string;
  /** `arquivo:linha` bruto vindo do `data-pfsrc` (quando houver). */
  source?: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  path?: string;
  rect?: { x: number; y: number; width: number; height: number };
  /** Nome do componente React (`_debugSource`/fiber) quando disponível. */
  componentName?: string;
  /** Resultado do source map: resolved / unresolved / unsupported. */
  sourceLocation?: {
    status: "resolved" | "unresolved" | "unsupported";
    file?: string;
    line?: number;
    column?: number;
    reason?: string;
    confidence?: "exact" | "heuristic";
  };
}
