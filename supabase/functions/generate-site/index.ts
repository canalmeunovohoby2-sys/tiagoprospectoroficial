import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, extractJson } from "../_shared/ai.ts";
import { getNicheDesign } from "../_shared/niche-design.ts";
import { getDesignDirective, normalizeMotionMeta, defaultMotionMeta } from "../_shared/design-directive.ts";
import { qualityIssues, ensureBaseContent, qualityScore, premiumScore, premiumQA, PREMIUM_QA_MIN, qaIssuesForRefinement } from "../_shared/site-quality.ts";
import { componentPlanForCluster, resolveComponentPlan, type ComponentPlan } from "../_shared/component-library.ts";
import { getImageNeeds, type SiteAsset, type ImageNeeds } from "../_shared/image-assets.ts";

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

// Limite mínimo de qualidade premium (0-100) para aceitar a spec gerada.
const PREMIUM_MIN = 55;

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
     "hero_variant": "split|centered|editorial|statement|service_first|asymmetric|layered|collage|typography_led|cinematic",
     "card_style": "flat|bordered|elevated|editorial",
     "button_style": "solid|outline|soft|ghost|text|accent",
     "navigation_style": "minimal|centered|boxed",
     "header_variant": "solid|glass|floating|editorial|minimal|transparent",
     "cta_treatment": "primary_section|band|inline|split|image|immersive",
     "footer_style": "multi_column|large_cta|editorial|dark|minimal|centered|simple",
     "gallery_variant": "grid|editorial|asymmetric|masonry|featured",
     "section_spacing": "compact|comfortable|generous",
     "visual_density": "airy|balanced|dense",
     "decorative_intensity": "none|low|medium",
     "container_width": "narrow|standard|wide",
     "radius_scale": "none|small|medium|large",
     "motion": { "reveal": boolean, "staggerCards": boolean, "hoverLift": boolean, "imageZoom": boolean, "smoothScroll": boolean }
   },
  "pages": { "home": true, "services": boolean, "contact": boolean },
  "navigation": [ { "label": string, "anchor": "hero|about|services|testimonials|contact" } ],
  "sections": [ { "id": string, "type": "hero|about|services|features|trust|numbers|process|faq|testimonials|cta|contact", "order": number } ],
  "content": {
    "hero": { "title": string, "subtitle": string, "primary_cta": string|null, "primary_cta_type": "whatsapp|tel|scroll|link", "primary_cta_value": string|null, "secondary_cta": string|null, "image": null, "image_note": string|null },
    "trust": { "title": string|null, "items": [ { "text": string } ] },
    "features": { "title": string, "items": [ { "title": string, "description": string, "icon": string|null } ] },
    "numbers": { "title": string|null, "items": [ { "value": string, "label": string } ] },
    "process": { "title": string, "steps": [ { "title": string, "description": string } ] },
    "faq": { "title": string, "items": [ { "question": string, "answer": string } ] },
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

# ESTRUTURA RICA (NÃO aceite hero+3 cards+footer como solução automática)
- Monte o site com a densidade que o segmento comporta: além das seções centrais, use quando fizer sentido: trust (indicadores/garantias), features (diferenciais), numbers (somente com números REAIS — se não houver, omita), process (etapas), faq (perguntas e respostas típicas), testimonials (somente com depoimento real — normalmente deixe items vazio), about, cta, contact.
- Cada seção precisa de função comercial ou narrativa. Nada de seção decorativa vazia.
- numbers: se o lead não tiver números reais, NÃO crie a seção numbers.
- faq: escreva perguntas típicas do segmento com respostas genéricas e seguras (editáveis), sem inventar fatos específicos da empresa.
- trust: itens de garantia/benefício seguros e genéricos (ex.: "Atendimento humanizado") — nunca fatos inventados.
- process: descreva etapas de trabalho genéricas e editáveis, sem prometer prazos/números.
- Evite seções duplicadas e conteúdo repetido.

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

# MOTION (metadados de animação — devem ser coerentes com o segmento)
- Inclua em design_system.motion um objeto com 5 chaves booleanas:
  - reveal: animação de revelação suave por seção (stagger de blocos).
  - staggerCards: cards de serviços/galeria com stagger (aparecem um a um).
  - hoverLift: hover com elevação sutil em cards/botões.
  - imageZoom: zoom leve na imagem ao passar o mouse (galeria/hero).
  - smoothScroll: scroll suave entre âncoras.
- Defaults: todos true. Desative apenas quando o segmento pede um ritmo extremamente estático (ex.: profissional consultivo pode desativar staggerCards).
- Nunca use efeitos de paralaxe, flash ou transições bruscas.

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

# COMPONENTES (7.1) — combinações coerentes, NUNCA o mesmo site para todos
- header_variant: "solid|glass|floating|editorial|minimal|transparent". header não pode ser só logo + links: adicione CTA em destaque quando o segmento converter (agendar/orçar/reservar).
- hero_variant: além dos clássicos, pode usar "asymmetric" (imagem deslocada + tipografia), "layered" (imagem sobreposta a cor de fundo), "typography_led" (quase sem imagem, tipografia enorme) ou "cinematic" (imagem full-bleed com overlay suave). Escolha UMA coerente com o segmento.
- button_style: solid|outline|soft|ghost|text|accent. Prefira "accent" quando o CTA for conversão quente (restaurante/automotivo).
- footer_style: nunca apenas links+copyright. Use "large_cta" (CTA grande no rodapé), "multi_column" (marca + navegação + contato + horários), "editorial" (base com tagline), "dark" ou "minimal".
- gallery_variant: "grid|editorial|asymmetric|masonry|featured". Use composições assimétricas/editoriais para segmentos visuais.
- REGRA DE COERÊNCIA: a combinação header_variant+hero_variant+footer_style+gallery_variant DEVE variar por segmento — não repita a mesma combinação genérica (hero split + cards + footer simple) em todos os projetos.

# PREMIUM QA (7.3) — o site não pode parecer PDF/template
Antes de finalizar, se auto-avaliar como Art Director: o site tem identidade visual? Imagens com contexto do negócio? Composição variada (não só cards repetidos)? Motion/microinterações? Header/footer com intenção? Se parecer "template com cores trocadas", REESCREVA a spec com direção de arte própria do segmento.

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
  const content = ensureBaseContent(contentRaw);

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
  // Plano de componentes do cluster (7.1) — fornece fallbacks coerentes quando
  // o modelo omitir/errar a variante. A spec guarda a escolha rica.
  const cluster = getNicheDesign(segment).cluster;
  const plan = componentPlanForCluster(cluster);
  const heroVariant = normToken(design.hero_variant, ["split", "centered", "editorial", "statement", "service_first", "asymmetric", "layered", "collage", "typography_led", "cinematic"], plan.hero);
  const cardStyle = normToken(design.card_style, ["flat", "bordered", "elevated", "editorial"], archetype === "editorial" || archetype === "luxury" ? "editorial" : "bordered");
  const buttonStyle = normToken(design.button_style, ["solid", "outline", "soft", "ghost", "text", "accent"], plan.button);
  const navStyle = normToken(design.navigation_style, ["minimal", "centered", "boxed"], "minimal");
  const headerVariant = normToken(design.header_variant, ["solid", "glass", "floating", "editorial", "minimal", "transparent"], plan.header);
  const ctaTreatment = normToken(design.cta_treatment, ["primary_section", "band", "inline", "split", "image", "immersive"], plan.cta);
  const footerStyle = normToken(design.footer_style, ["multi_column", "large_cta", "editorial", "dark", "minimal", "centered", "simple"], plan.footer);
  const galleryVariant = normToken(design.gallery_variant, ["grid", "editorial", "asymmetric", "masonry", "featured"], plan.gallery);
  const sectionSpacing = normToken(design.section_spacing, ["compact", "comfortable", "generous"], "comfortable");
  const density = normToken(design.visual_density, ["airy", "balanced", "dense"], "airy");
  const decorative = normToken(design.decorative_intensity, ["none", "low", "medium"], "low");
  const container = normToken(design.container_width, ["narrow", "standard", "wide"], "standard");
  const radiusScale = normToken(design.radius_scale, ["none", "small", "medium", "large"], "medium");

  // Back-compat: renderizadores antigos só conheciam os footer_style clássicos.
  // Guardamos o valor rico em "footer_style" e um mapa de compat em "footer_visual".
  const legacyFooter = footerStyle === "editorial" || footerStyle === "centered" || footerStyle === "simple" ? footerStyle : footerStyle === "minimal" ? "simple" : "centered";

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
       header_variant: headerVariant,
       cta_treatment: ctaTreatment,
       footer_style: footerStyle,
       footer_visual: legacyFooter,
       gallery_variant: galleryVariant,
       section_spacing: sectionSpacing,
       visual_density: density,
       decorative_intensity: decorative,
       container_width: container,
       radius_scale: radiusScale,
       motion: normalizeMotionMeta(design.motion),
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
    content,
    calls_to_action: ctas,
    seo: {
      title: s(seo.title) || `${name}${segment ? " | " + segment : ""}`,
      description: s(seo.description) || "",
      keywords: asStringArray(seo.keywords),
    },
  };
}

async function callImagesFunction(query: string, count: number, orientation: string): Promise<SiteAsset[]> {
  const baseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!baseUrl || !anonKey) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14_000);
  try {
    const res = await fetch(`${baseUrl}/functions/v1/get-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({ query, count, orientation }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray((data as { assets?: unknown })?.assets) ? ((data as { assets: SiteAsset[] }).assets) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Busca assets por nicho (hero + galeria). Falha silenciosa → site segue sem imagens.
async function fetchAssetsForNiche(needs: ImageNeeds): Promise<{ hero: SiteAsset | null; extras: SiteAsset[] }> {
  const [heroList, extraList] = await Promise.allSettled([
    callImagesFunction(needs.heroQuery, 4, needs.orientation),
    callImagesFunction(needs.secondaryQuery, Math.max(3, needs.galleryCount), needs.orientation),
  ]);
  const hero = heroList.status === "fulfilled" ? (heroList.value[0] ?? null) : null;
  const extras = (extraList.status === "fulfilled" ? extraList.value : []).filter((a) => a.url !== hero?.url);
  return { hero, extras };
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

    const userBase = `DADOS REAIS DISPONÍVEIS (só use estes; o que não existir fica null):
${businessFacts || "Nenhum dado factual além do nome."}
`;

    const niche = getNicheDesign(lead.segment || lead.category || "");
    const directive = getDesignDirective(lead.segment || lead.category || "");
    const plan = componentPlanForCluster(niche.cluster);
    const imageNeeds = getImageNeeds(lead.segment || lead.category || "");
    const assets = await fetchAssetsForNiche(imageNeeds);
    const assetsAvailable = !!(assets.hero || assets.extras.length > 0);
    const assetBrief = [
      assets.hero
        ? `ASSET HERO (imagem ilustrativa fornecida — use SOMENTE esta URL em content.hero.image como objeto { url, alt, source, isIllustrative }): ${assets.hero.url}  (alt: ${assets.hero.alt || "Ambiente do negócio"})`
        : "",
      assets.extras.length
        ? `ASSETS DE GALERIA (ilustrativos fornecidos; se incluir a seção gallery, use SOMENTE estas URLs em content.gallery.items): ${assets.extras.map((a) => a.url).join(" | ")}`
        : "",
    ].filter(Boolean).join("\n");

    const attachAssets = (obj: Record<string, unknown>): void => {
      const content = ensureBaseContent(obj.content as Record<string, unknown> | undefined);
      obj.content = content;
      if (assets.hero) {
        const hero = content.hero && typeof content.hero === "object" ? content.hero as Record<string, unknown> : (content.hero = {});
        hero.image = { url: assets.hero.url, alt: assets.hero.alt || "Ambiente do negócio", source: "unsplash", sourceUrl: assets.hero.sourceUrl ?? null, isIllustrative: true };
        hero.image_note = "Imagem ilustrativa de referência — não é foto real do negócio.";
      }
      if (assets.extras.length >= 2) {
        const gallery = content.gallery && typeof content.gallery === "object" ? content.gallery as Record<string, unknown> : (content.gallery = {});
        gallery.title = typeof gallery.title === "string" && gallery.title ? gallery.title : "Ambiente e inspiração";
        gallery.items = assets.extras.slice(0, imageNeeds.galleryCount).map((a) => ({
          image: { url: a.url, alt: a.alt || "Ambiente", source: "unsplash", isIllustrative: true },
          alt: a.alt || "Ambiente",
        }));
        const sections = Array.isArray(obj.sections) ? obj.sections as Array<Record<string, unknown>> : (obj.sections = []);
        if (!sections.some((x) => x.type === "gallery")) {
          sections.push({ id: "gallery", type: "gallery", order: sections.length + 1 });
        }
      }
    };

    let raw = "";
    let usedModel = "gemini-2.5-flash";
    let finalSpec: Record<string, unknown> | null = null;
    let lastIssues: string[] = [];
    let lastScore = 100;
    let lastQaScore = 100;
    let lastQaFeedback: string[] = [];

    const planBlock = `Plano de componentes premium deste nicho (escolha coerente e NÃO repita a mesma combinação de outros segmentos):
Header: ${plan.header} | Hero sugerido: ${plan.hero} | Botão: ${plan.button}
CTA: ${plan.cta} | Footer: ${plan.footer} | Galeria: ${plan.gallery} | Imagem: ${plan.imageBlock}
Composições recomendadas: ${plan.composition.join(", ")}
Foco de imagem: ${plan.imageFocus.join(", ")}`;

    // Até 4 tentativas: quality gate (anti-genérico), premium gate (7.1) e
    // Premium QA (7.3) com refinement automático guiado pelos problemas.
    for (let attempt = 0; attempt < 4 && !finalSpec; attempt++) {
      const qualityIssuesList = attempt > 0 && lastIssues.length > 0
        ? `\n\nQUALITY GATE — problemas detectados na tentativa anterior. Corrija TODOS ao reescrever a spec completa:
- ${lastIssues.join("\n- ")}
Mantenha a direção de design por nicho e NUNCA invente dados.`
        : "";
      const premiumIssues = attempt > 0 && lastScore < PREMIUM_MIN
        ? `\n\nPREMIUM GATE — pontuação de qualidade premium foi ${lastScore}/100 (mínimo ${PREMIUM_MIN}). Melhore:
- Adicione ou diversifique seções com função (trust, features, process, faq, gallery).
- Refine o design_system: cores completas, tipografia coerente, motion metadata (reveal/staggerCards/hoverLift/imageZoom/smoothScroll).
- Inclua imagens (hero e galeria) quando a direção visual exigir.
- Alongue a copy (evite textos genéricos ou muito curtos).`
        : "";
      const qaRefinement = attempt > 0 && lastQaScore < PREMIUM_QA_MIN && lastQaFeedback.length > 0
        ? `\n\nPREMIUM QA (7.3) — crítica automática (Art Director/UX): score ${lastQaScore}/100 (mínimo ${PREMIUM_QA_MIN}). Corrija os problemas apontados preservando os dados reais:
- ${lastQaFeedback.slice(0, 8).join("\n- ")}
Pode mudar apenas o que for visual/estrutural (composição, variantes, imagens ilustrativas, layout, motion). NUNCA invente fatos.`
        : "";
      const user = `${userBase}

DIRETRIZ DE DESIGN POR NICHO (siga como diretor de arte):
Conceito visual: ${niche.visualConcept}
Objetivos comerciais: ${niche.objectives.join("; ")}
Layout: ${niche.layoutArchetype} · hero ${niche.heroComposition} · navegação ${niche.navStyle} · densidade ${niche.density}
Tipografia: ${niche.typographyDirection}
Cores: ${niche.colorDirection}
Imagens: ${niche.imageStrategy}
Tom de comunicação: ${niche.tone}
CTA principal recomendado: "${niche.cta}"
Seções recomendadas para considerar (escolha com função): ${niche.recommendedSections.join(", ")}
Microinterações: ${niche.interactionNotes}

DIRETRIZ DE ARTE ESTRUTURADA (Design Directive — use como referência primária):
Arquétipo de exibição: ${directive.displayArchetype}
Personalidade da marca: ${directive.brandPersonality}
Estratégia do hero: ${directive.heroStrategy}
Elementos do hero (use pelo menos 3): ${directive.heroElements.join(", ")}
Linguagem de imagem: ${directive.imageLanguage.join(", ")}
Linguagem decorativa: ${directive.decorativeLanguage}
Linguagem de motion: ${directive.motionLanguage}
Ritmo de seções: ${directive.sectionRhythm}
Estratégia do rodapé: ${directive.footerStrategy}
Estratégia de navegação: ${directive.navStrategy}
Motion metadata (incluir em design_system.motion): ${JSON.stringify(defaultMotionMeta())}

${planBlock}
${assetBrief}${qualityIssuesList}${premiumIssues}${qaRefinement}

Gere a especificação JSON completa do site.`;

      try {
        const result = await generateText({
          system: SYSTEM_PROMPT,
          user,
          temperature: 0.9,
          json: true,
          maxOutputTokens: 5200,
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
        if (attempt < 3) {
          lastIssues = ["JSON inválido ou vazio na resposta"];
          continue;
        }
        return new Response(
          JSON.stringify({ error: "A IA retornou JSON inválido ou vazio.", raw: raw.slice(0, 800) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const normalized = normalizeSpec(parsed, lead);
      attachAssets(normalized);
      const specForQa = normalized as Parameters<typeof qualityIssues>[0];
      lastIssues = qualityIssues(specForQa, {
        imageDriven: assetsAvailable && imageNeeds.imageDriven,
      });
      lastScore = premiumScore(specForQa);
      const qa = premiumQA(specForQa);
      lastQaScore = qa.score;
      lastQaFeedback = qaIssuesForRefinement(specForQa);
      if (lastIssues.length > 0 && attempt < 3) {
        continue;
      }
      if (lastScore < PREMIUM_MIN && attempt < 3) {
        continue;
      }
      if (qa.score < PREMIUM_QA_MIN && attempt < 3) {
        continue;
      }
      finalSpec = normalized;
    }

    if (!finalSpec) {
      return new Response(
        JSON.stringify({ error: "Qualidade insuficiente após regeneração.", issues: lastIssues, premium_score: lastScore, qa_score: lastQaScore }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ spec: finalSpec, model: usedModel, status: "ok", quality_issues: lastIssues, premium_score: lastScore, qa_score: lastQaScore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
