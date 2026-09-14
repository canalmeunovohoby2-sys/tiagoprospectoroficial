// Protocolo do BRIDGE Preview ↔ Studio (Fase 4).
//
// O Preview roda em iframe `srcDoc` SANDBOX sem `allow-same-origin` (origem
// opaca). A comunicação é feita por `postMessage` com:
//   - canal fixo (`channel`) e VERSÃO do protocolo;
//   - TOKEN de sessão gerado a cada build do documento (invalida mensagens de
//     previews antigos);
//   - validação de `event.source` (a janela do iframe) no painel;
//   - validação de payload por type guard (nunca aceitar objeto arbitrário).
//
// O bridge é SOMENTE uma ponte de informação: o Preview nunca recebe acesso a
// filesystem, ferramentas, credenciais ou APIs privilegiadas.

import type { StudioDevice } from "./types";

export const STUDIO_BRIDGE_CHANNEL = "prospector-studio-bridge";
export const STUDIO_BRIDGE_VERSION = 1;

export interface StudioRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Origem de componente React (`_debugSource` do Vite dev / @vitejs/plugin-react). */
export interface StudioReactSource {
  file: string;
  line?: number;
  column?: number;
  componentName?: string;
}

/** Descrição do elemento selecionado, produzida DENTRO do preview. */
export interface StudioElementDescriptor {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  /** Seletor CSS estável (#id ou cadeia tag:nth-of-type). */
  selector: string;
  /** Cadeia estrutural indexada (html>body>section...). */
  path: string;
  /** Texto visível truncado (útil para matcher; nunca única fonte). */
  text?: string;
  rect: StudioRect;
  /** `arquivo:linha` quando o documento de preview foi anotado (sourceMap). */
  pfsrc?: string;
  /** Origem React real (prioridade máxima quando presente). */
  reactSource?: StudioReactSource;
}

export interface StudioViewportInfo {
  device: StudioDevice;
  width: number;
  height: number;
}

export type StudioBridgeMessageType =
  | "preview_ready"
  | "inspect_hover"
  | "element_selected"
  | "inspect_clear"
  | "preview_error"
  | "console"
  | "inspect_set"
  | "viewport_set";

interface StudioBridgeEnvelope {
  channel: string;
  version: number;
  token: string;
  type: StudioBridgeMessageType;
}

/** Mensagens Preview → Studio. */
export type StudioBridgeChildMessage =
  | (StudioBridgeEnvelope & { type: "preview_ready"; capabilities: string[] })
  | (StudioBridgeEnvelope & { type: "inspect_hover"; element: StudioElementDescriptor })
  | (StudioBridgeEnvelope & { type: "element_selected"; element: StudioElementDescriptor; viewport: StudioViewportInfo })
  | (StudioBridgeEnvelope & { type: "inspect_clear" })
  | (StudioBridgeEnvelope & { type: "preview_error"; message: string; source?: string; line?: number; column?: number })
  | (StudioBridgeEnvelope & { type: "console"; level: "log" | "warn" | "error"; message: string });

/** Mensagens Studio → Preview. */
export type StudioBridgeParentMessage =
  | (StudioBridgeEnvelope & { type: "inspect_set"; active: boolean })
  | (StudioBridgeEnvelope & { type: "inspect_clear" })
  | (StudioBridgeEnvelope & { type: "viewport_set"; device: StudioDevice; width: number; height: number });

const CHILD_TYPES = new Set<StudioBridgeMessageType>([
  "preview_ready",
  "inspect_hover",
  "element_selected",
  "inspect_clear",
  "preview_error",
  "console",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRect(value: unknown): value is StudioRect {
  if (!isRecord(value)) return false;
  return ["x", "y", "width", "height"].every((k) => typeof value[k] === "number" && Number.isFinite(value[k]));
}

function isElementDescriptor(value: unknown): value is StudioElementDescriptor {
  if (!isRecord(value)) return false;
  if (typeof value.tagName !== "string" || !value.tagName) return false;
  if (!Array.isArray(value.classes) || !value.classes.every((c) => typeof c === "string")) return false;
  if (typeof value.selector !== "string" || typeof value.path !== "string") return false;
  if (!isRect(value.rect)) return false;
  if (value.attributes !== undefined && !isRecord(value.attributes)) return false;
  if (value.text !== undefined && typeof value.text !== "string") return false;
  if (value.pfsrc !== undefined && typeof value.pfsrc !== "string") return false;
  if (value.reactSource !== undefined) {
    const rs = value.reactSource;
    if (!isRecord(rs) || typeof rs.file !== "string" || !rs.file) return false;
    if (rs.line !== undefined && typeof rs.line !== "number") return false;
    if (rs.column !== undefined && typeof rs.column !== "number") return false;
    if (rs.componentName !== undefined && typeof rs.componentName !== "string") return false;
  }
  return true;
}

/**
 * Valida e tipa uma mensagem vinda do Preview. Retorna null para qualquer coisa
 * fora do contrato (canal/versão/type/payload inválidos).
 */
export function parseStudioBridgeChildMessage(
  data: unknown,
  expectedToken?: string,
): StudioBridgeChildMessage | null {
  if (!isRecord(data)) return null;
  if (data.channel !== STUDIO_BRIDGE_CHANNEL) return null;
  if (data.version !== STUDIO_BRIDGE_VERSION) return null;
  if (typeof data.token !== "string" || !data.token) return null;
  if (expectedToken !== undefined && data.token !== expectedToken) return null;
  const type = data.type;
  if (typeof type !== "string" || !CHILD_TYPES.has(type as StudioBridgeMessageType)) return null;

  switch (type as StudioBridgeMessageType) {
    case "preview_ready":
      return Array.isArray(data.capabilities) && data.capabilities.every((c) => typeof c === "string")
        ? (data as unknown as StudioBridgeChildMessage)
        : null;
    case "inspect_hover":
      return isElementDescriptor(data.element) ? (data as unknown as StudioBridgeChildMessage) : null;
    case "element_selected":
      if (!isElementDescriptor(data.element)) return null;
      if (!isRecord(data.viewport)) return null;
      if (typeof data.viewport.width !== "number" || typeof data.viewport.height !== "number") return null;
      return data as unknown as StudioBridgeChildMessage;
    case "inspect_clear":
      return data as unknown as StudioBridgeChildMessage;
    case "preview_error":
      return typeof data.message === "string" ? (data as unknown as StudioBridgeChildMessage) : null;
    case "console":
      return (data.level === "log" || data.level === "warn" || data.level === "error") && typeof data.message === "string"
        ? (data as unknown as StudioBridgeChildMessage)
        : null;
    default:
      return null;
  }
}
