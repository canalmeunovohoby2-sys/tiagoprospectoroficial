// VISUAL VERIFIER (ferramenta `visual_verify` do Coder).
//
// Arquitetura: o Coder (DeepSeek) age; esta ferramenta apenas OBSERVA → ANALISA
// → RELATA. Ela NUNCA edita arquivos. Reutiliza a infra existente de browser
// (Playwright/Chromium via BrowserSession) e o build do site (prepareSiteServeDir).
//
// Fluxo: DeepSeek edita → visual_verify abre o site REAL → coleta render/DOM/CSS
// + screenshots (desktop/tablet/mobile) → compara com a identidade ANTERIOR
// (quando informada) → devolve PASS/FAIL estruturado com o que continua errado.

import { BrowserSession } from "../../browser-session.js";
import type { BusinessContext } from "../../tools.js";

export type VisualVerdict = "PASS" | "FAIL";

export interface VisualViewportResult {
  device: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
  ok: boolean;
  consoleErrors: string[];
  failedRequests: string[];
  brokenImages: string[];
  /** Cores presentes (hex normalizado) — evidência objetiva do que está na tela. */
  colors: string[];
  /** Ocorrências da identidade ANTIGA ainda visíveis. */
  leftovers: string[];
  /** Cor nova pedida apareceu? */
  targetFound: boolean;
  overflowX: boolean;
}

export interface VisualVerification {
  verdict: VisualVerdict;
  objective: string;
  viewports: VisualViewportResult[];
  /** Problemas por dispositivo (texto pronto para o modelo). */
  problems: string[];
  /** CSS/identidade antiga remanescente (globais). */
  cssLeftovers: string[];
  brokenElements: number;
  criticalErrors: string[];
  screenshots: Array<{ device: string; path: string }>;
  /** Relatório em texto (é o que volta ao DeepSeek). */
  report: string;
}

export const VISUAL_VIEWPORTS: Array<{ device: "desktop" | "tablet" | "mobile"; width: number; height: number }> = [
  { device: "desktop", width: 1366, height: 768 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "mobile", width: 390, height: 844 },
];

/** Famílias de cor que o verificador reconhece (nome PT/EN → tokens). */
export const VERIFY_COLOR_FAMILIES: Array<{ re: RegExp; label: string; tokens: string[] }> = [
  { re: /verde|\bgreen\b/i, label: "verde", tokens: ["#16a34a", "#22c55e", "#10b981", "#059669", "green", "emerald", "green-600", "green-500", "green-700"] },
  { re: /vermelh|\bred\b/i, label: "vermelho", tokens: ["#dc2626", "#ef4444", "#f87171", "#b91c1c", "red", "red-600", "red-500", "red-700"] },
  { re: /azul|\bblue\b|\bsky\b/i, label: "azul", tokens: ["#2563eb", "#3b82f6", "#0ea5e9", "blue", "sky", "blue-600", "blue-500"] },
  { re: /amarel|\byellow\b|\bamber\b/i, label: "amarelo", tokens: ["#eab308", "#facc15", "#f59e0b", "yellow", "amber", "yellow-500"] },
  { re: /laranja|\borange\b/i, label: "laranja", tokens: ["#f97316", "#fb923c", "orange", "orange-500"] },
  { re: /roxo|violeta|\bviolet\b|\bpurple\b/i, label: "roxo", tokens: ["#7c3aed", "#8b5cf6", "purple", "violet", "indigo"] },
  { re: /roxo|rosa|\bpink\b|\brose\b/i, label: "rosa", tokens: ["#db2777", "#ec4899", "pink", "rose"] },
  { re: /dourad|\bgold\b/i, label: "dourado", tokens: ["#d4af37", "#f3e5ab", "#c8a25a", "amber", "yellow"] },
  { re: /preto|\bblack\b|escuro|\bdark\b/i, label: "preto", tokens: ["#000000", "#050505", "#0d0e12", "#0f172a", "black", "slate-900", "zinc-900"] },
  { re: /branco|\bwhite\b|claro|\blight\b/i, label: "branco", tokens: ["#ffffff", "#f8fafc", "#f1f5f9", "white"] },
];

/** Famílias nomeadas no pedido do usuário. */
export function requestedColorFamilies(objective: string): typeof VERIFY_COLOR_FAMILIES {
  return VERIFY_COLOR_FAMILIES.filter((f) => f.re.test(String(objective ?? "")));
}

/**
 * Interpreta "troque X para Y" (ou ->, por, to): o que vem ANTES do conector é a
 * identidade ANTIGA (que NÃO pode sobrar) e o que vem DEPOIS é a NOVA (que deve
 * aparecer). Sem conector, todas as famílias citadas contam como "antigas".
 */
export function parseColorSwap(objective: string): { oldTokens: string[]; newTokens: string[]; hasSwap: boolean } {
  const text = String(objective ?? "");
  const split = text.split(/\bpara\b|\bpor\b|->|→|\bto\b/i);
  const before = split[0] ?? text;
  const after = split.slice(1).join(" ");
  const fams = (s: string) => VERIFY_COLOR_FAMILIES.filter((f) => f.re.test(s));
  const oldTokens = [...new Set(fams(before).flatMap((f) => f.tokens))].map((t) => t.toLowerCase());
  const newTokens = [...new Set(fams(after).flatMap((f) => f.tokens))].map((t) => t.toLowerCase());
  const allOld = [...new Set(fams(text).flatMap((f) => f.tokens))].map((t) => t.toLowerCase());
  const hasSwap = newTokens.length > 0 && oldTokens.length > 0;
  return { oldTokens: hasSwap ? oldTokens : allOld, newTokens, hasSwap };
}

function norm(hex: string): string {
  return hex.trim().toLowerCase();
}

/**
 * Analisa a evidência de UM viewport e diz se a alteração foi cumprida.
 * (Função pura — testável sem browser.)
 */
export function analyzeViewport(input: {
  objective: string;
  device: string;
  colors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  brokenImages: string[];
  overflowX: boolean;
  /** Identidade anterior (tokens) observada ANTES da edição. */
  previousColors?: string[];
}): VisualViewportResult {
  const swap = parseColorSwap(input.objective);
  const present = new Set(input.colors.map(norm));

  // Cor NOVA pedida apareceu? (sem troca nomeada → não exige cor específica)
  const targetFound = swap.newTokens.length === 0 ? true : swap.newTokens.some((t) => present.has(t));

  // Identidade ANTIGA ainda VISÍVEL? Só tokens da família antiga pedida (evita
  // falso positivo com cores que não fazem parte da troca) — QUALQUER sobra = FAIL.
  const leftovers = swap.oldTokens.filter((t) => present.has(t));

  const consoleErrors = input.consoleErrors.filter((e) => !/favicon|manifest|hot-update|Download the React DevTools/i.test(e));
  const ok = consoleErrors.length === 0 && input.brokenImages.length === 0
    && leftovers.length === 0 && targetFound && !input.overflowX;

  return {
    device: input.device as VisualViewportResult["device"],
    width: 0,
    height: 0,
    ok,
    consoleErrors,
    failedRequests: input.failedRequests,
    brokenImages: input.brokenImages,
    colors: [...present],
    leftovers,
    targetFound,
    overflowX: input.overflowX,
  };
}

/** Relatório estruturado (texto que volta ao DeepSeek). */
export function formatVisualReport(v: Omit<VisualVerification, "report">): string {
  const lines: string[] = [];
  lines.push(`VISUAL VERIFICATION: ${v.verdict}`);
  lines.push("");
  lines.push(`Request:\n"${v.objective}"`);
  lines.push("");
  for (const vp of v.viewports) lines.push(`${vp.device === "desktop" ? "Desktop" : vp.device === "tablet" ? "Tablet" : "Mobile"}: ${vp.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  if (v.verdict === "FAIL") {
    lines.push("Remaining visual problems:");
    if (v.problems.length === 0) lines.push("* (sem problemas objetivos detectados)");
    else for (const p of v.problems) lines.push(`* ${p}`);
    lines.push("");
    lines.push("Remaining CSS / old identity:");
    if (v.cssLeftovers.length === 0) lines.push("* none");
    else for (const c of v.cssLeftovers) lines.push(`* ${c}`);
    lines.push("");
    lines.push(`Broken elements: ${v.brokenElements}`);
    if (v.criticalErrors.length) { lines.push(""); lines.push("Critical errors:"); for (const e of v.criticalErrors) lines.push(`* ${e}`); }
    lines.push("");
    lines.push("Required action:\nContinue editing.\nDo not conclude the task.");
    lines.push("");
    lines.push("(Screenshots capturados no Chromium real — a ferramenta NÃO edita arquivos; a correção é sua.)");
  } else {
    lines.push("Request fully satisfied.");
    lines.push("");
    lines.push("Remaining old visual identity: none");
    lines.push("Critical rendering errors: none");
    lines.push("");
    lines.push("The task may be concluded.");
  }
  return lines.join("\n");
}

/** Applitools é OPCIONAL: sem chave configurada, a verificação é 100% local. */
export function applitoolsEnabled(): boolean {
  return typeof process !== "undefined" && !!process.env.APPLITOOLS_API_KEY;
}

/**
 * Executa a verificação REAL no Chromium (desktop/tablet/mobile) e devolve o
 * relatório. NÃO edita arquivos. `serveDir` deve conter um `index.html` servível
 * (use `prepareSiteServeDir` para projetos React).
 */
export async function runVisualVerification(opts: {
  serveDir: string;
  objective: string;
  previousColors?: string[];
  viewports?: typeof VISUAL_VIEWPORTS;
}): Promise<VisualVerification> {
  const viewports = opts.viewports ?? VISUAL_VIEWPORTS;
  const session = new BrowserSession(opts.serveDir);
  const results: VisualViewportResult[] = [];
  const screenshots: Array<{ device: string; path: string }> = [];
  let base = "";
  try {
    base = await session.startServer();
    await session.open(base, { width: viewports[0].width, height: viewports[0].height });
    for (const vp of viewports) {
      await session.setViewport(vp.width, vp.height);
      await session.reload();
      await new Promise((r) => setTimeout(r, 1400)); // React monta e imagens começam
      const probe = await session.probePage(); // render/DOM/CSS coletados no Chromium
      const shot = await session.screenshot(`visual-${vp.device}`, { fullPage: false }).catch(() => "");
      if (shot) screenshots.push({ device: vp.device, path: shot });
      const r = analyzeViewport({
        objective: opts.objective, device: vp.device,
        colors: probe.colors, consoleErrors: probe.consoleErrors, failedRequests: probe.failedRequests,
        brokenImages: probe.brokenImages, overflowX: probe.overflowX, previousColors: opts.previousColors,
      });
      results.push({ ...r, width: vp.width, height: vp.height });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({
      device: "desktop", width: viewports[0].width, height: viewports[0].height, ok: false,
      consoleErrors: [`falha ao abrir o site: ${msg}`], failedRequests: [], brokenImages: [], colors: [], leftovers: [], targetFound: false, overflowX: false,
    });
  } finally {
    await session.close().catch(() => { /* noop */ });
  }

  const problems: string[] = [];
  const cssLeftovers: string[] = [];
  for (const r of results) {
    if (!r.ok) {
      const label = r.device === "desktop" ? "Desktop" : r.device === "tablet" ? "Tablet" : "Mobile";
      if (r.leftovers.length) problems.push(`${label}: identidade antiga ainda visível (${r.leftovers.slice(0, 6).join(", ")})`);
      if (!r.targetFound) problems.push(`${label}: a cor pedida NÃO aparece`);
      if (r.brokenImages.length) problems.push(`${label}: ${r.brokenImages.length} imagem(ns) quebrada(s): ${r.brokenImages.slice(0, 3).join(", ")}`);
      if (r.overflowX) problems.push(`${label}: overflow horizontal`);
      for (const e of r.consoleErrors.slice(0, 2)) problems.push(`${label}: erro de console — ${e}`);
    }
    cssLeftovers.push(...r.leftovers);
  }
  const criticalErrors = results.flatMap((r) => r.consoleErrors);
  const brokenElements = results.reduce((n, r) => n + r.brokenImages.length, 0);
  const verdict: VisualVerdict = results.every((r) => r.ok) ? "PASS" : "FAIL";

  const partial: Omit<VisualVerification, "report"> = {
    verdict, objective: opts.objective, viewports: results,
    problems: [...new Set(problems)],
    cssLeftovers: [...new Set(cssLeftovers)],
    brokenElements, criticalErrors: [...new Set(criticalErrors)], screenshots,
  };
  return { ...partial, report: formatVisualReport(partial) };
}

/** Nome do arquivo/paths usados para informar o objetivo ao verificador. */
export function objectiveFromInstruction(instruction: string, business?: BusinessContext): string {
  const b = business?.name ? ` (${business.name})` : "";
  return `${String(instruction ?? "").trim()}${b}`;
}

// ── Estado por execução (para o loop de correção do Coder) ──
const VISUAL_STATE = new Map<string, { fails: number; last: VisualVerdict | null; lastReport: string }>();
export const VISUAL_MAX_CYCLES = 3;

export function noteVisualResult(root: string, verdict: VisualVerdict, report: string): void {
  const prev = VISUAL_STATE.get(root) ?? { fails: 0, last: null, lastReport: "" };
  VISUAL_STATE.set(root, { fails: verdict === "FAIL" ? prev.fails + 1 : 0, last: verdict, lastReport: report });
}
export function visualState(root: string): { fails: number; last: VisualVerdict | null; lastReport: string } {
  return VISUAL_STATE.get(root) ?? { fails: 0, last: null, lastReport: "" };
}
export function resetVisualState(root: string): void { VISUAL_STATE.delete(root); }

/**
 * Prepara um diretório SERVIDO do site real (compila React quando for o caso),
 * sem depender do server.ts (evita ciclo de import). Mesma estratégia do /capture.
 */
export async function prepareServeDirForRoot(root: string, buildReactProject: (root: string) => Promise<{ ok: boolean; html?: string; error?: string }>): Promise<{ dir: string; temp?: string }> {
  const { existsSync, mkdtempSync, writeFileSync, cpSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const isReact = existsSync(join(root, "package.json")) && (existsSync(join(root, "src")) || existsSync(join(root, "vite.config.ts")) || existsSync(join(root, "vite.config.js")));
  if (!isReact) return { dir: root };
  const built = await buildReactProject(root);
  if (!built.ok || !built.html) throw new Error(built.error || "Falha ao compilar o site para verificação visual.");
  const dir = mkdtempSync(join(tmpdir(), "prospector-visual-"));
  writeFileSync(join(dir, "index.html"), built.html, "utf8");
  // ASSETS PÚBLICOS: copia `public/` para o diretório servido — senão a logo/imagem
  // do projeto (ex.: /assets/logo.png) não apareceria no site verificado/visualizado.
  try {
    const pub = join(root, "public");
    if (existsSync(pub)) cpSync(pub, dir, { recursive: true });
  } catch { /* sem public/ ou cópia falhou: segue com o HTML */ }
  return { dir, temp: dir };
}
