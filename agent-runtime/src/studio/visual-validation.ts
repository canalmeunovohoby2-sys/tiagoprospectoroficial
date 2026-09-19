// FASE 4 — VALIDAÇÃO VISUAL REAL (direção → código → render → evidência).
//
// REUTILIZA a infraestrutura existente (nada de mecanismo paralelo):
//   - `prepareSiteServeDir` (server) → compila o React e serve o HTML real;
//   - `BrowserSession` (Chromium/Playwright) → setViewport/open/probePage/measure/screenshot;
//   - `design-direction` (Fase 3) → direção que o site deveria ter cumprido.
//
// PRINCÍPIOS:
//   - evidência concreta, NUNCA "score" nem ranking de qualidade;
//   - somai leitura: não edita o site, não entra em loop de correção;
//   - desktop e mobile (1366×768, 1280×720, 390×844);
//   - `direction.applied` NÃO é prova suficiente: a prova é o RENDER.

import { existsSync } from "node:fs";
import { BrowserSession } from "../browser-session.js";

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
}

/** Viewports proporcionais (as 3 que a fase pede — nem mais, nem menos). */
export const VALIDATION_VIEWPORTS: readonly ViewportSpec[] = [
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "mobile-390", width: 390, height: 844 },
];

export interface ViewportEvidence {
  viewport: string;
  width: number;
  height: number;
  render: "passed" | "failed";
  /** Motivo concreto da falha de render (quando houver). */
  reason?: string;
  console_errors: number;
  failed_requests: number;
  horizontal_overflow: boolean;
  hero_visible: boolean;
  primary_cta_visible: boolean;
  header_present: boolean;
  text_overflow: number;
  images_total: number;
  broken_images: number;
  broken_image_urls: string[];
  sections_total: number;
  empty_sections: number;
  screenshots?: { view: string; path: string }[];
}

export interface DirectionExpectation {
  /** A direção exige fotografia real como protagonista? */
  photoLed?: boolean;
  /** Cores de identidade que DEVEM aparecer no render. */
  brandColors?: string[];
  /** Plano de seções da Fase 3 (texto) — viram expectativas verificáveis. */
  sectionPlan?: string[];
  heroStrategy?: string;
}

export interface DirectionChecks {
  photo_evidence: "passed" | "failed" | "n/a";
  brand_identity: "passed" | "failed" | "n/a";
  sections_expected: string[];
  sections_found: string[];
  sections_missing: string[];
  reasons: string[];
}

export interface VisualValidationResult {
  status: "passed" | "failed";
  reasons: string[];
  viewports: ViewportEvidence[];
  direction: DirectionChecks;
  /** Observações acionáveis da revisão visual por IA (quando solicitada). */
  ai_review?: Record<string, string>;
}

// ── PARTE PURA (testável sem navegador) ───────────────────────────────────────

/** Grupos de palavras que evidenciam cada tipo de seção no TEXTO renderizado. */
const SECTION_HINTS: Array<{ key: string; label: string; match: RegExp; requiresPhotos?: boolean; requiresServices?: boolean; requiresAddress?: boolean }> = [
  { key: "gallery", label: "galeria/prova visual", match: /galeria|gallery|nosso trabalho|nossos trabalhos|resultados|ambientes?/i, requiresPhotos: true },
  { key: "services", label: "serviços", match: /serviços|servicos|soluções|solucoes|o que fazemos|especialidades|tratamentos|cardápio|cardapio|pratos|imóveis|imoveis|produtos/i, requiresServices: true },
  { key: "capabilities", label: "capacidades/especificações", match: /capacidade|capacidades|especifica|tolerância|tolerancia|precisão|precisao|estrutura|equipamentos|tecnologia/i },
  { key: "process", label: "processo/qualidade", match: /processo|método|metodo|qualidade|controle|etapas|como funciona/i },
  { key: "location", label: "localização/atendimento", match: /endereço|endereco|localiza|onde estamos|região|regiao|atendemos|visite|como chegar/i, requiresAddress: true },
  { key: "proof", label: "prova social/confiança", match: /avaliaç|avaliac|depoimento|clientes|confian|desde \d{4}|experiência|experiencia/i },
  { key: "contact", label: "conversão/contato", match: /whatsapp|orçamento|orcamento|fale conosco|contato|agende|solicite|peça|peca/i },
];

export interface DirectionDataHints {
  hasPhotos?: boolean;
  hasServices?: boolean;
  hasAddress?: boolean;
}

/**
 * Expectativas verificáveis derivadas do plano de seções da direção — SÓ as que
 * os dados do negócio sustentam (não exige galeria de quem não tem foto).
 */
export function expectedSections(sectionPlan: string[] | undefined, data: DirectionDataHints): string[] {
  const plan = (sectionPlan ?? []).join(" ").toLowerCase();
  if (!plan) return [];
  const out: string[] = [];
  for (const hint of SECTION_HINTS) {
    if (!hint.match.test(plan)) continue;
    if (hint.requiresPhotos && !data.hasPhotos) continue;
    if (hint.requiresServices && !data.hasServices) continue;
    if (hint.requiresAddress && !data.hasAddress) continue;
    out.push(hint.key);
  }
  return out;
}

const normColor = (c: string): string => String(c ?? "").trim().toLowerCase();

/** A cor de marca aparece no render? (hex computado OU variável/tema detectado) */
export function brandColorPresent(renderedColors: string[], brandColors: string[]): boolean {
  const hay = (renderedColors ?? []).map(normColor);
  for (const c of brandColors ?? []) {
    const want = normColor(c);
    if (!want) continue;
    if (hay.some((h) => h === want)) return true;
    // um hex curto (#0bf) pode aparecer expandido (#00bbff)
    if (want.length === 4) {
      const [r, g, b] = [want[1], want[2], want[3]];
      const expanded = `#${r}${r}${g}${g}${b}${b}`;
      if (hay.some((h) => h === expanded)) return true;
    }
  }
  return false;
}

/** Avalia a DIREÇÃO contra o que realmente renderizou (desktop manda). */
export function checkDirection(
  expectation: DirectionExpectation | undefined,
  desktop: ViewportEvidence | undefined,
  renderedText: string,
  renderedColors: string[],
  data: DirectionDataHints,
): DirectionChecks {
  const exp = expectation ?? {};
  const reasons: string[] = [];
  const text = String(renderedText ?? "");

  let photoEvidence: DirectionChecks["photo_evidence"] = "n/a";
  if (exp.photoLed) {
    const images = desktop?.images_total ?? 0;
    const broken = desktop?.broken_images ?? 0;
    if (images > 0 && broken === 0) {
      photoEvidence = "passed";
    } else {
      photoEvidence = "failed";
      reasons.push(images === 0 ? "direção photo_led: nenhuma imagem renderizada" : `direção photo_led: ${broken} imagem(ns) quebrada(s)`);
    }
  }

  let brandIdentity: DirectionChecks["brand_identity"] = "n/a";
  const brands = (exp.brandColors ?? []).filter(Boolean);
  if (brands.length > 0) {
    brandIdentity = brandColorPresent(renderedColors, brands) ? "passed" : "failed";
    if (brandIdentity === "failed") reasons.push(`identidade: nenhuma das cores da marca apareceu no render (${brands.join(", ")})`);
  }

  const expected = expectedSections(exp.sectionPlan, data);
  const found = expected.filter((key) => {
    const hint = SECTION_HINTS.find((h) => h.key === key);
    if (!hint) return false;
    // Galeria pode não ter texto: as IMAGENS renderizadas são a evidência.
    if (key === "gallery") return hint.match.test(text) || (desktop?.images_total ?? 0) >= 2;
    return hint.match.test(text);
  });
  const missing = expected.filter((k) => !found.includes(k));
  for (const key of missing) {
    const hint = SECTION_HINTS.find((h) => h.key === key);
    reasons.push(`estrutura: seção esperada pela direção não encontrada no render (${hint?.label ?? key})`);
  }

  return { photo_evidence: photoEvidence, brand_identity: brandIdentity, sections_expected: expected, sections_found: found, sections_missing: missing, reasons };
}

/** Consolida o relatório HONESTO (uma falha visual nunca vira "passed"). */
export function summarizeValidation(viewports: ViewportEvidence[], direction: DirectionChecks): { status: "passed" | "failed"; reasons: string[] } {
  const reasons: string[] = [];
  for (const v of viewports) {
    if (v.render === "failed") reasons.push(`${v.viewport}: ${v.reason ?? "render falhou"}`);
    if (v.horizontal_overflow) reasons.push(`${v.viewport}: overflow horizontal`);
    if (v.broken_images > 0) reasons.push(`${v.viewport}: ${v.broken_images} imagem(ns) quebrada(s)`);
    if (!v.hero_visible) reasons.push(`${v.viewport}: hero não visível`);
    if (!v.primary_cta_visible) reasons.push(`${v.viewport}: CTA principal não visível`);
    if (v.text_overflow > 0) reasons.push(`${v.viewport}: ${v.text_overflow} elemento(s) com texto transbordando`);
  }
  reasons.push(...direction.reasons);
  return { status: reasons.length === 0 ? "passed" : "failed", reasons };
}

/** Um viewport só passa quando o render real aconteceu e o essencial existe. */
export function evaluateViewport(input: {
  spec: ViewportSpec;
  probe: { colors: string[]; brokenImages: string[]; overflowX: boolean; consoleErrors: string[]; failedRequests: string[] };
  measurements: { heroVisible: boolean; ctaVisible: boolean; headerPresent: boolean };
  sections: { total: number; empty: number };
  textOverflow: number;
  imagesTotal: number;
  screenshotPaths?: { view: string; path: string }[];
}): ViewportEvidence {
  const renderFailed = !input.measurements.heroVisible && input.sections.total === 0;
  return {
    viewport: input.spec.name,
    width: input.spec.width,
    height: input.spec.height,
    render: renderFailed ? "failed" : "passed",
    reason: renderFailed ? "página sem hero e sem seções (tela branca/erro fatal)" : undefined,
    console_errors: input.probe.consoleErrors.length,
    failed_requests: input.probe.failedRequests.length,
    horizontal_overflow: input.probe.overflowX,
    hero_visible: input.measurements.heroVisible,
    primary_cta_visible: input.measurements.ctaVisible,
    header_present: input.measurements.headerPresent,
    text_overflow: input.textOverflow,
    images_total: input.imagesTotal,
    broken_images: input.probe.brokenImages.length,
    broken_image_urls: input.probe.brokenImages.slice(0, 10),
    sections_total: input.sections.total,
    empty_sections: input.sections.empty,
    screenshots: input.screenshotPaths,
  };
}

// ── PARTE DE RENDER REAL (reutiliza BrowserSession) ───────────────────────────

export interface ValidateRenderedSiteInput {
  /** Workspace REAL do projeto (React → compila; estático → serve direto). */
  root: string;
  /**
   * Prepara o diretório servível do site (injetado pelo server: `prepareSiteServeDir`).
   * Injeção evita dependência circular server ↔ validação.
   */
  prepare: (root: string) => Promise<{ dir: string; temp?: string }>;
  direction?: DirectionExpectation;
  data?: DirectionDataHints;
  viewports?: readonly ViewportSpec[];
  /** Salvar screenshots (evidência) — desligado por padrão nos testes. */
  screenshots?: boolean;
  /** Análise visual por IA (Gemini existente) — opcional e nunca obrigatória. */
  aiReview?: (screenshotPath: string, context: { business?: string; direction?: DirectionExpectation }) => Promise<Record<string, string> | null>;
  businessName?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Valida o site REAL renderizado: compila/serve (infra existente), abre no
 * Chromium, mede e devolve EVIDÊNCIA por viewport + comparação com a direção.
 * Somente leitura: não altera o workspace nem dispara correções.
 */
export async function validateRenderedSite(input: ValidateRenderedSiteInput): Promise<VisualValidationResult> {
  const specs = input.viewports ?? VALIDATION_VIEWPORTS;
  const served = await input.prepare(input.root);
  const session = new BrowserSession(served.dir);
  const viewports: ViewportEvidence[] = [];
  let desktopEvidence: ViewportEvidence | undefined;
  let renderedText = "";
  let renderedColors: string[] = [];
  let firstShot: string | null = null;
  try {
    const base = await session.startServer();
    for (const spec of specs) {
      await session.open(base, { width: spec.width, height: spec.height });
      await sleep(800);
      const probe = await session.probePage();
      const measured = await session.measure(["header", "nav", "h1", "section", "footer", 'a[href*="wa.me"]', 'a[href^="tel:"]', "button", "img"], 8).catch(() => null);
      const extra = await session.evaluate(`(() => {
        const text = (document.body?.innerText || "").slice(0, 20000);
        const sections = Array.from(document.querySelectorAll("section"));
        let empty = 0;
        for (const s of sections) if (!(s.innerText || "").trim() && !s.querySelector("img,svg,video,canvas")) empty += 1;
        let textOverflow = 0;
        for (const el of Array.from(document.querySelectorAll("h1,h2,h3,p,a,button,li"))) {
          if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) textOverflow += 1;
        }
        return { text, sections: sections.length, empty, textOverflow, images: document.images.length };
      })()`).catch(() => ({ ok: false as const, value: undefined }));
      const value = (extra as { value?: { text?: string; sections?: number; empty?: number; textOverflow?: number; images?: number } }).value ?? {};
      const elements = measured?.elements ?? [];
      const visibleEl = (needle: string) =>
        elements.some((e) => e.selector.includes(needle) && !e.notFound && (e.box?.width ?? 0) > 0 && (e.box?.height ?? 0) > 0);
      const shots: { view: string; path: string }[] = [];
      if (input.screenshots) {
        const path = await session.screenshot(`fase4-${spec.name}`, { fullPage: false }).catch(() => "");
        if (path) shots.push({ view: spec.name, path });
        if (spec === specs[0] && path) firstShot = path;
      }
      const evidence = evaluateViewport({
        spec,
        probe,
        measurements: {
          heroVisible: visibleEl("h1") || visibleEl("header"),
          ctaVisible: visibleEl("wa.me") || visibleEl("tel:") || visibleEl("button"),
          headerPresent: visibleEl("header") || visibleEl("nav"),
        },
        sections: { total: Number(value.sections ?? 0), empty: Number(value.empty ?? 0) },
        textOverflow: Number(value.textOverflow ?? 0),
        imagesTotal: Number(value.images ?? 0),
        screenshotPaths: shots,
      });
      viewports.push(evidence);
      if (spec.name.startsWith("desktop") && !desktopEvidence) {
        desktopEvidence = evidence;
        renderedText = String(value.text ?? "");
        renderedColors = probe.colors ?? [];
      }
    }
  } finally {
    await session.close().catch(() => {});
    if (served.temp) { try { const { rmSync } = await import("node:fs"); rmSync(served.temp, { recursive: true, force: true }); } catch { /* noop */ } }
  }

  const direction = checkDirection(input.direction, desktopEvidence, renderedText, renderedColors, input.data ?? {});
  const summary = summarizeValidation(viewports, direction);
  const result: VisualValidationResult = { status: summary.status, reasons: summary.reasons, viewports, direction };
  if (input.aiReview && firstShot && existsSync(firstShot)) {
    try {
      const review = await input.aiReview(firstShot, { business: input.businessName, direction: input.direction });
      if (review && Object.keys(review).length > 0) result.ai_review = review;
    } catch { /* revisão por IA é opcional: nunca derruba a validação */ }
  }
  return result;
}
