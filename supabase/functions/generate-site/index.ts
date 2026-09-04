import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, extractJson } from "../_shared/ai.ts";

interface LeadInput {
  name?: string | null;
  company_name?: string | null;
  segment?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  has_website?: boolean | null;
  opening_hours?: string[] | null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringArray(v: unknown): string[] {
  return asArray(v).filter((i): i is string => typeof i === "string" && i.trim().length > 0);
}

const SYSTEM_PROMPT = `Você é o diretor de criação do gerador de sites do TiagoProspector. Você transforma dados reais de um pequeno negócio brasileiro em uma ESPECIFICAÇÃO ESTRUTURADA de site (JSON), pronta para renderização futura.

# SUA SAÍDA — JSON EXATO com estas chaves (não invente outras de nível superior):

{
  "business": {
    "name": string,
    "segment": string,
    "city": string,
    "state": string,
    "tagline": string | null,
    "about": string | null
  },
  "design_system": {
    "colors": { "primary": "#hex", "on_primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "surface": "#hex", "on_surface": "#hex", "muted": "#hex" },
    "typography": { "heading_font": "nome da fonte Google Fonts", "body_font": "nome da fonte Google Fonts" },
    "visual_style": "descrição curta da atmosfera visual",
    "layout_mood": "um destes: minimal | editorial | bold | organic | premium | playful"
  },
  "pages": { "home": true, "services": boolean, "contact": boolean },
  "navigation": [ { "label": string, "anchor": "hero|about|services|testimonials|contact" } ],
  "sections": [
    { "id": "hero", "type": "hero", "title": string, "order": 1 },
    { "id": "about", "type": "about", "title": string, "order": 2 }
  ],
  "content": {
    "hero": { "title": string, "subtitle": string, "primary_cta": string | null, "secondary_cta": string | null, "image": null },
    "about": { "title": string, "body": string },
    "services": { "title": string, "subtitle": string | null, "items": [ { "title": string, "description": string, "icon": string | null } ] },
    "testimonials": { "title": string, "items": [ { "quote": string, "author": string, "role": string | null } ] },
    "cta": { "title": string, "body": string, "button_label": string | null },
    "contact": { "title": string, "body": string | null, "phone": string | null, "whatsapp": string | null },
    "footer": { "tagline": string }
  },
  "calls_to_action": [ { "label": string, "type": "whatsapp|tel|scroll|link", "value": string } ],
  "seo": { "title": string, "description": string, "keywords": string[] }
}

# REGRAS DE CONTEÚDO (CRÍTICAS)
- Português do Brasil. Textos curtos, diretos e profissionais.
- NUNCA invente fatos sobre a empresa: não crie telefone, endereço, e-mail, horário, avaliações, CNPJ, funcionários nem prêmios.
- Informações não fornecidas: use null (e o sistema mostra espaço editável). NUNCA preencha com dados falsos.
- Telefone/WhatsApp: use SOMENTE se vierem nos dados do lead. Caso contrário null.
- Serviços: liste serviços TÍPICOS do segmento como sugestões editáveis (ex.: "Cardápio e encomendas" para cafeterias). NUNCA afirme que o lead oferece algo específico sem dado real.
- Sobre (about): texto institucional genérico e editável baseado no segmento, sem afirmar histórico/anos/números da empresa.
- A "tagline" deve usar apenas o segmento/cidade reais.

# REGRAS DE DESIGN (ANTI-TEMPLATE)
- Analise o segmento e escolha um conceito visual próprio e coerente. NÃO use sempre o mesmo template.
- Varie: layout_mood, paletas, tipografia (escolha fontes reais disponíveis no Google Fonts) e estrutura de seções conforme o nicho.
- Paleta: 2-3 cores de marca + neutros, com contraste legível (texto sobre fundo). Use hex exatos.
- Tipografia: par heading/body com personalidade (ex.: serif + sans para estética, display condensada para café, grotesca limpa para clínica, etc.).
- Seções: hero + combinação natural para o negócio (about, services, testimonials, cta, contact). Mínimo hero + 3 seções + footer.
- Imagens: image deve ser null (as imagens serão inseridas depois). Descreva em visual_style quais TIPOS de imagem combinariam (ex.: "fotos de cafés e ambiente aconchegante").
- NUNCA inclua URLs de imagem, links externos, iframes ou código.

# VALIDADE
Retorne APENAS o JSON (sem markdown, sem comentários). Use aspas duplas válidas.`;

function normalizeSpec(raw: Record<string, unknown>, lead: LeadInput): Record<string, unknown> {
  const business = asRecord(raw.business);
  const name = s(business.name) || s(lead.name) || s(lead.company_name) || "Minha Empresa";
  const segment = s(business.segment) || s(lead.segment) || s(lead.category) || "";

  const design = asRecord(raw.design_system);
  const colors = asRecord(design.colors);
  const defaultColors: Record<string, string> = {
    primary: "#2563eb", on_primary: "#ffffff", secondary: "#1e293b",
    accent: "#0f766e", background: "#f8fafc", surface: "#ffffff",
    on_surface: "#0f172a", muted: "#64748b",
  };
  const cleanColors: Record<string, string> = {};
  for (const key of Object.keys(defaultColors)) {
    const v = s(colors[key]);
    cleanColors[key] = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v) ? v : defaultColors[key];
  }
  const typography = asRecord(design.typography);
  const cleanTypography = {
    heading_font: s(typography.heading_font) || "Plus Jakarta Sans",
    body_font: s(typography.body_font) || "Inter",
  };

  const sections = asArray(raw.sections)
    .map((sec) => {
      const r = asRecord(sec);
      const id = s(r.id) || s(r.type) || "section";
      return {
        id,
        type: s(r.type) || id,
        title: s(r.title) || null,
        order: typeof r.order === "number" ? r.order : undefined,
      };
    })
    .filter((x) => x.type.length > 0);

  const contentRaw = asRecord(raw.content);

  const ctas = asArray(raw.calls_to_action)
    .map((c) => {
      const r = asRecord(c);
      const type = s(r.type);
      if (type !== "whatsapp" && type !== "tel" && type !== "scroll" && type !== "link") return null;
      return { label: s(r.label) || "Falar agora", type, value: s(r.value) || "" };
    })
    .filter((x): x is { label: string; type: string; value: string } => x !== null);

  const seo = asRecord(raw.seo);

  return {
    business: {
      name,
      segment,
      city: s(business.city) || s(lead.city) || "",
      state: s(business.state) || s(lead.state) || "",
      tagline: s(business.tagline) || null,
      about: s(business.about) || null,
    },
    design_system: {
      colors: cleanColors,
      typography: cleanTypography,
      visual_style: s(design.visual_style) || "Moderno e acolhedor",
      layout_mood: ["minimal", "editorial", "bold", "organic", "premium", "playful"].includes(s(design.layout_mood))
        ? s(design.layout_mood)
        : "minimal",
    },
    pages: {
      home: true,
      services: !!asRecord(raw.pages).services,
      contact: !!asRecord(raw.pages).contact,
    },
    navigation: asArray(raw.navigation)
      .map((n) => {
        const r = asRecord(n);
        const anchor = s(r.anchor);
        if (!anchor) return null;
        return { label: s(r.label) || anchor, anchor };
      })
      .filter((x): x is { label: string; anchor: string } => x !== null),
    sections,
    content: {
      hero: asRecord(contentRaw.hero),
      about: asRecord(contentRaw.about),
      services: asRecord(contentRaw.services),
      testimonials: asRecord(contentRaw.testimonials),
      cta: asRecord(contentRaw.cta),
      contact: asRecord(contentRaw.contact),
      footer: asRecord(contentRaw.footer),
    },
    calls_to_action: ctas,
    seo: {
      title: s(seo.title) || `${name}${segment ? " | " + segment : ""}`,
      description: s(seo.description) || "",
      keywords: asStringArray(seo.keywords),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const leadRaw: unknown = body?.lead ?? {};
    const lead = leadRaw && typeof leadRaw === "object" ? (leadRaw as LeadInput) : ({} as LeadInput);
    if (!s(lead.name) && !s(lead.company_name)) {
      return new Response(JSON.stringify({ error: "lead.name é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const businessFacts = [
      `Empresa: ${s(lead.name) || s(lead.company_name) || "-"}`,
      `Segmento/nicho: ${s(lead.segment) || s(lead.category) || "-"}`,
      `Cidade/UF: ${[s(lead.city), s(lead.state)].filter(Boolean).join("/") || "-"}`,
      s(lead.address) && `Endereço real: ${lead.address}`,
      s(lead.phone) && `Telefone real: ${lead.phone}`,
      s(lead.whatsapp) && `WhatsApp real: ${lead.whatsapp}`,
      s(lead.instagram) && `Instagram real: ${lead.instagram}`,
      s(lead.website) && `Website atual: ${lead.website}`,
      typeof lead.has_website === "boolean" && `Possui site hoje: ${lead.has_website ? "sim" : "não"}`,
      typeof lead.rating === "number" && `Nota Google: ${lead.rating}`,
      typeof lead.reviews_count === "number" && `Reviews: ${lead.reviews_count}`,
      Array.isArray(lead.opening_hours) && lead.opening_hours.length > 0
        ? `Horários informados: ${lead.opening_hours.join(" | ")}`
        : null,
    ].filter(Boolean).join("\n");

    const user = `DADOS REAIS DISPONÍVEIS (só use estes; o que não existir fica null):
${businessFacts || "Nenhum dado factual além do nome."}

Gere a especificação JSON do site.`;

    let raw = "";
    try {
      const result = await generateText({
        system: SYSTEM_PROMPT,
        user,
        temperature: 0.9,
        json: true,
        maxOutputTokens: 8192,
      });
      raw = result.text;
    } catch (e) {
      if (e instanceof AiError) {
        return new Response(
          JSON.stringify({ error: e.message, kind: e.kind, detail: e.detail }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw e;
    }

    const parsed = extractJson(raw);
    if (!parsed || Object.keys(parsed).length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA retornou JSON inválido ou vazio.", raw: raw.slice(0, 800) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const spec = normalizeSpec(parsed, lead);

    return new Response(JSON.stringify({ spec, model: "gemini-2.5-flash", status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
