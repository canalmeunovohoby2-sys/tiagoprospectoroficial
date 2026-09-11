// ============================================================================
// Biblioteca de BASES TÉCNICAS (site-bases/*) — andaime estrutural reutilizável.
//
// IMPORTANTE (regra de produto): a base NÃO é o site final. Ela existe apenas
// para economizar a criação repetitiva de estrutura/CSS/JS/responsividade. O
// agente SEMPRE adapta a base para o cliente: nova identidade visual, novo
// conteúdo, novas imagens e composição própria.
//
// Esta camada é SOMENTE LEITURA sobre `site-bases/`. O runtime nunca escreve na
// base original: o workspace físico do projeto é isolado por projectId
// (resolveWorkspaceRoot) e recebe uma CÓPIA sanitizada. Usar dois projetos com a
// mesma base jamais faz um alterar o outro nem a base.
// ============================================================================
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CreativeBrief } from "./creative-direction.js";
import type { FileMap } from "./workspace.js";

export const SITE_BASE_IDS = ["editorial", "conversion", "premium"] as const;
export type SiteBaseId = (typeof SITE_BASE_IDS)[number];

export interface BaseBusiness {
  name?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  about?: string | null;
  services?: string[] | null;
}

const MAX_BASE_FILE_BYTES = 2_000_000;
const MAX_BASE_FILES = 400;
const ALLOWED_FONT_HOST = "https://fonts.googleapis.com";

// ---------- localização da biblioteca de bases ----------
export function resolveBasesDir(): string {
  const fromEnv = process.env.SITE_BASES_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const candidates: string[] = [];
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    // agent-runtime/site-bases (dev: src/ → ..; prod: dist/ → ..)
    candidates.push(resolve(here, "..", "site-bases"));
    // legado/alternativo: repo root/site-bases
    candidates.push(resolve(here, "..", "..", "site-bases"));
  } catch { /* import.meta indisponível em CJS */ }
  candidates.push(resolve(process.cwd(), "site-bases"));
  candidates.push(resolve(process.cwd(), "..", "site-bases"));
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export function isSiteBasesEnabled(): boolean {
  const flag = process.env.SITE_BASES?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/** Lê uma base do disco como mapa path->conteúdo. Sempre retorna uma cópia nova. */
export function loadSiteBase(id: SiteBaseId): FileMap {
  const dir = join(resolveBasesDir(), id);
  if (!existsSync(dir)) throw new Error(`Base "${id}" não encontrada em ${dir}`);
  const out: FileMap = {};
  let count = 0;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      if (++count > MAX_BASE_FILES) return;
      const rel = relative(dir, full).split(sep).join("/");
      const content = readFileSync(full, "utf8");
      if (content.length <= MAX_BASE_FILE_BYTES) out[rel] = content;
    }
  };
  walk(dir);
  return out;
}

// ---------- seleção de base (por arquitetura/estética, NUNCA por nicho) ----------
function seedOf(a: string, b: string): number {
  const s = `${String(a ?? "").trim().toLowerCase()}::${String(b ?? "").trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

const ARCHETYPE_HINTS: Array<{ base: SiteBaseId; re: RegExp }> = [
  { base: "editorial", re: /editorial|autoridade|jurídic|juridic|consultiv|financeir|clássic|classic|minimal|wellness|sereno/i },
  { base: "conversion", re: /bold|performance|street|pop|playful|automotive|garage|tech|health|energ|comercial/i },
  { base: "premium", re: /premium|clinical|spa|bistro|organic|neon|luxo|exclusiv|imersiv/i },
];

const INTENT_HINTS: Array<{ base: SiteBaseId; re: RegExp }> = [
  { base: "editorial", re: /institucional|tradição|tradicao|autoridade|consultoria|escritório|escritorio|clássic|classic|elegante|sóbrio|sobrio|informativo/i },
  { base: "conversion", re: /oferta|promoção|promocao|agendamento|delivery|vendas|conversão|conversao|preço|preco|orçamento|orcamento|matrícula|matricula|urgência|urgencia/i },
  { base: "premium", re: /premium|luxo|exclusiv|experiência|experiencia|boutique|assinatura|sofisticad|imersiv|high-end/i },
];

export interface BaseSelectionInput {
  name?: string | null;
  segment?: string | null;
  brief?: CreativeBrief | null;
  briefing?: Record<string, unknown> | null;
}

/**
 * Escolhe a base por ARQUÉTIPO/TOM (não por segmento). Determinístico para o
 * mesmo negócio; varia entre as 3 bases. A Creative Direction continua sendo a
 * autoridade visual — a base só define o ponto de partida estrutural.
 */
export function selectSiteBase(input: BaseSelectionInput): SiteBaseId {
  const name = String(input.name ?? "");
  const segment = String(input.segment ?? "");
  const archetype = String(input.brief?.archetype ?? "");
  const haystack = [
    archetype,
    input.brief?.position ?? "",
    input.brief?.sensation ?? "",
    segment,
    input.briefing ? JSON.stringify(input.briefing).slice(0, 1500) : "",
  ].join(" ");

  // 1) Intenção declarada (briefing/segmento/tom) tem prioridade.
  for (const hint of INTENT_HINTS) if (hint.re.test(haystack)) return hint.base;
  // 2) Arquétipo de design escolhido pela Creative Direction.
  if (archetype) {
    for (const hint of ARCHETYPE_HINTS) if (hint.re.test(archetype)) return hint.base;
  }
  // 3) Desempate determinístico (varia entre as 3, sem ser por nicho).
  return SITE_BASE_IDS[seedOf(name, segment) % SITE_BASE_IDS.length];
}

// ---------- preparação (sanitização + tokens + placeholders) ----------
function applyPlaceholders(content: string, business: BaseBusiness): string {
  const year = String(new Date().getFullYear());
  const map: Record<string, string> = {
    "{{BUSINESS_NAME}}": String(business.name ?? "").trim() || "Seu negócio",
    "{{SEGMENT}}": String(business.segment ?? "").trim() || "serviços profissionais",
    "{{CITY}}": String(business.city ?? "").trim() || "sua cidade",
    "{{STATE}}": String(business.state ?? "").trim() || "",
    "{{ADDRESS}}": String(business.address ?? "").trim() || "",
    "{{PHONE}}": String(business.phone ?? "").trim() || "",
    "{{WHATSAPP}}": String(business.whatsapp ?? "").trim() || "",
    "{{YEAR}}": year,
  };
  let out = content;
  for (const [token, value] of Object.entries(map)) out = out.split(token).join(value);
  // Nunca deixar marcador de base vazar para o site final.
  return out.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

function setCssVar(css: string, name: string, value: string): string {
  const re = new RegExp(`(${name}\\s*:\\s*)[^;]+;`);
  const decl = `$1${value};`;
  if (re.test(css)) return css.replace(re, decl);
  // Fallback: injeta no primeiro bloco :root.
  return css.replace(/(:root\s*\{)/, `$1\n  ${name}: ${value};`);
}

function stripInheritableImages(html: string): string {
  // As bases não trazem imagens externas; isto é defensivo para garantir que
  // NENHUMA URL de imagem herdável chegue ao cliente.
  return html
    .replace(/<img\b[^>]*\bsrc=["'](https?:)?\/\/[^"']*["'][^>]*>/gi, "")
    .replace(/url\(\s*["']?(https?:)?\/\/[^"')]+["']?\s*\)/gi, "none");
}

/**
 * Monta a cópia sanitizada de uma base para UM cliente: sem imagens herdáveis,
 * com os DESIGN TOKENS da Creative Direction já aplicados como ponto de partida
 * e com os placeholders de negócio preenchidos.
 */
export function prepareBaseWorkspace(
  id: SiteBaseId,
  business: BaseBusiness,
  brief?: CreativeBrief | null,
): FileMap {
  const base = loadSiteBase(id);
  const out: FileMap = {};
  const t = brief?.tokens;

  for (const [path, raw] of Object.entries(base)) {
    let content = applyPlaceholders(raw, business);
    if (/\.html?$/i.test(path)) content = stripInheritableImages(content);

    if (/\.css$/i.test(path) && t) {
      content = setCssVar(content, "--c-primary", t.palette.primary);
      content = setCssVar(content, "--c-secondary", t.palette.secondary);
      content = setCssVar(content, "--c-accent", t.palette.accent);
      content = setCssVar(content, "--c-bg", t.palette.background);
      content = setCssVar(content, "--c-fg", t.palette.foreground);
      content = setCssVar(content, "--c-muted", t.palette.muted);
      content = setCssVar(content, "--c-cta", t.palette.cta);
      content = setCssVar(content, "--c-cta-contrast", t.palette.ctaContrast);
      content = setCssVar(content, "--font-heading", `"${t.typography.heading}", system-ui, sans-serif`);
      content = setCssVar(content, "--font-body", `"${t.typography.body}", system-ui, sans-serif`);
    }

    if (/\.html?$/i.test(path) && t) {
      const rawFontUrl = t.typography.importUrl ?? "";
      const importUrl = /^https:\/\/fonts\.googleapis\.com\//.test(rawFontUrl) ? rawFontUrl : "";
      if (importUrl) {
        if (/id=["']base-font["']/.test(content)) {
          content = content.replace(/(<link[^>]*id=["']base-font["'][^>]*href=["'])[^"']*(["'])/i, `$1${importUrl}$2`);
          content = content.replace(/(<link[^>]*href=["'])[^"']*(["'][^>]*id=["']base-font["'])/i, `$1${importUrl}$2`);
        } else {
          content = content.replace(/<\/head>/i, `  <link id="base-font" rel="stylesheet" href="${importUrl}" />\n</head>`);
        }
      }
    }

    out[path] = content;
  }
  return out;
}

export interface GenerationSeedInput {
  files?: FileMap | null;
  business: BaseBusiness;
  brief?: CreativeBrief | null;
  briefing?: Record<string, unknown> | null;
  /** Permite forçar on/off (testes); default = isSiteBasesEnabled(). */
  enabled?: boolean;
}

/**
 * Ponto ÚNICO de injeção da base: quando a geração parte de um workspace vazio,
 * devolve uma cópia sanitizada da base escolhida. Arquivos já existentes SEMPRE
 * têm precedência (nunca sobrescreve trabalho do cliente/agente).
 */
export function buildGenerationSeed(input: GenerationSeedInput): { seed: FileMap; baseUsed: SiteBaseId | null } {
  const incoming: FileMap = input.files && typeof input.files === "object" ? { ...input.files } : {};
  const enabled = input.enabled ?? isSiteBasesEnabled();
  if (!enabled || Object.keys(incoming).length > 0) return { seed: incoming, baseUsed: null };
  try {
    const baseUsed = selectSiteBase({
      name: input.business.name,
      segment: input.business.segment,
      brief: input.brief,
      briefing: input.briefing,
    });
    return { seed: prepareBaseWorkspace(baseUsed, input.business, input.brief), baseUsed };
  } catch (e) {
    console.warn("[site-bases] base indisponível; seguindo sem base", e instanceof Error ? e.message : String(e));
    return { seed: incoming, baseUsed: null };
  }
}

/** Bloco de missão que transforma a base em site único do cliente. */
export function formatBaseDirective(id: SiteBaseId): string {
  const label = id === "editorial" ? "Editorial/Institucional" : id === "conversion" ? "Comercial/Conversão" : "Premium/Experiência";
  return `BASE TÉCNICA PRÉ-CARREGADA — "${label}" (${id}) — NÃO é o site final:

- O workspace JÁ CONTÉM uma base estrutural funcional (index.html, src/site.css, src/main.js, src/site.json), com layout e responsividade prontos. Ela serve APENAS para economizar andaimes técnicos. TRATE-A COMO RASCUNHO A SER TRANSFORMADO, não como site pronto.
- OBRIGATÓRIO — IDENTIDADE VISUAL PRÓPRIA: substitua TODA a aparência da base pelos DESIGN TOKENS acima (paleta, tipografia, composição, espaçamento, cantos, sombras, decoração, tratamento). NENHUMA cor, fonte ou estilo da base deve permanecer por inércia. A identidade visual nasce DESTE cliente.
- OBRIGATÓRIO — CONTEÚDO PRÓPRIO: reescreva TODO o texto com os dados reais do cliente. Não mantenha copy genérica da base; não invente fatos.
- OBRIGATÓRIO — IMAGENS PRÓPRIAS: a base NÃO traz imagens. Use a ferramenta image_plan para buscar imagens específicas DESTE negócio e aplique URLs distintas e coerentes. NUNCA reuse imagem de outra base/projeto e nunca repita a mesma foto.
- ESTRUTURA É LIVRE: você PODE remover, adicionar, reordenar, dividir ou fundir seções, assim como reescrever o HTML/CSS/JS. A base é ponto de partida, não limite nem receita fixa.
- LOCALIZAÇÃO/MAPA: a base traz um slot de mapa vazio — preencha com um <iframe> real do Google Maps (endereço ou cidade/UF do cliente). A verificação de qualidade exige o mapa embutido.
- Remova qualquer marcador residual ({{...}}) e não referencie "a base" no site final.
- O resultado deve ser um site INDEPENDENTE e específico deste cliente — impossível de confundir com outro projeto ou com a base original.`;
}
