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

# MÉTODO (pense rápido, sem mostrar o raciocínio)
Antes de escrever o JSON, decida internamente:
A. Segmento real (ex.: clínica, advocacia, restaurante, oficina, salão, cafeteria...).
B. Posicionamento provável do negócio e público-alvo.
C. Intenção comercial da página (agendar? reservar? orçar? contato?).
D. Hierarquia de informação (o que o visitante deve ver primeiro, depois, por último).
E. Direção visual coerente com o segmento (não troque apenas a cor).
F. Arquitetura da página (escolha UMA variação real — ver "ARQUITETURAS").
G. Conteúdo editorial curto, baseado apenas nos dados reais.
H. CTAs contextuais (um CTA principal coerente).
I. SEO simples.

Depois produza o JSON final.

# SUA SAÍDA — JSON EXATO com estas chaves (não invente outras de nível superior):

{
  "business": {
    "name": string, "segment": string, "city": string, "state": string,
    "tagline": string | null, "about": string | null
  },
  "design_system": {
    "colors": { "primary": "#hex", "on_primary": "#hex", "secondary": "#hex", "accent": "#hex", "background": "#hex", "surface": "#hex", "on_surface": "#hex", "muted": "#hex", "border": "#hex" },
    "typography": { "heading_font": "fonte Google", "body_font": "fonte Google", "heading_weight": "regular|semibold|bold", "heading_scale": "normal|large|display", "body_size": "normal|large" },
    "visual_style": "descrição curta da atmosfera",
    "layout_mood": "minimal|editorial|bold|organic|premium|playful",
    "layout_archetype": "editorial|corporate|minimal|luxury|bold|service_focused|local_business",
    "hero_variant": "split|centered|editorial|statement|service_first",
    "card_style": "flat|bordered|elevated|editorial",
    "button_style": "solid|outline|soft",
    "navigation_style": "minimal|centered|boxed",
    "cta_treatment": "primary_section|band|inline",
    "footer_style": "simple|editorial|centered",
    "section_spacing": "compact|comfortable|generous",
    "visual_density": "airy|balanced|dense",
    "decorative_intensity": "none|low|medium",
    "container_width": "narrow|standard|wide",
    "radius_scale": "none|small|medium|large"
  },
  "pages": { "home": true, "services": boolean, "contact": boolean },
  "navigation": [ { "label": string, "anchor": "hero|about|services|testimonials|contact" } ],
  "sections": [ { "id": string, "type": "hero|about|services|testimonials|cta|contact", "order": number } ],
  "content": {
    "hero": { "title": string, "subtitle": string, "primary_cta": string|null, "primary_cta_type": "whatsapp|tel|scroll|link", "primary_cta_value": string|null, "secondary_cta": string|null, "image": null },
    "about": { "title": string, "body": string },
    "services": { "title": string, "subtitle": string|null, "items": [ { "title": string, "description": string, "icon": string|null } ] },
    "testimonials": { "title": string, "items": [] },
    "cta": { "title": string, "body": string, "button_label": string|null },
    "contact": { "title": string, "body": string|null, "phone": string|null, "whatsapp": string|null },
    "footer": { "tagline": string }
  },
  "calls_to_action": [ { "label": string, "type": "whatsapp|tel|scroll|link", "value": string } ],
  "seo": { "title": string, "description": string, "keywords": string[] }
}

# ARQUITETURAS DE PÁGINA (escolha UMA com justificativa; NÃO invente ordem aleatória)
- A — institucional com serviços: Nav > Hero (centered/split) > Sobre > Serviços > Depoimentos? > CTA > Contato > Footer.
- B — conversão comercial: Nav > Hero orientado (split/service_first) > Serviços > Diferenciais > Contato > CTA > Footer.
- C — editorial/confiança: Nav > Hero editorial > Prova (sobre com autoridade) > Serviços > CTA > Contato > Footer.
- D — negócio local: Nav > Hero (service_first/centered) > Serviços > Contato + dados práticos > Footer.

# DIREÇÕES VISUAIS POR SEGMENTO (referência — adapte com critério)
- CLÍNICA/SAÚDE: limpa, sofisticada, humana, confiável. Muito espaço negativo; tipografia elegante (ex.: serif/geometrica suave); hierarquia calma; CTA de agendamento/contato; sem cards infantis; paleta sóbria (azul-escuro, teal, neutros quentes). Archetype: service_focused ou editorial.
- ADVOCACIA: autoridade e sobriedade. Composição editorial; tipografia institucional (serif forte p/ títulos); contraste controlado; menos decoração; CTA "Falar com um advogado". Archetype: editorial ou corporate.
- RESTAURANTE/ALIMENTAÇÃO: sensorial, marcante. Tipografia display expressiva; hierarquia comercial; destaque para marca; CTA "Reservar mesa"/"Ver cardápio". Evite corporativo. Archetype: bold ou local_business.
- OFICINA/AUTOMOTIVO: robusto e objetivo. Visual técnico; informações comerciais claras; serviços organizados; CTA "Solicitar orçamento". Archetype: service_focused ou local_business.
- SALÃO/ESTÉTICA: refinamento, sofisticação; tipografia elegante; NADA de rosa/roxo padrão ou gradientes clichê. Archetype: luxury ou editorial.
- PADARIA/CAFETERIA/LOCAL: acolhedor artesanal; tipografia display calorosa; fotos de produto; CTA de encomenda/WhatsApp. Archetype: local_business ou bold.
- OUTROS: escolha a direção mais plausível para o segmento.

# REGRAS DE CONTEÚDO (CRÍTICAS)
- Português do Brasil. Textos curtos, diretos e profissionais.
- NUNCA invente fatos: telefone, endereço, e-mail, horário, avaliações, CNPJ, funcionários, prêmios, anos de história, números.
- Dados não fornecidos → null. Serviços: liste serviços TÍPICOS do segmento como sugestões EDITÁVEIS, sem afirmar que o negócio oferece algo específico.
- Sobre: institucional genérico editável, sem história/anos/números.
- Depoimentos: deixe items [] SEMPRE, salvo se o lead fornecer depoimento real (não fornece). NUNCA crie depoimentos.
- Tagline: use apenas segmento/cidade reais.

# REGRAS DE DESIGN (QUALIDADE PROFISSIONAL)
- Composição > decoração. Priorize whitespace, proporção, contraste, alinhamento, ritmo vertical, hierarquia e legibilidade.
- NÃO use: gradientes aleatórios; excesso de sombras; cards para tudo; blocos gigantes; títulos enormes sem função; múltiplas cores decorativas; botões repetidos; seções redundantes; aparência de template ou estética "feita por IA".
- CORES: paleta com função — background, surface, text (on_surface), muted, primary, secondary, accent, border. Garanta contraste (texto sobre fundo legível). Escolha por segmento, não por gosto.
- Gradiente: NÃO use gradientes no hero por padrão. Se usar, mínimo e sutil (ex.: só um toque no CTA), nunca como base de todo o site.
- TIPOGRAFIA: par heading/body coerente e disponível no Google Fonts. heading_scale: normal/large/display conforme impacto desejado; display apenas para marcas fortes (restaurante, salão, estética). body_size large para editorial. heading_weight coerente com a fonte.
- SEÇÕES: hero + 3 a 5 seções com função + footer. Cada seção deve ter papel na conversão.
- O hero NÃO precisa ocupar a tela toda. Prefira composições equilibradas.
- Imagens: deixe "image": null. Em visual_style, descreva que TIPOS de imagem combinariam (não URLs).

# LIMITE DE TAMANHO (IMPORTANTE — manter resposta enxuta)
- Produza um JSON COMPACTO: no máximo ~3.500–4.000 tokens no total.
- Títulos: curtos (até 8 palavras). Subtítulos/parágrafos: no máximo 2–3 frases.
- Serviços: entre 3 e 5 itens, com descrições de 1–2 frases cada.
- NÃO repita a mesma informação em seções diferentes (ex.: não repita a tagline no hero e no sobre).
- Seções: 4 a 6 no total (hero incluso) + footer. Nada de conteúdo redundante ou genérico demais.

# VALIDADE
Retorne APENAS o JSON (sem markdown, sem comentários). Use aspas duplas válidas.`;

function normToken<T extends readonly string[]>(raw: unknown, list: T, fallback: T[number]): T[number] {
  const v = typeof raw === "string" ? raw.trim() : "";
  return (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function normFont(raw: unknown, fallback: string): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v.length >= 2 && v.length <= 48 ? v : fallback;
}

function normalizeSpec(raw: Record<string, unknown>, lead: LeadInput): Record<string, unknown> {
  const business = asRecord(raw.business);
  const name = s(business.name) || s(lead.name) || s(lead.company_name) || "Minha Empresa";
  const segment = s(business.segment) || s(lead.segment) || s(lead.category) || "";

  const design = asRecord(raw.design_system);
  const colors = asRecord(design.colors);
  const defaultColors: Record<string, string> = {
    primary: "#0f766e", on_primary: "#ffffff", secondary: "#134e4a",
    accent: "#b45309", background: "#f8fafc", surface: "#ffffff",
    on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0",
  };
  const cleanColors: Record<string, string> = {};
  for (const key of Object.keys(defaultColors)) {
    const v = s(colors[key]);
    cleanColors[key] = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v) ? v : defaultColors[key];
  }
  const typography = asRecord(design.typography);
  const cleanTypography = {
    heading_font: normFont(typography.heading_font, "Plus Jakarta Sans"),
    body_font: normFont(typography.body_font, "Inter"),
    heading_weight: ["regular", "semibold", "bold"].includes(s(typography.heading_weight)) ? s(typography.heading_weight) : "bold",
    heading_scale: normToken(typography.heading_scale, ["normal", "large", "display"], "large"),
    body_size: s(typography.body_size) === "large" ? "large" : "normal",
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

  const mood = normToken(design.layout_mood, ["minimal", "editorial", "bold", "organic", "premium", "playful"], "minimal");
  const archetype = normToken(design.layout_archetype, ["editorial", "corporate", "minimal", "luxury", "bold", "service_focused", "local_business"], "service_focused");
  const heroVariant = normToken(design.hero_variant, ["split", "centered", "editorial", "statement", "service_first"], archetype === "editorial" || archetype === "luxury" ? "editorial" : archetype === "bold" ? "statement" : "split");
  const cardStyle = normToken(design.card_style, ["flat", "bordered", "elevated", "editorial"], archetype === "editorial" || archetype === "luxury" ? "editorial" : "bordered");
  const buttonStyle = normToken(design.button_style, ["solid", "outline", "soft"], "solid");
  const navStyle = normToken(design.navigation_style, ["minimal", "centered", "boxed"], "minimal");
  const ctaTreatment = normToken(design.cta_treatment, ["primary_section", "band", "inline"], archetype === "editorial" ? "inline" : "band");
  const footerStyle = normToken(design.footer_style, ["simple", "editorial", "centered"], "simple");
  const sectionSpacing = normToken(design.section_spacing, ["compact", "comfortable", "generous"], "comfortable");
  const density = normToken(design.visual_density, ["airy", "balanced", "dense"], "airy");
  const decorative = normToken(design.decorative_intensity, ["none", "low", "medium"], "low");
  const container = normToken(design.container_width, ["narrow", "standard", "wide"], "standard");
  const radiusScale = normToken(design.radius_scale, ["none", "small", "medium", "large"], "medium");

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
      visual_style: s(design.visual_style) || "",
      layout_mood: mood,
      layout_archetype: archetype,
      hero_variant: heroVariant,
      card_style: cardStyle,
      button_style: buttonStyle,
      navigation_style: navStyle,
      cta_treatment: ctaTreatment,
      footer_style: footerStyle,
      section_spacing: sectionSpacing,
      visual_density: density,
      decorative_intensity: decorative,
      container_width: container,
      radius_scale: radiusScale,
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
    let usedModel = "gemini-2.5-flash";
    try {
      const result = await generateText({
        system: SYSTEM_PROMPT,
        user,
        temperature: 0.9,
        json: true,
        maxOutputTokens: 4500,
      });
      raw = result.text;
      usedModel = result.model;
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

    return new Response(JSON.stringify({ spec, model: usedModel, status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
