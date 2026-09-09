// Image Intent (6.0) — transforma direção criativa + negócio em uma NECESSIDADE de
// imagem (intenção) contextual, em vez de "nicho → imagem genérica". Puro e
// testável. Varia deterministicamente por identidade do negócio (mesmo nicho →
// tratamentos/temáticas diferentes), sem biblioteca fixa por segmento.

export type ImageRole =
  | "hero" | "service" | "product" | "editorial" | "background"
  | "detail" | "texture" | "testimonial" | "location";

export interface ImageIntent {
  role: ImageRole;
  subject: string;
  mood: string;
  composition: string;
  aspectRatio?: string;
  avoid: string[];
  /** Tratamento fotográfico escolhido (editorial/documental/arquitetônico/detalhe/produto/textura). */
  treatment: string;
}

export interface ImageProjectContext {
  businessName?: string;
  segment?: string;
  city?: string;
  positioning?: string;
  /** Pista de atmosfera de paleta/direção (ex.: "dark athletic", "light organic").
   *  Vem dos Design Tokens da Creative Direction (FASE 1). */
  paletteMood?: string;
  typographyStyle?: string;
  architecture?: string;
}

const TREATMENTS = ["editorial", "documental", "arquitetônico", "detalhe", "produto", "textura"] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: readonly T[], s: string): T {
  return arr[hash(s) % arr.length];
}

const ROLE_DEFAULTS: Record<ImageRole, { subject: string; mood: string; composition: string; aspectRatio?: string; avoid: string[] }> = {
  hero: { subject: "ambiente/momentâneo principal do negócio", mood: "impacto e atmosfera", composition: "dominante, amplo, com espaço para texto", aspectRatio: "wide", avoid: ["mesma foto de hero de qualquer projeto", "imagem genérica do nicho"] },
  service: { subject: "o serviço/experiência em ação", mood: "clareza e competência", composition: "enquadrado, com respiro", aspectRatio: "4/3", avoid: ["card genérico idêntico", "stock clichê da categoria"] },
  product: { subject: "produto/destaque em detalhe", mood: "desejo e qualidade", composition: "foco no produto, fundo limpo", aspectRatio: "4/3", avoid: ["produto cortado", "fundo poluído"] },
  editorial: { subject: "narrativa/temática do negócio", mood: "profundidade e direção", composition: "fotografia editorial", aspectRatio: "wide", avoid: ["aparência de banco de imagem"] },
  background: { subject: "atmosfera/ambiente", mood: "contexto e profundidade", composition: "cobre o fundo, baixa prioridade", aspectRatio: "cover", avoid: ["poluir o texto"] },
  detail: { subject: "detalhe/marca/artefato", mood: "refinamento", composition: "pecado próximo, quase abstrato", aspectRatio: "1/1", avoid: ["sem contexto"] },
  texture: { subject: "textura/superfície", mood: "materialidade", composition: "repetição sutil", aspectRatio: "cover", avoid: ["textura genérica"] },
  testimonial: { subject: "pessoa/cliente (contexto real quando existente)", mood: "autenticidade", composition: "retrato/situado", aspectRatio: "3/4", avoid: ["sorriso genérico de banco"] },
  location: { subject: "localização/fachada/sala", mood: "contexto e acesso", composition: "informativo e acolhedor", aspectRatio: "wide", avoid: ["endereço inventado na imagem"] },
};

export function buildImageIntent(ctx: ImageProjectContext, role: ImageRole): ImageIntent {
  const base = ROLE_DEFAULTS[role];
  const biz = String(ctx?.businessName ?? "").trim();
  const seg = String(ctx?.segment ?? "").trim();
  // Tratamento fotográfico varia POR NEGÓCIO (não por nicho) — mesmo segmento,
  // projetos diferentes recebem linguagens diferentes (diversidade).
  const seed = `${biz}::${seg}::${role}`;
  const treatment = pick(TREATMENTS, seed);
  const moodParts = [base.mood];
  if (ctx?.paletteMood) moodParts.push(String(ctx.paletteMood));
  if (ctx?.positioning) moodParts.push(String(ctx.positioning));
  const subject = `${base.subject}`;
  const composition = [base.composition, treatment].filter(Boolean).join(" · ");
  return {
    role,
    subject: biz ? `${biz} — ${subject}` : subject,
    mood: [...new Set(moodParts)].join(" · "),
    composition,
    aspectRatio: base.aspectRatio,
    avoid: [...base.avoid, "foto genérica do segmento", "mesma imagem repetida no projeto"],
    treatment,
  };
}

/** Constrói uma consulta de pesquisa CONTEXTUAL (não só o segmento), refletindo a
 *  direção criativa e o tratamento escolhido. Reutilizável com web_search. */
export function intentToQuery(intent: ImageIntent, ctx: ImageProjectContext): string {
  const parts = [
    ctx?.businessName && String(ctx.businessName).trim(),
    ctx?.segment && String(ctx.segment).trim(),
    intent.subject,
    intent.mood,
    intent.treatment,
    ctx?.paletteMood && String(ctx.paletteMood),
    intent.aspectRatio && (intent.aspectRatio === "wide" ? "wide" : intent.aspectRatio),
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Consultas alternativas para uma imagem importante (hero): sujeito, ambiente, composição. */
export function heroQueries(intent: ImageIntent, ctx: ImageProjectContext): string[] {
  const base = String(ctx?.businessName ?? "").trim();
  return [
    `${base} ${intent.subject} ${intent.mood}`.replace(/\s+/g, " ").trim(),
    `${base} ${ctx?.segment ?? ""} ${ctx?.paletteMood ?? ""} ambiente`.replace(/\s+/g, " ").trim(),
    `${base} ${intent.treatment} ${intent.composition}`.replace(/\s+/g, " ").trim(),
  ].slice(0, 3);
}
