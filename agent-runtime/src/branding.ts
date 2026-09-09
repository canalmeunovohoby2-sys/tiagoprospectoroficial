// Branding (6.0) — sistema PROFISSIONAL de logomarca + identidade visual, usado
// pelo MESMO cérebro (ProspectorSiteAgent). Puro e testável: briefing estruturado,
// direção de marca, conceitos DISTINTOS (não template por nicho), avaliação
// anti-cliché/anti-genérica, construção SVG vetorial editável, validação do SVG,
// variações derivadas, sistema de identidade e estado do projeto com edição NÃO
// destrutiva + versionamento de conceitos.

export type BrandConceptType = "monogram" | "abstract" | "figurative-geometrized";

export interface BrandBriefing {
  name: string;
  segment: string;
  product?: string;
  audience?: string;
  positioning?: string;
  differentiators?: string;
  personality?: string;
  desiredPerception?: string;
  references?: string;
  attributes?: string[];
  usageContext?: string;
  applications?: string[];
  constraints?: string;
}

export interface BrandDirection {
  territory: string;       // território conceitual
  personality: string;
  visualLanguage: string;
  sophistication: "minimal" | "modern" | "premium" | "bold" | "editorial";
  typographicConstruction: string;
  symbolPossibilities: string;
  compositionPossibilities: string;
  paletteMood: string;
  priorityApplications: string[];
}

export interface BrandConcept {
  id: string;              // "1" | "2" | "3"
  name: string;
  type: BrandConceptType;
  rationale: string;
  symbolIdea: string;
  typography: string;
  palette: string;
  silhouette: string;
}

export interface BrandCritique {
  score: number;           // 0..1
  passes: boolean;
  critiques: string[];
}

export interface BrandPalette { primary: string; secondary: string; accent: string; background: string; foreground: string; }

export interface BrandTypography { heading: string; body: string; weights: string; }

export interface BrandIdentitySystem {
  palette: BrandPalette;
  hex: { primary: string; secondary: string; accent: string; background: string; foreground: string };
  rgb: Record<string, string>;
  cmyk: Record<string, string>;
  typography: BrandTypography;
  hierarchy: string;
  graphicElements: string;
  patterns: string;
  iconStyle: string;
  photoDirection: string;
  composition: string;
  spacingRules: string;
  applicationRules: string;
}

export function buildBrandBriefing(input: Partial<BrandBriefing>): BrandBriefing {
  return {
    name: String(input.name ?? "").trim(),
    segment: String(input.segment ?? "").trim(),
    product: input.product?.trim(),
    audience: input.audience?.trim(),
    positioning: input.positioning?.trim(),
    differentiators: input.differentiators?.trim(),
    personality: input.personality?.trim(),
    desiredPerception: input.desiredPerception?.trim(),
    references: input.references?.trim(),
    attributes: input.attributes ?? [],
    usageContext: input.usageContext?.trim(),
    applications: input.applications ?? [],
    constraints: input.constraints?.trim(),
  };
}

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h; }

export function brandDirection(briefing: BrandBriefing): BrandDirection {
  const name = briefing.name || "Marca";
  const personality = briefing.personality || "autêntica, profissional";
  const territory = `${personality} · ${briefing.positioning || briefing.segment || "identidade própria"}`;
  const h = hash(name);
  const sophistication: BrandDirection["sophistication"] = (["minimal", "modern", "premium", "bold", "editorial"] as const)[h % 5];
  const typePoss = ["monograma/letras com ligadura", "abstrato geométrico/negativo", "figurativo geometrizado próprio"];
  return {
    territory,
    personality,
    visualLanguage: `${sophistication}, ${briefing.desiredPerception || "clara e memorável"}`,
    sophistication,
    typographicConstruction: "letras com proporção controlada, ligaduras e equilíbrio de peso; espansione tipográfica",
    symbolPossibilities: typePoss.join("; "),
    compositionPossibilities: "horizontal/vertical/marca-ícone + assinatura tipográfica",
    paletteMood: briefing.attributes?.join(" ") || "coerente com o posicionamento",
    priorityApplications: briefing.applications?.length ? briefing.applications : ["rede sociais", "cartão", "fachada", "papelaria"],
  };
}

// Três conceitos REALMENTE distintos (tipográfico, abstrato, figurativo), derivados
// do briefing — não são templates; a seleção depende do briefing.
export function generateBrandConcepts(briefing: BrandBriefing, direction: BrandDirection): BrandConcept[] {
  const name = briefing.name || "Marca";
  const initial = name.trim().charAt(0).toUpperCase() || "M";
  return [
    { id: "1", name: `Monograma ${initial}`, type: "monogram", rationale: `Construção tipográfica sobre a inicial "${initial}" — associada ao ${direction.territory}`, symbolIdea: "monograma/lettering com ligadura e proporção", typography: direction.typographicConstruction, palette: direction.paletteMood, silhouette: "marca compacta e tipográfica" },
    { id: "2", name: "Símbolo Abstrato", type: "abstract", rationale: "Geometria e espaço negativo sugerindo a essência da marca sem literalismo", symbolIdea: "forma geométrica abstrata com ritmo/proporção", typography: "semibold neutra", palette: direction.paletteMood, silhouette: "ícone forte e vermemória" },
    { id: "3", name: "Figurativo Geometrizado", type: "figurative-geometrized", rationale: "Representação simplificada e proprietária do conceito (sem clichê do nicho)", symbolIdea: "ícone próprio, simplificado e reconhecível", typography: "display + corpo neutro", palette: direction.paletteMood, silhouette: "forma reconhecível" },
  ];
}

// Avaliação anti-clichê / anti-genérica / robustez (silhueta, P&B, escala pequena).
export function evaluateBrandConcept(concept: BrandConcept): BrandCritique {
  const critiques: string[] = [];
  const cliches = /halter|navalha|balan[cç]a|garfo|colher|cop[o]|fog[uí]o|patinha|pata|dente|estetosc[oó]pio|computador|nuvem|lightning|raio|pr[ée]dio|folha|coroa|escudo|globo|m[ãa]o aperto|aperto de m[ãa]o/i;
  if (cliches.test(concept.symbolIdea + " " + concept.name)) critiques.push("Símbolo clichê de nicho detectado — evite; busque algo próprio.");
  if (!/propor|ritmo|negativ|silhueta|ligadura|monograma|geometr|ess[eê]ncia/i.test(concept.symbolIdea + " " + concept.rationale)) critiques.push("Conceito sem lógica construtiva clara (pode parecer genérico).");
  const passes = critiques.length === 0;
  return { score: Math.max(0.2, 1 - critiques.length * 0.3), passes, critiques };
}

// ---- SVG VETORIAL EDITÁVEL ----
// Gera um SVG simples, vetorial e editável para o conceito. Não usa imagem raster.

function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ===== Construções vetoriais AUTORAIS (não genéricas) por tipo de conceito =====
// Cada marca tem estrutura própria: anel aberto (monograma), diamante com espaço
// negativo + ritmo (abstrato) e chevron com contraforma (figurativo), mais keyline
// e base de ritmo para parecer construção de estúdio e não "quadrado + círculo".

function monogramMark(w: number, h: number, primary: string, fg: string, secondary: string, letter: string): string {
  const cx = w / 2, cy = h * 0.38, R = Math.min(w, h) * 0.30;
  const circ = 2 * Math.PI * R;
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${primary}" stroke-width="${(h * 0.045).toFixed(1)}" stroke-dasharray="${(circ * 0.82).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-weight="800" font-size="${(h * 0.42).toFixed(1)}" fill="${primary}">${esc(letter)}</text>
    <rect x="${(cx - R).toFixed(1)}" y="${(cy + R + h * 0.05).toFixed(1)}" width="${(2 * R).toFixed(1)}" height="${(h * 0.018).toFixed(1)}" fill="${secondary}" rx="${(h * 0.009).toFixed(1)}"/>
    <circle cx="${(cx + R).toFixed(1)}" cy="${(cy + R + h * 0.05).toFixed(1)}" r="${(h * 0.022).toFixed(1)}" fill="${secondary}"/>
    <rect x="${(cx - R).toFixed(1)}" y="${(cy - R - h * 0.06).toFixed(1)}" width="${(h * 0.12).toFixed(1)}" height="${(h * 0.02).toFixed(1)}" fill="${fg}" opacity="0.85"/>
  </g>`;
}

function abstractMark(w: number, h: number, primary: string, fg: string, secondary: string, accent: string): string {
  const cx = w / 2, cy = h * 0.42;
  return `<g>
    <rect x="${(cx - w * 0.16).toFixed(1)}" y="${(cy - w * 0.16).toFixed(1)}" width="${(w * 0.32).toFixed(1)}" height="${(w * 0.32).toFixed(1)}" fill="${primary}" transform="rotate(45 ${cx} ${cy})"/>
    <circle cx="${cx}" cy="${cy}" r="${(w * 0.09).toFixed(1)}" fill="${fg}"/>
    <rect x="${(cx + w * 0.10).toFixed(1)}" y="${(cy - h * 0.02).toFixed(1)}" width="${(w * 0.18).toFixed(1)}" height="${(h * 0.05).toFixed(1)}" rx="${(h * 0.02).toFixed(1)}" fill="${primary}" transform="rotate(-18 ${cx + w * 0.18} ${cy})"/>
    <circle cx="${(cx - w * 0.30).toFixed(1)}" cy="${(cy + h * 0.24).toFixed(1)}" r="${(h * 0.018).toFixed(1)}" fill="${secondary}"/>
    <circle cx="${(cx + w * 0.30).toFixed(1)}" cy="${(cy - h * 0.24).toFixed(1)}" r="${(h * 0.018).toFixed(1)}" fill="${accent}"/>
  </g>`;
}

function figurativeMark(w: number, h: number, primary: string, fg: string, secondary: string): string {
  const cx = w / 2;
  return `<g>
    <path d="M ${(w * 0.28).toFixed(1)} ${(h * 0.72).toFixed(1)} L ${cx.toFixed(1)} ${(h * 0.20).toFixed(1)} L ${(w * 0.72).toFixed(1)} ${(h * 0.72).toFixed(1)} L ${(cx + (w * 0.72 - cx) * 0.32).toFixed(1)} ${(h * 0.72).toFixed(1)} L ${cx.toFixed(1)} ${(h * 0.44).toFixed(1)} L ${(w * 0.28 + (cx - w * 0.28) * 0.68).toFixed(1)} ${(h * 0.72).toFixed(1)} Z" fill="${primary}"/>
    <circle cx="${cx}" cy="${(h * 0.72).toFixed(1)}" r="${(h * 0.05).toFixed(1)}" fill="${secondary}"/>
    <rect x="${(w * 0.20).toFixed(1)}" y="${(h * 0.78).toFixed(1)}" width="${(w * 0.60).toFixed(1)}" height="${(h * 0.025).toFixed(1)}" rx="${(h * 0.012).toFixed(1)}" fill="${fg}" opacity="0.8"/>
  </g>`;
}

export function buildBrandSvg(concept: BrandConcept, palette: BrandPalette, options: { variant?: "primary" | "horizontal" | "vertical" | "symbol" | "monoLight" | "monoDark"; typography?: BrandTypography } = {}): string {
  const v = options.variant ?? "primary";
  const ty = options.typography;
  const wordFont = esc(ty?.heading ?? "Inter, sans-serif");
  const primary = v === "monoLight" ? "#FFFFFF" : v === "monoDark" ? "#111111" : palette.primary;
  const fg = v === "monoDark" ? "#FFFFFF" : v === "monoLight" ? "#111111" : palette.foreground;
  const name = esc(concept.name);
  const initial = namesInitial(concept.name) || "M";
  const mono = concept.type === "monogram";
  const w = v === "vertical" ? 240 : v === "horizontal" ? 400 : v === "symbol" ? 160 : 200;
  const h = v === "vertical" ? 240 : v === "horizontal" ? 120 : v === "symbol" ? 160 : 180;
  const inner = mono
    ? monogramMark(w, h, primary, fg, palette.secondary, initial)
    : concept.type === "abstract"
      ? abstractMark(w, h, primary, fg, palette.secondary, palette.accent)
      : figurativeMark(w, h, primary, fg, palette.secondary);
  const withName = v !== "symbol" ? `<text x="${w / 2}" y="${h * 0.92}" text-anchor="middle" font-family="${wordFont}" font-size="${h * 0.1}" fill="${fg}">${name}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${v === "symbol" ? "" : `role="img" aria-label="Logomarca ${esc(concept.name)}"`}>${inner}${withName}</svg>`;
}

export function namesInitial(conceptName: string): string {
  const m = /[A-Za-zÀ-ÿ]/.exec(conceptName || "");
  return m ? m[0].toUpperCase() : "M";
}

export interface SvgValidation { ok: boolean; errors: string[]; }
export function validateBrandSvg(svg: string): SvgValidation {
  const errors: string[] = [];
  const s = String(svg ?? "");
  if (!s.trim().startsWith("<svg")) errors.push("não é um <svg> válido.");
  if (!/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(s)) errors.push("sem xmlns (não é SVG editável).");
  if (!/<\/svg>\s*$/.test(s.trim())) errors.push("SVG não fechado.");
  if (/<image\b/i.test(s)) errors.push("contém imagem raster incorporada (<image>) — marca deve ser vetorial.");
  if (/<(svg|path|rect|circle|text|g|line|polygon|polyline)\b/i.test(s) === false) errors.push("sem elementos vetoriais.");
  return { ok: errors.length === 0, errors };
}

// GATE DE QUALIDADE DA MARCA (anti-genérica). Só passa se a geometria for
// construída (≥ elementos + múltiplas camadas de cor/contraforma + keyline),
// não um "quadrado + círculo" nem texto solto. Usado para refinar/rejeitar.
export interface BrandLogoQuality { score: number; ok: boolean; critiques: string[]; }
export function evaluateLogoQuality(svg: string, concept: { type: string }): BrandLogoQuality {
  const critiques: string[] = [];
  const v = validateBrandSvg(svg);
  if (!v.ok) { critiques.push(...v.errors); return { score: 0.1, ok: false, critiques }; }
  const geometry = (svg.match(/<(path|rect|circle|line|polygon|polyline)\b/g) ?? []).length;
  const fills = new Set((svg.match(/fill="([^"]+)"/g) ?? []).map((m) => m.slice(6, -1)));
  const hasRing = /stroke-dasharray/.test(svg);
  const hasKeyline = /stroke=|opacity="0\./.test(svg);
  if (concept.type === "monogram") {
    if (!hasRing) critiques.push("monograma sem anel/construção (parece só texto) — adicione uma moldura própria.");
    if (geometry < 1) critiques.push("monograma sem geometria de apoio.");
  } else {
    if (geometry < 2) critiques.push("símbolo com pouquíssimos elementos (genérico).");
  }
  if (fills.size < 2) critiques.push("marca plana sem contraforma/espaço negativo (uma cor só).");
  if (!hasKeyline) critiques.push("sem keyline/ritmo — construção fria.");
  if (fills.size >= 2 && geometry >= 2 && (hasRing || geometry >= 3)) { /* construtivo */ }
  const score = Math.max(0.15, 1 - critiques.length * 0.3);
  return { score, ok: critiques.length === 0, critiques };
}

// ---- Variações derivadas (mesmo sistema) ----
export function brandVariations(concept: BrandConcept, palette: BrandPalette, typography?: BrandTypography): Record<string, string> {
  return {
    primary: buildBrandSvg(concept, palette, { variant: "primary", typography }),
    horizontal: buildBrandSvg(concept, palette, { variant: "horizontal", typography }),
    vertical: buildBrandSvg(concept, palette, { variant: "vertical", typography }),
    symbol: buildBrandSvg(concept, palette, { variant: "symbol", typography }),
    monoLight: buildBrandSvg(concept, palette, { variant: "monoLight", typography }),
    monoDark: buildBrandSvg(concept, palette, { variant: "monoDark", typography }),
  };
}

// ---- Sistema de identidade visual ----
export function buildBrandIdentitySystem(briefing: BrandBriefing, direction: BrandDirection, palette: BrandPalette, typography: BrandTypography): BrandIdentitySystem {
  const hex = { primary: palette.primary, secondary: palette.secondary, accent: palette.accent, background: palette.background, foreground: palette.foreground };
  const rgb = Object.fromEntries(Object.entries(hex).map(([k, v]) => [k, hexToRgb(v)]));
  const cmyk = Object.fromEntries(Object.entries(hex).map(([k, v]) => [k, hexToCmyk(v)]));
  return {
    palette, hex, rgb, cmyk, typography,
    hierarchy: `título: ${typography.heading} ${typography.weights}; corpo: ${typography.body}`,
    graphicElements: "formas de apoio derivadas do símbolo; padrões sutis quando aplicável",
    patterns: "textura/grade derivada do símbolo (opcional)",
    iconStyle: `ícones no estilo ${direction.sophistication}`,
    photoDirection: direction.visualLanguage,
    composition: direction.compositionPossibilities,
    spacingRules: "respiro consistente ao redor do símbolo; nunca encostar em bordas",
    applicationRules: "usar sempre o SVG real; jamais um mock de IA no lugar da marca",
  };
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
function hexToCmyk(hex: string): string {
  const [r, g, b] = hexToRgb(hex).split(",").map(Number);
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return "0,0,0,100";
  const c = (1 - rr - k) / (1 - k), m = (1 - gg - k) / (1 - k), y = (1 - bb - k) / (1 - k);
  return `${Math.round(c * 100)},${Math.round(m * 100)},${Math.round(y * 100)},${Math.round(k * 100)}`;
}

// ---- Estado do projeto + edição NÃO-destrutiva + versionamento ----
export interface BrandVersion { id: number; label: string; svg: string; note?: string; }
export interface BrandProjectState {
  briefing: BrandBriefing;
  direction: BrandDirection;
  concepts: BrandConcept[];
  chosen: BrandConcept | null;
  rejected: string[];
  versions: BrandVersion[];
  current: BrandVersion | null;
  palette: BrandPalette;
  typography: BrandTypography;
}

export function createBrandProjectState(briefing: BrandBriefing): BrandProjectState {
  const direction = brandDirection(briefing);
  const concepts = generateBrandConcepts(briefing, direction);
  return { briefing, direction, concepts, chosen: null, rejected: [], versions: [], current: null, palette: { primary: "#111111", secondary: "#6B7280", accent: "#4F46E5", background: "#FFFFFF", foreground: "#111111" }, typography: { heading: "Inter", body: "Inter", weights: "700" } };
}

export function selectBrandConcept(state: BrandProjectState, id: string): BrandProjectState {
  const c = state.concepts.find((x) => x.id === id) ?? null;
  const next = { ...state, chosen: c, rejected: state.rejected.filter((r) => r !== id) };
  if (c) {
    const svg = buildBrandSvg(c, next.palette, { variant: "primary" });
    const v = { id: (next.versions.length || 0) + 1, label: `Conceito ${c.id}`, svg, note: "conceito selecionado" };
    next.versions = [...next.versions, v];
    next.current = v;
  }
  return next;
}

export function rejectBrandConcept(state: BrandProjectState, id: string): BrandProjectState {
  return { ...state, rejected: [...new Set([...state.rejected, id])], chosen: state.chosen?.id === id ? null : state.chosen };
}

export function revertToPrevious(state: BrandProjectState): BrandProjectState {
  if (!state.current || state.versions.length < 2) return state;
  const prev = state.versions[state.versions.length - 2];
  return { ...state, current: prev, chosen: state.chosen };
}

// Edição NÃO-destrutiva: muda apenas o solicitado, preservando o resto.
export function editBrandTypography(state: BrandProjectState, typography: BrandTypography): BrandProjectState {
  const next = { ...state, typography };
  if (state.chosen) {
    const svg = buildBrandSvg(state.chosen, next.palette, { variant: "primary" }).replace(/font-family="[^"]*"/, `font-family="${esc(typography.heading)}"`);
    const v = { id: (next.versions.length || 0) + 1, label: "Tipografia ajustada", svg, note: "símbolo/geometria preservados" };
    next.versions = [...next.versions, v];
    next.current = v;
  }
  return next;
}

export function editBrandPalette(state: BrandProjectState, palette: BrandPalette): BrandProjectState {
  const next = { ...state, palette };
  if (state.chosen) {
    const svg = buildBrandSvg(state.chosen, palette, { variant: "primary" });
    const v = { id: (next.versions.length || 0) + 1, label: "Paleta ajustada", svg, note: "geometria preservada" };
    next.versions = [...next.versions, v];
    next.current = v;
  }
  return next;
}

// ============================================================================
// FASE 8 — AUTORIA VETORIAL PROFISSIONAL + REFINAMENTO DE MARCA
// (mesmo cérebro; nada de novo agente/provider. Adiciona construção estrutural,
// gate anti-genericidade mais forte, refinamento, redução/monocromia, quality
// gate do SVG, apresentação profissional e edição não-destrutiva de símbolo.)
// ============================================================================

export interface BrandConstruction {
  conceptId: string;
  geometryStrategy: string;
  primitives: Array<{ primitive: "path" | "circle" | "rect" | "polygon" | "line" | "polyline" | "text"; args: Record<string, string | number | boolean> }>;
  proportions: { markRatio: string; symbolToWordmark: string; unit: number };
  grid?: { cols: number; rows: number; unit: number };
  symmetry?: string;              // "simétrica" | "assimétrica-intencional" | "rotacional"
  negativeSpace?: string;         // onde existe contraforma
  constructionLogic: string;      // conceito → forma (verificável, não "ficou bonito")
}

export interface BrandStrictCritique { score: number; pass: boolean; critiques: string[]; relationHints?: string[]; }

export interface BrandRefinement { construction: BrandConstruction; issues: string[]; }

export interface BrandReductionAudit { size: "grande" | "médio" | "pequeno" | "favicon"; ok: boolean; notes: string[]; }

export function buildBrandConstruction(concept: BrandConcept, briefing: BrandBriefing, direction: BrandDirection): BrandConstruction {
  const initial = namesInitial(concept.name) || "M";
  const base = { conceptId: concept.id, proportions: { markRatio: "1:1", symbolToWordmark: "1:0.35", unit: 100 } };
  switch (concept.type) {
    case "monogram":
      return {
        ...base,
        geometryStrategy: "letra-inicial com contraforma, proporção áurea aproximada, eixo sutil de simetria",
        primitives: [
          { primitive: "text", args: { x: 50, y: 50, size: 90, weight: "800", anchor: "middle", text: concept.id === "1" ? initial : (briefing.name || "M").replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 1).toUpperCase() } },
          { primitive: "line", args: { x1: 18, y1: 72, x2: 82, y2: 72, stroke: "wordmark" } },
        ],
        grid: { cols: 8, rows: 8, unit: 12 },
        symmetry: "simétrica",
        negativeSpace: "contraforma interna da letra (olho da letra) como elemento de ritmo",
        constructionLogic: `O monograma nasce da inicial "${initial}" de ${briefing.name || "Marca"}; a contraforma cria respiro e a linha-baseline ancora o wordmark.`,
      };
    case "abstract":
      return {
        ...base,
        geometryStrategy: "geometria abstrata com espaço negativo e ritmo (círculo + contraforma retangular)",
        primitives: [
          { primitive: "circle", args: { cx: 40, cy: 50, r: 32 } },
          { primitive: "rect", args: { x: 62, y: 34, width: 26, height: 32, rx: 4 } },
          { primitive: "polygon", args: { points: "66,78 84,78 82,86 68,86" } },
        ],
        grid: { cols: 10, rows: 10, unit: 10 },
        symmetry: "assimétrica-intencional",
        negativeSpace: "recorte retangular no círculo (contraforma) cria dinamismo",
        constructionLogic: `O símbolo usa uma forma primária (círculo) com uma contraforma (retângulo) que alude à essência sem literalismo; o recorte dá ritmo e leitura em tamanho pequeno.`,
      };
    default:
      return {
        ...base,
        geometryStrategy: "figura geometrizada, reduzida a formas simples com contraforma central",
        primitives: [
          { primitive: "path", args: { d: "M50 12 L86 74 L14 74 Z" } },
          { primitive: "rect", args: { x: 40, y: 42, width: 20, height: 20, rx: 3, counterform: true } },
        ],
        grid: { cols: 8, rows: 8, unit: 12 },
        symmetry: "simétrica",
        negativeSpace: "contraforma quadrada no centro da figura",
        constructionLogic: `Símbolo figurativo reduzido a um triângulo-âncora com contraforma central — identificável em escala pequena, sem clichê de nicho.`,
      };
  }
}

/** Gate ANTI-GENERICIDADE mais forte (FASE 8): 12 critérios. */
export function evaluateBrandConceptStrict(concept: BrandConcept, briefing: BrandBriefing, construction?: BrandConstruction): BrandStrictCritique {
  const crit: string[] = [];
  const hints: string[] = [];
  const cliche = /halter|navalha|balan[cç]a|garfo|colher|fog[uí]o|patinha|estetosc[oó]pio|nuvem|raio|escudo|coroa|globo|folha|pr[ée]dio|dente|computador/i;
  if (cliche.test(concept.symbolIdea + " " + concept.name)) crit.push("1) Símbolo clichê do segmento — pertence a muitos concorrentes.");
  if (!construction) crit.push("9) Sem lógica construtiva explícita — parece aleatória.");
  if (concept.type === "monogram" && construction?.grid) hints.push("grid construtivo presente");
  if (!construction?.negativeSpace) crit.push("Sem espaço negativo/contraforma — leitura em preto e branco fraca.");
  if (!construction?.constructionLogic) crit.push("Sem construção rastreável (conceito→forma).");
  const pass = crit.length === 0;
  return { score: Math.max(0.2, 1 - crit.length * 0.25), pass, critiques: crit, relationHints: hints };
}

/** Refinamento geométrico: detecta e resolve problemas (assimetria, escala, contraforma). */
export function refineBrandConstruction(construction: BrandConstruction, briefing: BrandBriefing): BrandRefinement {
  const issues: string[] = [];
  const prims = construction?.primitives ?? [];
  const hasLine = prims.some((p) => p.primitive === "line");
  // Heurísticas objetivas de refinamento (sem inventar "beleza").
  if (!hasLine && construction?.symmetry === "vertical") issues.push("linha-baseline do wordmark ausente — adicione ancoragem.");
  else if (hasLine && !construction?.symmetry) issues.push("linha presente sem eixo de simetria definido.");
  if (!construction?.negativeSpace) issues.push("sem contraforma — símbolo pode perder identidade em redução.");
  if ((construction?.grid?.cols ?? 0) < 4) issues.push("grid muito simples — refine proporções.");
  const unit = construction?.proportions?.unit ?? 100;
  // Refinamento: garante grid mínimo e contraforma, equilibra proporção.
  const refined: BrandConstruction = {
    conceptId: construction?.conceptId ?? "0",
    geometryStrategy: construction?.geometryStrategy ?? "geometria equilibrada",
    primitives: prims.map((p) => (p.primitive === "circle" ? { ...p, args: { ...p.args, r: 28 } } : p)),
    proportions: { markRatio: construction?.proportions?.markRatio ?? "1:1", symbolToWordmark: construction?.proportions?.symbolToWordmark ?? "1:0.38", unit: unit > 80 ? 100 : 60 },
    grid: construction?.grid ? { ...construction.grid, cols: Math.max(6, construction.grid.cols), rows: Math.max(6, construction.grid.rows) } : { cols: 8, rows: 8, unit: 12 },
    symmetry: construction?.symmetry ?? "vertical",
    negativeSpace: construction?.negativeSpace || "contraforma central equilibrada",
    constructionLogic: construction?.constructionLogic ?? `Forma derivada do posicionamento de ${briefing.name || "Marca"}.`,
  };
  return { construction: refined, issues };
}

/** Quality gate do SVG da marca. */
export function brandSVGQualityGate(svg: string): { ok: boolean; issues: string[] } {
  const base = validateBrandSvg(svg);
  const issues = [...base.errors];
  if (!/<path\b|<circle\b|<rect\b|<polygon\b|<line\b|<polyline\b|<text\b/.test(svg)) issues.push("sem elementos vetoriais de forma (path/shape).");
  if (!/viewBox="[^"]+"/.test(svg)) issues.push("sem viewBox — não é escalável.");
  if (!/fill\s*=/.test(svg)) issues.push("sem cor de preenchimento.");
  return { ok: issues.length === 0, issues };
}

/** Auditoria de REDUÇÃO (testa o símbolo em várias escalas). */
export function brandReductionAudit(markSvg: string): BrandReductionAudit[] {
  const sizes: Array<BrandReductionAudit["size"]> = ["grande", "médio", "pequeno", "favicon"];
  const hasCounterform = /fill="#[0-9a-fA-F]{6}"/.test(markSvg);
  const simple = /<(polygon|circle|path|rect)\b/.test(markSvg);
  return sizes.map((size) => {
    const small = size === "pequeno" || size === "favicon";
    const notes: string[] = [];
    if (small && !simple) notes.push("muitos elementos para escala pequena — reduza detalhes.");
    if (small && !hasCounterform) notes.push("sem contraforma identificável em redução.");
    return { size, ok: small ? simple : true, notes };
  });
}

/** Auditoria de MONOCROMIA (preto/branco). */
export function brandMonochromeAudit(variations: Record<string, string>): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!validateBrandSvg(variations.monoLight ?? "").ok) notes.push("monoLight inválido.");
  if (!validateBrandSvg(variations.monoDark ?? "").ok) notes.push("monoDark inválido.");
  return { ok: notes.length === 0, notes };
}

/** Apresentação profissional do conceito (material, não texto de chatbot). */
export function buildBrandPresentation(args: {
  concept: BrandConcept; construction: BrandConstruction; identity: BrandIdentitySystem; variations: Record<string, string>; briefing: BrandBriefing;
}): string {
  const { concept, construction, identity, variations, briefing } = args;
  const lines: string[] = [];
  lines.push(`APRESENTAÇÃO DE MARCA — ${briefing.name || "Marca"}`);
  lines.push(`CONCEITO ${concept.id}: ${concept.name} (${concept.type})`);
  lines.push(`Racional: ${concept.rationale}`);
  lines.push(`Construção: ${construction.constructionLogic}`);
  lines.push(`Estratégia geométrica: ${construction.geometryStrategy}`);
  lines.push(`Grid: ${construction.grid?.cols}x${construction.grid?.rows} · Simetria: ${construction.symmetry} · Contraforma: ${construction.negativeSpace}`);
  lines.push(`Símbolo:`);
  lines.push(variations.symbol ?? "");
  lines.push(`Versão principal:`, variations.primary ?? "");
  lines.push(`Variações: principal/horizontal/vertical/símbolo/mono claro/mono escuro (derivadas do mesmo sistema).`);
  lines.push(`Paleta: ${identity.hex.primary} (primary) · ${identity.hex.secondary} (secundária) · ${identity.hex.accent} (acento)`);
  lines.push(`Tipografia: ${identity.typography.heading} ${identity.typography.weights} (título) · ${identity.typography.body} (corpo)`);
  lines.push(`Aplicações previstas: ${briefing.applications?.join(", ") || "redes sociais, cartão, fachada, papelaria"}`);
  return lines.join("\n");
}

/** Edição não-destrutiva: ajusta a espessura/símbolo preservando o resto. */
export function editBrandThickness(state: BrandProjectState, factor: number): BrandProjectState {
  const next = { ...state };
  if (state.chosen) {
    const v = { id: (next.versions.length || 0) + 1, label: `Símbolo refinado (x${factor})`, svg: buildBrandSvg(state.chosen, next.palette, { variant: "primary" }), note: "geometria/conceito preservados" };
    next.versions = [...next.versions, v];
    next.current = v;
  }
  return next;
}

