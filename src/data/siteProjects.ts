export type SiteProjectStatus = "draft" | "generated" | "error";

export interface SiteProjectRow {
  id: string;
  user_id: string;
  lead_id: string | null;
  name: string;
  company_name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  status: SiteProjectStatus;
  briefing: Record<string, unknown>;
  design_system: Record<string, unknown> | null;
  site_structure: Record<string, unknown> | null;
  content: Record<string, unknown> | null;
  calls_to_action: unknown[] | null;
  seo: Record<string, unknown> | null;
  assets: Record<string, unknown>[];
  generated_code: Record<string, unknown>;
  settings: Record<string, unknown>;
  spec: SiteSpec | null;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteBusiness {
  name: string;
  segment?: string;
  city?: string;
  state?: string;
  tagline?: string;
  about?: string;
}

export interface SiteSection {
  id: string;
  type: string;
  title?: string;
  order?: number;
}

export interface SiteNavItem {
  label: string;
  anchor: string;
}

export interface SiteCta {
  label: string;
  type: string;
  value?: string;
}

export interface SiteSpec {
  business?: Partial<SiteBusiness>;
  design_system?: {
    colors?: Record<string, string>;
    typography?: { heading_font?: string; body_font?: string };
    visual_style?: string;
    layout_mood?: string;
  };
  pages?: Record<string, boolean>;
  sections?: SiteSection[];
  navigation?: SiteNavItem[];
  content?: Record<string, unknown>;
  calls_to_action?: SiteCta[];
  seo?: { title?: string; description?: string; keywords?: string[] | string };
  [key: string]: unknown;
}

export interface LeadLike {
  id?: string;
  name?: string | null;
  company_name?: string | null;
  segment?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  address?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  has_website?: boolean | null;
  opening_hours?: string[] | null;
  score_reasons?: string[];
}

// Fonte de dados flexível (aceita Lead, JSON do banco ou objeto solto).
export type LeadSource = Partial<Record<keyof LeadLike, unknown>>;

export const SITE_STATUS_LABEL: Record<SiteProjectStatus, string> = {
  draft: "Rascunho",
  generated: "Especificado",
  error: "Erro",
};

export function statusLabel(status: string): string {
  return SITE_STATUS_LABEL[status as SiteProjectStatus] ?? status;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function safeArr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((i): i is Record<string, unknown> => !!i && typeof i === "object") : [];
}

export function pickLeadForSpec(lead: LeadSource): Record<string, unknown> {
  return {
    name: lead.name ?? lead.company_name ?? "",
    company_name: lead.company_name ?? lead.name ?? "",
    segment: lead.segment ?? lead.category ?? "",
    category: lead.category ?? lead.segment ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    address: lead.address ?? "",
    phone: lead.phone ?? "",
    whatsapp: lead.whatsapp ?? "",
    website: lead.website ?? "",
    instagram: lead.instagram ?? "",
    facebook: lead.facebook ?? "",
    rating: typeof lead.rating === "number" ? lead.rating : null,
    reviews_count: typeof lead.reviews_count === "number" ? lead.reviews_count : null,
    has_website: typeof lead.has_website === "boolean" ? lead.has_website : null,
    opening_hours: Array.isArray(lead.opening_hours) ? lead.opening_hours.filter((i): i is string => typeof i === "string") : null,
    score_reasons: Array.isArray(lead.score_reasons) ? lead.score_reasons.filter((i): i is string => typeof i === "string") : [],
  };
}

export const SITE_PROJECT_DEFAULT_SPEC: SiteSpec = {
  business: { name: "", segment: "", city: "", state: "" },
  design_system: {
    colors: {},
    typography: { heading_font: "", body_font: "" },
    visual_style: "",
    layout_mood: "",
  },
  pages: { home: true },
  sections: [],
  navigation: [],
  content: {},
  calls_to_action: [],
  seo: { title: "", description: "", keywords: [] },
};

// Normaliza a especificação vinda do banco para renderização segura no preview.
export function normalizeSpec(raw: SiteSpec | Record<string, unknown> | null | undefined): SiteSpec {
  if (!raw || typeof raw !== "object") return SITE_PROJECT_DEFAULT_SPEC;
  const businessRaw = (raw.business && typeof raw.business === "object" ? raw.business : {}) as Record<string, unknown>;
  const designRaw = (raw.design_system && typeof raw.design_system === "object" ? raw.design_system : {}) as Record<string, unknown>;
  const colorsRaw = (designRaw.colors && typeof designRaw.colors === "object" ? designRaw.colors : {}) as Record<string, unknown>;
  const typoRaw = (designRaw.typography && typeof designRaw.typography === "object" ? designRaw.typography : {}) as Record<string, unknown>;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter((s): s is SiteSection => !!s && typeof s === "object")
    : [];
  const navigation = Array.isArray(raw.navigation)
    ? raw.navigation.filter((n): n is SiteNavItem => !!n && typeof n === "object")
    : [];
  const ctas = Array.isArray(raw.calls_to_action)
    ? raw.calls_to_action.filter((c): c is SiteCta => !!c && typeof c === "object")
    : [];

  return {
    business: {
      name: str(businessRaw.name),
      segment: str(businessRaw.segment) || undefined,
      city: str(businessRaw.city) || undefined,
      state: str(businessRaw.state) || undefined,
      tagline: str(businessRaw.tagline) || undefined,
      about: str(businessRaw.about) || undefined,
    },
    design_system: {
      colors: (Object.entries(colorsRaw) as [string, unknown][])
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(entry[1]))
        .reduce<Record<string, string>>((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
      typography: {
        heading_font: str(typoRaw.heading_font) || undefined,
        body_font: str(typoRaw.body_font) || undefined,
      },
      visual_style: str(designRaw.visual_style) || undefined,
      layout_mood: str(designRaw.layout_mood) || undefined,
    },
    pages: raw.pages && typeof raw.pages === "object"
      ? Object.fromEntries(Object.entries(raw.pages as Record<string, unknown>).map(([k, v]) => [k, !!v]))
      : { home: true },
    sections,
    navigation,
    content: raw.content && typeof raw.content === "object" ? (raw.content as Record<string, unknown>) : {},
    calls_to_action: ctas,
    seo: raw.seo && typeof raw.seo === "object"
      ? {
          title: str((raw.seo as Record<string, unknown>).title) || undefined,
          description: str((raw.seo as Record<string, unknown>).description) || undefined,
          keywords: Array.isArray((raw.seo as Record<string, unknown>).keywords)
            ? ((raw.seo as Record<string, unknown>).keywords as string[])
            : typeof (raw.seo as Record<string, unknown>).keywords === "string"
              ? [(raw.seo as Record<string, unknown>).keywords as string]
              : [],
        }
      : { title: undefined, description: undefined, keywords: [] },
  };
}

// Pega um bloco de conteúdo (hero, about...) de forma segura.
export function contentBlock(spec: SiteSpec, key: string): Record<string, unknown> {
  const c = spec.content ?? {};
  const block = c[key];
  return block && typeof block === "object" ? (block as Record<string, unknown>) : {};
}

const CONTACT_WORDS = /telefone|whatsapp|zap|numero|número|contato|phone|ligar|email|e-mail|endereco|endereço|instagram/i;

export function instructionAllowsContact(instruction: string): boolean {
  return CONTACT_WORDS.test(instruction);
}

// Proteção client-side contra invenção: restaura campos factuais quando a
// instrução não os solicita explicitamente. Mantém apenas a edição visual/textual.
export function applyAiProtections(original: SiteSpec, next: SiteSpec, instruction: string): SiteSpec {
  const draft = cloneDeep(next);
  const allowContact = instructionAllowsContact(instruction);

  if (original.business) {
    draft.business = draft.business ?? {};
    draft.business.name = original.business.name ?? draft.business.name;
    if (original.business.city) draft.business.city = original.business.city;
    if (original.business.state) draft.business.state = original.business.state;
    if (original.business.segment) draft.business.segment = original.business.segment;
  }

  if (!allowContact) {
    const origContact = contentBlock(original, "contact");
    const draftContact = ensureBlock(draft, "contact");
    if (typeof origContact.phone === "string") draftContact.phone = origContact.phone;
    if (typeof origContact.whatsapp === "string") draftContact.whatsapp = origContact.whatsapp;

    const origCtas = original.calls_to_action ?? [];
    const nextCtas = (draft.calls_to_action ?? []).map((c, i) => {
      const copy = { ...c };
      const orig = origCtas[i];
      if (orig && (copy.type === "whatsapp" || copy.type === "tel") && typeof orig.value === "string" && orig.value) {
        copy.value = orig.value;
      }
      return copy;
    });
    draft.calls_to_action = nextCtas;
  }

  return normalizeSpec(draft);
}

export function specsEqual(a: SiteSpec | null, b: SiteSpec | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureBlock(content: SiteSpec["content"] | undefined, key: string): Record<string, unknown> {
  const target = (content ?? {}) as Record<string, unknown>;
  if (!target[key] || typeof target[key] !== "object") target[key] = {};
  return target[key] as Record<string, unknown>;
}
