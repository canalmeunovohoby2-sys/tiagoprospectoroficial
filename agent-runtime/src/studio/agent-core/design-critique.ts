// ============================================================================
// FASE 4 — CRÍTICA VISUAL DO RESULTADO CONSTRUÍDO
//
// Avalia o site que foi REALMENTE construído (arquivos + renderização medida por
// visual-verify/Chromium) contra o ArtDirectionSpec, com:
// - Sinais determinísticos (fontes da direção aplicadas? paleta usada? excesso de
//   centralização/3-cards/bege/glass/raio? plano de seções cumprido?).
// - 1 avaliação de modelo (juízo de direção de arte) — opcional; falha não quebra.
// - Verdict PASS/REVISE: NUNCA aprova com finding "high" ou 3+ "medium".
//
// Não reconstrói nada: a correção (1 rodada, em firstgen-qa) atua nos problemas.
// ============================================================================

import type { ArtDirectionSpec } from "./art-direction.js";
import type { VisualVerification } from "./visual-verify.js";

export type CritiqueSeverity = "high" | "medium" | "low";

export interface CritiqueFinding {
  severity: CritiqueSeverity;
  area: string;
  issue: string;
  fix: string;
}

export interface DesignCritique {
  checked: boolean;
  reason: string;
  verdict: "PASS" | "REVISE";
  findings: CritiqueFinding[];
  deterministic: number;
  model: number;
}

function count(hay: string, re: RegExp): number {
  const m = hay.match(re);
  return m ? m.length : 0;
}

function norm(s: string): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Sinais objetivos do site CONSTRUÍDO (puro — testável sem browser/modelo). */
export function critiqueSignals(spec: ArtDirectionSpec, files: Record<string, string>): CritiqueFinding[] {
  const src = Object.entries(files)
    .filter(([p]) => /\.(tsx?|jsx?|css|html|astro|vue)$/i.test(p))
    .map(([, c]) => String(c ?? ""))
    .join("\n");
  if (!src.trim()) return [];
  const low = norm(src);
  const findings: CritiqueFinding[] = [];
  const add = (severity: CritiqueSeverity, area: string, issue: string, fix: string) => findings.push({ severity, area, issue, fix });

  // 1) Tipografia da direção realmente aplicada?
  const fonts = [spec.typography.heading, spec.typography.body];
  const missingFonts = fonts.filter((f) => f && !low.includes(norm(f)));
  if (missingFonts.length) {
    add("high", "Tipografia", `fontes da direção não aparecem no site: ${missingFonts.join(", ")}`,
      `importar exatamente ${spec.typography.pair} (Google Fonts) e aplicar em headings/corpo`);
  }

  // 2) Paleta intencional presente?
  const hexes = spec.palette.tokens.map((t) => t.hex.toLowerCase());
  const paletteHits = hexes.filter((h) => low.includes(h));
  if (hexes.length && paletteHits.length < Math.min(3, hexes.length)) {
    add("medium", "Paleta", `apenas ${paletteHits.length}/${hexes.length} cores da direção aparecem no código`,
      `usar a paleta definida (${hexes.slice(0, 5).join(", ")}) com propósito`);
  }

  // 3) Centralização excessiva
  const sections = Math.max(1, count(low, /<section/g));
  const centered = count(low, /text-center/g);
  if ((sections >= 3 && centered / sections > 0.55) || centered >= 5) {
    add("medium", "Composição", `${centered} usos de text-center para ${sections} seções — página excessivamente centralizada`,
      "usar alinhamentos assimétricos/à esquerda em pelo menos metade das seções");
  }

  // 4) Repetição de 3 cards
  const grids3 = count(low, /grid-cols-3/g);
  if (grids3 >= 3) {
    add("medium", "Repetição", `${grids3} grids de 3 colunas — padrão de "3 cards" repetido`,
      "variar composições (2/4 colunas, listas editoriais, blocos assimétricos)");
  }

  // 5) Bege/creme como default sem justificativa na paleta
  const beige = count(low, /#(f5f5dc|faf0e6|f7f3e9|f5efe6|efe6da|fbf3e8|fbf9f4|f4f2ee|f6f3ec)/g);
  const paletteHasBeige = hexes.some((h) => /^#(f5f5dc|faf0e6|f7f3e9|f5efe6|efe6da|fbf3e8|fbf9f4|f4f2ee|f6f3ec)$/.test(h));
  if (beige >= 2 && !paletteHasBeige) {
    add("medium", "Paleta", "fundos bege/creme usados fora da paleta da direção",
      "trocar por cores da direção (o bege como default é um vício de site de IA)");
  }

  // 6) Gradiente/glass/raio sem função
  if (count(low, /bg-gradient|linear-gradient/g) >= 3) add("low", "Efeitos", "gradientes repetidos sem justificativa na direção", "usar gradiente apenas onde a direção justificar");
  if (count(low, /backdrop-blur/g) >= 2) add("low", "Efeitos", "glassmorphism repetido", "remover glass sem função de hierarquia");
  const roundy = count(low, /rounded-(full|3xl|2xl|xl)/g);
  const sharp = count(low, /rounded-none|rounded-sm|rounded-\[/g);
  if (roundy >= 12 && sharp === 0) add("low", "Bordas", "cantos muito arredondados em tudo, sem variação", `seguir bordas da direção: ${spec.components.borders}`);

  // 7) Fontes finas sem contraste de peso
  const thin = count(low, /font-thin|font-extralight|font-light/g);
  const strong = count(low, /font-semibold|font-bold|font-extrabold|font-black/g);
  if (thin >= 2 && strong === 0) add("medium", "Tipografia", "apenas pesos finos — falta presença/hierarquia", "usar 600-700 em headings (conforme a direção)");

  // 8) Hero clichê
  const head = low.slice(0, 6000);
  if ((/min-h-screen|h-screen/.test(head)) && /text-center/.test(head) && count(head, /rounded-full/g) >= 2) {
    add("medium", "Hero", "hero no padrão IA: tela cheia + texto centralizado + botões em pílula", `seguir o hero da direção: ${spec.hero.composition}`);
  }

  // 9) Plano de seções
  const ids = spec.sectionPlan.map((s) => s.id).filter(Boolean);
  const hitIds = ids.filter((id) => low.includes(id.replace(/-/g, "")) || low.includes(id));
  if (ids.length >= 4 && hitIds.length / ids.length < 0.6) {
    add("medium", "Estrutura", `plano de seções cumprido em ${hitIds.length}/${ids.length}`,
      `incluir as seções da direção: ${ids.join(", ")}`);
  }

  // 10) Imagens
  const imgs = count(low, /<img/g);
  if (/fotografia|foto|imagem/i.test(spec.photography.direction) && imgs === 0) {
    add("medium", "Imagens", "a direção pede fotografia e o site não tem imagens", "aplicar a linguagem fotográfica da direção (imagens reais/stock curado)");
  }
  if (imgs > 0 && count(low, /alt=|<img[^>]*alt=/g) === 0) add("low", "Acessibilidade", "imagens sem alt", "adicionar alt descritivo e coerente com a imagem");

  // 11) Estrutura mínima
  if (!/<h1/.test(low)) add("high", "Hierarquia", "sem h1 — hierarquia tipográfica quebrada", "definir um h1 claro na abertura");
  if (!/<nav/.test(low)) add("low", "Navegação", "sem elemento de navegação", "criar navegação conforme a direção");
  if (!/<footer/.test(low)) add("low", "Rodapé", "sem rodapé", "fechar a página com rodapé útil (contato/endereço)");
  const secCount = count(low, /<section/g);
  if (secCount > 14) add("low", "Densidade", `${secCount} seções — risco de página longa sem hierarquia`, "consolidar seções repetitivas");

  return findings;
}

const SEVERITIES: CritiqueSeverity[] = ["high", "medium", "low"];

function parseModelFindings(raw: string): CritiqueFinding[] {
  const t = String(raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: any;
  try { obj = JSON.parse(t); } catch { return []; }
  const arr = Array.isArray(obj?.findings) ? obj.findings : [];
  const out: CritiqueFinding[] = [];
  for (const f of arr.slice(0, 5)) {
    const sev = SEVERITIES.find((s) => norm(f?.severity).includes(s));
    const issue = String(f?.issue ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (!sev || !issue) continue;
    out.push({
      severity: sev,
      area: String(f?.area ?? "Design").replace(/\s+/g, " ").trim().slice(0, 40) || "Design",
      issue,
      fix: String(f?.fix ?? "corrigir conforme a direção").replace(/\s+/g, " ").trim().slice(0, 220) || "corrigir conforme a direção",
    });
  }
  return out;
}

function verdictOf(findings: CritiqueFinding[]): "PASS" | "REVISE" {
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  return high > 0 || medium >= 3 ? "REVISE" : "PASS";
}

/** Crítica completa: sinais determinísticos + (no máximo) 1 avaliação de modelo. */
export async function critiqueGeneratedSite(opts: {
  spec: ArtDirectionSpec;
  files: Record<string, string>;
  verification?: VisualVerification | null;
  complete?: (input: { system: string; user: string; maxTokens: number; temperature: number }) => Promise<string>;
  timeoutMs?: number;
}): Promise<DesignCritique> {
  const files = opts.files ?? {};
  if (!Object.keys(files).length) {
    return { checked: false, reason: "sem arquivos do projeto para avaliar", verdict: "REVISE", findings: [], deterministic: 0, model: 0 };
  }

  const findings = critiqueSignals(opts.spec, files);
  const v = opts.verification ?? null;
  if (v) {
    for (const e of (v.criticalErrors ?? []).slice(0, 3)) {
      findings.push({ severity: "high", area: "Renderização", issue: `erro crítico no site renderizado: ${e}`, fix: "corrigir o erro de renderização antes de concluir" });
    }
    for (const p of (v.problems ?? []).slice(0, 3)) {
      findings.push({ severity: "medium", area: "Renderização", issue: p, fix: "corrigir o problema visual apontado pela verificação" });
    }
  }

  let modelFindings: CritiqueFinding[] = [];
  if (opts.complete) {
    const system = [
      "Você é um diretor de arte sênior revisando um site REAL contra a direção de arte DELE.",
      "Avalie personalidade, aderência à direção, tipografia, hero, hierarquia, seções, imagens, repetição, interações e conversão.",
      "Regras: aponte SOMENTE problemas reais e relevantes; não invente; não sugira reformular o projeto inteiro.",
      "Responda JSON: {\"findings\":[{\"severity\":\"high|medium|low\",\"area\":\"...\",\"issue\":\"...\",\"fix\":\"...\"}]} (máximo 5; vazio se estiver bom).",
    ].join("\n");
    const resumo = [
      `DIREÇÃO: ${opts.spec.concept} | tipografia ${opts.spec.typography.pair} | hero ${opts.spec.hero.composition}`,
      `SEÇÕES: ${opts.spec.sectionPlan.map((s) => s.id).join(", ")}`,
      `SINAIS JÁ DETECTADOS: ${findings.map((f) => `${f.severity}:${f.area}:${f.issue}`).join(" | ") || "(nenhum)"}`,
      v ? `VERIFICAÇÃO RENDERIZADA: ${v.report.slice(0, 1800)}` : "VERIFICAÇÃO RENDERIZADA: indisponível nesta execução",
      `TRECHO DO CÓDIGO (classes): ${Object.values(files).join("\n").slice(0, 6000)}`,
    ].join("\n\n");
    const timeoutMs = Math.max(4_000, Math.min(opts.timeoutMs ?? 30_000, 60_000));
    const raw = await Promise.race([
      opts.complete({ system, user: resumo, maxTokens: 900, temperature: 0.3 }).catch(() => ""),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
    ]);
    modelFindings = parseModelFindings(raw).filter(
      (m) => !findings.some((f) => norm(f.issue) === norm(m.issue)),
    );
    findings.push(...modelFindings);
  }

  const verdict = verdictOf(findings);
  return {
    checked: true,
    reason: opts.complete ? "sinais objetivos + avaliação de modelo" : "sinais objetivos (modelo indisponível)",
    verdict,
    findings,
    deterministic: findings.length - modelFindings.length,
    model: modelFindings.length,
  };
}

/** Converte a crítica em instruções de correção (máx. 10) + verdict. */
export function formatCritique(c: DesignCritique): { issues: string[]; pass: boolean } {
  const issues = c.findings
    .slice(0, 10)
    .map((f) => `[${f.severity}] ${f.area}: ${f.issue} → ${f.fix}`);
  return { issues, pass: c.verdict === "PASS" };
}
