// Mockup apply (6.10) — motor de APLICAÇÃO real da identidade (SVG) em um mockup
// compatível (web application + acceptsSvg). Compõe o SVG sobre o ASSET REAL na
// applicationArea conhecida, renderiza via Playwright e gera um NOVO render,
// preservando o asset original. Estados: applied | validated | unsupported | failed.
// NÃO desenha mockup falso; NÃO inventa coords; PSD/Smart Object → unsupported.
import { copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { MockupTemplate, MockupApplicationArea } from "./mockup-library.js";
import { validateAssetFile } from "./mockup-acquire.js";
import { BrowserSession } from "./browser-session.js";

export type ApplyStatus = "applied" | "validated" | "unsupported" | "failed";

export interface ApplyData {
  status: ApplyStatus;
  reason?: string;
  method?: string;
  width?: number;
  height?: number;
  assetPath?: string;
  brandSvg?: string;
  area?: { x: number; y: number; width: number; height: number; rotation?: number; mask?: string; scale?: number; blend?: string };
  placement?: string;
  validations: string[];
  error?: string;
  outputPath?: string;
}

export interface ApplyInput {
  brandSvg: string;
  template: MockupTemplate;
  assetPath: string;
  applicationArea?: MockupApplicationArea;
  assetWidth?: number;
  assetHeight?: number;
}

export interface ApplyOptions { render?: boolean; workspaceDir?: string; timeoutMs?: number; }

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Núcleo PURO: valida compatibilidade + área conhecida + asset presente. */
export function applyBrandToMockupCore(input: ApplyInput): ApplyData {
  const t = input.template;
  const base: ApplyData = { status: "applied", method: "web-compose", validations: [] };

  if (t.capabilities?.requiresPsd && t.capabilities?.smartObjectStatus !== "confirmed") {
    return { ...base, status: "unsupported", reason: "psd_smart_object_unknown", method: "unsupported", validations: ["PSD com Smart Object não comprovado — não suportado sem evidência"] };
  }
  if (!t.capabilities?.supportsWebApplication || !t.capabilities?.acceptsSvg) {
    return { ...base, status: "unsupported", reason: "not_web_svg", method: "unsupported", validations: ["template não suporta aplicação web/SVG"] };
  }
  if (!existsSync(input.assetPath)) {
    return { ...base, status: "failed", reason: "asset_missing", error: "asset_missing", validations: ["asset inexistente"] };
  }
  const v = validateAssetFile(input.assetPath);
  if (!v.ok) return { ...base, status: "failed", reason: "asset_invalid", error: "asset_invalid", validations: [v.error ?? "asset inválido"] };

  const area = input.applicationArea;
  const hasArea = area && typeof area.x === "number" && typeof area.y === "number" && typeof area.width === "number" && typeof area.height === "number";
  if (!hasArea) return { ...base, status: "unsupported", reason: "application_area_unknown", method: "unsupported", validations: [] };

  const svg = String(input.brandSvg ?? "");
  if (!svg.trim().startsWith("<svg")) return { ...base, status: "failed", reason: "invalid_svg", error: "invalid_svg", validations: ["SVG inválido"] };

  const width = input.assetWidth ?? v.width ?? 1000;
  const height = input.assetHeight ?? v.height ?? 700;
  return {
    status: "applied", method: "web-compose", width, height,
    assetPath: input.assetPath, brandSvg: svg,
    area: { x: area.x!, y: area.y!, width: area.width!, height: area.height!, rotation: area.rotation ?? 0, ...(area.mask ? { mask: area.mask } : {}) },
    placement: t.application.placement,
    validations: ["svg embutido", "área conhecida", "asset real presente"],
  };
}

/** Composição técnica (HTML) do asset real + SVG posicionado na área. */
export function buildComposeHtml(data: ApplyData, assetSrcRelative: string): string {
  const a = data.area!;
  const rot = a.rotation ?? 0;
  const clip = a.mask ? `clip-path:${esc(a.mask)};` : "overflow:hidden;";
  const w = data.width ?? 1000, h = data.height ?? 700;
  return `<!doctype html><html><head><style>body{margin:0;width:${w}px;height:${h}px}
.stage{position:relative;width:${w}px;height:${h}px}
.stage img{width:100%;height:100%;object-fit:cover;display:block}
.brand{position:absolute;left:${a.x}px;top:${a.y}px;width:${a.width}px;height:${a.height}px;transform:rotate(${rot}deg);${clip}}
.brand svg{width:100%;height:100%}</style></head>
<body><div class="stage"><img src="${esc(assetSrcRelative)}" alt="mockup"/><div class="brand">${data.brandSvg}</div></div></body></html>`;
}

/** Render REAL via Playwright: screenshot do asset original + SVG aplicado (novo arquivo). */
export async function renderMockup(data: ApplyData, workspaceDir: string, assetSrc: string): Promise<ApplyData> {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(workspaceDir, { recursive: true });
  const assetName = basename(assetSrc) || "asset.png";
  copyFileSync(assetSrc, join(workspaceDir, assetName));
  writeFileSync(join(workspaceDir, "index.html"), buildComposeHtml(data, assetName));
  const s = new BrowserSession(workspaceDir);
  try {
    await s.open("/", { width: data.width ?? 1000, height: data.height ?? 700 });
    await new Promise((r) => setTimeout(r, 200));
    const out = await s.screenshot("applied-mockup", { fullPage: false });
    return { ...data, outputPath: out, status: "validated", method: "web-compose+render", validations: [...data.validations, "render real do asset+svg gerado"] };
  } finally {
    await s.close();
  }
}

/** Executa o pipeline: núcleo → (se render) composição real no browser → saída. */
export async function applyBrandToMockup(input: ApplyInput, opts: ApplyOptions = {}): Promise<ApplyData> {
  const plan = applyBrandToMockupCore(input);
  if (!opts.render || plan.status !== "applied") return plan;
  if (!opts.workspaceDir) return { ...plan, status: "failed", reason: "no_workspace", error: "workspaceDir obrigatório para render", validations: ["sem workspace para render"] };
  return renderMockup(plan, opts.workspaceDir, input.assetPath);
}
