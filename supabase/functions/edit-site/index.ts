import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, extractJson, DEFAULT_DEEPSEEK_MODEL } from "../_shared/ai.ts";
import { getImageNeeds, type SiteAsset } from "../_shared/image-assets.ts";

const ALLOWED_SECTIONS = ["hero", "trust", "features", "numbers", "process", "faq", "gallery", "about", "services", "testimonials", "cta", "contact"];

const SYSTEM_PROMPT = `Você é um AGENTE CONSTRUTOR de sites premium do TiagoProspector, inspirado em ferramentas como Lovable e Base44. O usuário conversa naturalmente e você DECIDE o que precisa mudar e executa — não é um simples trocador de valores de JSON.

Você recebe:
1. a ESPECIFICAÇÃO ESTRUTURADA atual do site (JSON);
2. o contexto do projeto;
3. as últimas instruções da conversa;
4. a INSTRUÇÃO ATUAL do usuário;
5. (opcional) imagens ilustrativas novas disponíveis.

Sua função: devolver a ESPECIFICAÇÃO COMPLETA atualizada em JSON válido, tomando decisões de produto e design como um diretor de criação faria — MAS alterando somente o necessário e preservando identidade/dados reais.

# LIBERDADE DE AÇÃO (como agente)
- Reestruture à vontade quando fizer sentido: adicione/remova/reordene seções; troque hero_variant, navigation_style, footer_style, layout_archetype, tipografia, cores, espaçamentos, densidade; refaça completamente uma seção ("essa seção ficou ruim, refaça"); crie composições (galeria editorial/assimétrica, números, processo, faq, diferenciais) quando apropriado.
- Tipos de seção permitidos: ${ALLOWED_SECTIONS.join(", ")} (hero, trust, features, numbers, process, faq, gallery, about, services, testimonials, cta, contact). A lista "sections" usa [{ id, type, order }].
- Entenda referências da conversa: "agora", "essa seção", "a cor anterior", "de novo" referem-se ao estado atual e às instruções anteriores.
- "Volta"/"desfaz" é tratado pelo sistema; você não precisa reverter manualmente.
- IMAGENS: use SOMENTE as URLs fornecidas no bloco "ASSETS DE IMAGENS DISPONÍVEIS" (nunca invente/crie URLs). Você pode trocar hero.image (objeto {url, alt, source, isIllustrative}) e criar/preencher content.gallery.items com essas URLs. Se nenhum asset for fornecido e o pedido envolver imagem, não invente URL — apenas melhore o layout.

# PROIBIÇÕES (NUNCA FAZER)
- NUNCA inventar telefone, WhatsApp, endereço, e-mail, horário, avaliações, CNPJ, funcionários, prêmios, números ou resultados.
- NUNCA alterar dados reais (nome, contatos, endereço, serviços factuais) sem solicitação explícita; e mesmo com solicitação, use somente valores fornecidos.
- NUNCA criar depoimentos com conteúdo fictício (mantenha items [] se não houver depoimento real).
- Nunca invente URLs de imagem/vídeo. Retorne APENAS o JSON da spec (sem markdown/HTML).

# ESTRUTURA DA SPEC (preserve o formato; chaves extras da entrada devem permanecer)
{
  "business": { "name": string, "segment": string|null, "city": string|null, "state": string|null, "tagline": string|null, "about": string|null },
  "design_system": {
    "colors": { "primary","on_primary","secondary","accent","background","surface","on_surface","muted","border": "#hex" },
    "typography": { "heading_font","body_font": string, "heading_scale":"normal|large|display", "heading_weight":"regular|semibold|bold", "body_size":"normal|large" },
    "visual_style": string, "layout_mood": "minimal|editorial|bold|organic|premium|playful",
    "layout_archetype": "editorial|corporate|minimal|luxury|bold|service_focused|local_business",
    "hero_variant": "split|centered|editorial|statement|service_first",
    "card_style": "flat|bordered|elevated|editorial", "button_style":"solid|outline|soft",
    "navigation_style": "minimal|centered|boxed", "cta_treatment":"primary_section|band|inline",
    "footer_style": "simple|editorial|centered", "section_spacing":"compact|comfortable|generous",
    "visual_density":"airy|balanced|dense", "decorative_intensity":"none|low|medium",
    "container_width":"narrow|standard|wide", "radius_scale":"none|small|medium|large"
  },
  "pages": { "home": true, "services": boolean, "contact": boolean },
  "navigation": [ { "label": string, "anchor": string } ],
  "sections": [ { "id": string, "type": "${ALLOWED_SECTIONS.join("|")}", "order": number } ],
  "content": {
    "hero": { "title": string, "subtitle": string, "primary_cta": string|null, "primary_cta_type": "whatsapp|tel|scroll|link", "primary_cta_value": string|null, "secondary_cta": string|null, "image": object|null, "image_note": string|null },
    "trust": { "title": string|null, "items": [ { "text": string } ] },
    "features": { "title": string, "items": [ { "title": string, "description": string, "icon": string|null } ] },
    "numbers": { "title": string|null, "items": [ { "value": string, "label": string } ] },
    "process": { "title": string, "steps": [ { "title": string, "description": string } ] },
    "faq": { "title": string, "items": [ { "question": string, "answer": string } ] },
    "gallery": { "title": string, "layout": "grid|editorial", "items": [ { "image": { "url": string, "alt": string, "source": string, "isIllustrative": true } } ] },
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

# COMPORTAMENTO — CONVERSE E RACIOCINE ANTES DE AGIR
Você não é apenas um "aplicador de mudanças". Você é um diretor de criação que
CONVERSA com o cliente, RACIOCINA sobre o pedido e SÓ executa quando há um pedido
real e claro de modificação. Siga este fluxo de raciocínio a cada mensagem:

1. INTENÇÃO: classifique a mensagem do usuário em:
   - "chat"      → pequeno falar/combinar: "ok", "obrigado", "perfeito", "e aí?", "bom dia".
   - "question"  → pergunta ou pedido de opinião/avaliação: "o que acha?", "como ficou?", "preciso de mais alguma coisa?", "o que posso melhorar?".
   - "clarify"   → pedido vago que não dá para executar sem mais informação: "deixa bonito", "melhora aí", "quero algo diferente", "deixa profissional". NÃO adivinhe: faça 1 pergunta objetiva.
   - "edit"      → pedido concreto de modificação ("troca a cor do botão para azul", "adiciona seção de FAQ", "muda o título do hero para X").
2. SÓ aplique mudanças em "spec" quando a intenção for "edit".
3. Para "chat"/"question"/"clarify", devolva a spec EXATAMENTE IDÊNTICA à entrada e responda em "reply". Se for "clarify", termine o reply com UMA pergunta objetiva (ex.: "Quer que eu deixe mais escuro e sóbrio ou mais claro e acolhedor?").
4. Seja um bom consultor: comente o que já está bom, explique trade-offs com naturalidade e nunca trate conversa casual como ordem de alteração.
5. Prefira respostas curtas (1–3 frases) e em pt-BR, no tom de um especialista em sites que também entende o negócio do cliente.

# CONVERSA CONTÍNUA (memória do projeto)
- Esta conversa é contínua sobre ESTE projeto. O bloco "TRANSCRIPT DA CONVERSA" traz
  trocas anteriores (Usuário/Assistente). Use-o para entender referências como
  "agora", "essa seção", "a cor anterior", "aquela imagem", "a hero que gostei",
  "a mesma coisa no CTA", "deixa como estava antes".
- "MEMÓRIA DE DECISÕES" resume preferências já expressas (aprovado/rejeitado/
  direção visual). PRESERVE decisões aprovadas: se o usuário aprovou a hero e
  depois pede outra mudança, altere apenas o que foi pedido e mantenha a hero.
- EDIÇÃO INCREMENTAL: aplique a MENOR mudança coerente com o pedido. Não reconstrua
  o site inteiro a cada mensagem. Preserve conteúdo, imagens aprovadas, cores e
  decisões anteriores salvas na spec atual. Se o pedido for amplo ("deixa tudo mais
  premium"), aí sim pode reavaliar a composição completa.
- NUNCA invente fatos (endereço, telefone, avaliações, números, certificações,
  preços, serviços, depoimentos). Pode sugerir no reply o que precisaria ser real.

# FORMATO DA RESPOSTA (OBRIGATÓRIO)
Responda APENAS com JSON exatamente neste formato:
{ "mode": "edit|question|clarify|chat",
  "analysis": "raciocínio curto interno (1-2 frases): o que o usuário pediu e o que você decidiu. NÃO aparece para o cliente.",
  "reply": "mensagem curta em pt-BR (máx. 3 frases) para o usuário, como um assistente de projetos: explique o que decidiu/mudou, ou converse/oriente se nada mudar.",
  "spec": { ...a SPEC COMPLETA (atualizada se mode=edit; IDÊNTICA à entrada caso contrário)... } }
- Se mode != "edit", "spec" DEVE ser byte-a-byte idêntica à entrada (deep copy).
- Nunca omita chaves; preserve o restante da spec intacto.`;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (Array.isArray(over)) return over;
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

function contactMentioned(instruction: string): boolean {
  return /telefone|whatsapp|zap|numero|número|contato|phone|ligar|email|e-mail|endereco|endereço|instagr|link\s+do\s+whatsapp/i.test(instruction);
}

// Proteções finais contra invenção: restaura campos factuais quando não solicitados.
function protectFactual(original: Record<string, unknown>, merged: Record<string, unknown>, instruction: string): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(merged)) as Record<string, unknown>;
  const origBusiness = isObj(original.business) ? original.business : {};
  const origContact = isObj(isObj(original.content) ? (original.content as Record<string, unknown>).contact : undefined)
    ? ((original.content as Record<string, unknown>).contact as Record<string, unknown>)
    : {};
  const mergedContactObj = isObj(isObj(clone.content) ? (clone.content as Record<string, unknown>).contact : undefined)
    ? (clone.content as Record<string, unknown>).contact as Record<string, unknown>
    : {};

  const biz = isObj(clone.business) ? clone.business : {};
  if (typeof origBusiness.name === "string") biz.name = origBusiness.name;
  if (typeof origBusiness.city === "string") biz.city = origBusiness.city;
  if (typeof origBusiness.state === "string") biz.state = origBusiness.state;
  if (typeof origBusiness.segment === "string") biz.segment = origBusiness.segment;

  const allowContact = contactMentioned(instruction);
  if (!allowContact) {
    if (typeof origContact.phone === "string") mergedContactObj.phone = origContact.phone;
    else if (mergedContactObj.phone === undefined) mergedContactObj.phone = null;
    if (typeof origContact.whatsapp === "string") mergedContactObj.whatsapp = origContact.whatsapp;
    else if (mergedContactObj.whatsapp === undefined) mergedContactObj.whatsapp = null;

    const origCtas = Array.isArray(original.calls_to_action) ? original.calls_to_action : [];
    const nextCtAs = Array.isArray(clone.calls_to_action) ? clone.calls_to_action : [];
    clone.calls_to_action = nextCtAs.map((c, i) => {
      const next = isObj(c) ? { ...c } : {};
      const orig = isObj(origCtas[i]) ? origCtas[i] : {};
      if ((next.type === "whatsapp" || next.type === "tel") && typeof orig.value === "string" && orig.value) {
        next.value = orig.value;
      }
      return next;
    });
  }
  return clone;
}

function normalizeResult(spec: unknown): Record<string, unknown> | null {
  if (!isObj(spec)) return null;
  const root: Record<string, unknown> = {};
  root.business = isObj(spec.business) ? spec.business : {};
  root.design_system = isObj(spec.design_system) ? spec.design_system : {};
  root.pages = isObj(spec.pages) ? spec.pages : { home: true };
  root.sections = Array.isArray(spec.sections) ? spec.sections : [];
  root.navigation = Array.isArray(spec.navigation) ? spec.navigation : [];
  root.content = isObj(spec.content) ? spec.content : {};
  root.calls_to_action = Array.isArray(spec.calls_to_action) ? spec.calls_to_action : [];
  root.seo = isObj(spec.seo) ? spec.seo : {};
  return root;
}

async function callImages(query: string, count: number, orientation: string): Promise<SiteAsset[]> {
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

// Busca imagens novas do nicho para o usuário poder "trocar essa imagem".
async function fetchImagesForSegment(segment: string): Promise<{ hero: SiteAsset | null; extras: SiteAsset[] }> {
  const needs = getImageNeeds(segment || "");
  const [heroList, extraList] = await Promise.allSettled([
    callImages(needs.heroQuery, 4, needs.orientation),
    callImages(needs.secondaryQuery, 6, needs.orientation),
  ]);
  const hero = heroList.status === "fulfilled" ? (heroList.value[0] ?? null) : null;
  const extras = (extraList.status === "fulfilled" ? extraList.value : []).filter((a) => a.url !== hero?.url);
  return { hero, extras };
}

// Aplica imagens reais quando o usuário pede imagem e o modelo não decidiu trocar.
function attachImagesIfRequested(
  spec: Record<string, unknown>,
  images: { hero: SiteAsset | null; extras: SiteAsset[] },
  instruction: string,
): void {
  const mentionsImages = /imagem|imagens|foto|fotos|galeria|hero.*fundo/i.test(instruction);
  if (!mentionsImages) return;
  const content = isObj(spec.content) ? spec.content as Record<string, unknown> : (spec.content = {});
  const wantsHero = /hero|imagem principal|fundo|background|primeira imagem/i.test(instruction);
  const wantsGallery = /galeria|fotos|imagens/i.test(instruction);

  if (images.hero && wantsHero) {
    const heroBlock = isObj(content.hero) ? content.hero as Record<string, unknown> : (content.hero = {});
    heroBlock.image = { url: images.hero.url, alt: images.hero.alt || "Ambiente", source: "pexels", isIllustrative: true };
    heroBlock.image_note = "Imagem ilustrativa de referência — não é foto real do negócio.";
  }
  if (images.extras.length > 0 && wantsGallery && !content.gallery) {
    const editorial = /assimetrica|assimétrica|editorial/i.test(instruction);
    const gallery: Record<string, unknown> = {
      title: "Ambiente e inspiração",
      layout: editorial ? "editorial" : "grid",
      items: images.extras.slice(0, 5).map((a) => ({ image: { url: a.url, alt: a.alt || "Ambiente", source: "pexels", isIllustrative: true } })),
    };
    content.gallery = gallery;
    const sections = Array.isArray(spec.sections) ? spec.sections as Array<Record<string, unknown>> : (spec.sections = []);
    if (!sections.some((x) => x.type === "gallery")) {
      sections.push({ id: "gallery", type: "gallery", order: sections.length + 1 });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return new Response(JSON.stringify({ error: "instruction é obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isObj(body?.spec)) {
      return new Response(JSON.stringify({ error: "spec é obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const original = JSON.parse(JSON.stringify(body.spec)) as Record<string, unknown>;
    const context = isObj(body?.context) ? body.context : {};
    const ctxLines = [
      context.name && `Empresa: ${context.name}`,
      context.segment && `Segmento: ${context.segment}`,
      context.city && `Cidade: ${context.city}`,
      context.state && `Estado: ${context.state}`,
    ].filter(Boolean).join("\n");

    // Transcript da conversa (intercalado Usuário/Assistente, das últimas trocas)
    // + memória curta de decisões/preferências do projeto.
    const conversation = Array.isArray(body?.conversation)
      ? (body.conversation as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(-14).map((x) => x.slice(0, 1200))
      : [];
    const memory = Array.isArray(body?.memory)
      ? (body.memory as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(-6).map((x) => x.slice(0, 400))
      : [];
    const memoryBlock = memory.length > 0
      ? `\nMEMÓRIA DE DECISÕES DO PROJETO (preferências que o usuário já expressou; preserve ao editar):\n- ${memory.join("\n- ")}\n`
      : "";
    const conversationBlock = conversation.length > 0
      ? `\nTRANSCRIPT DA CONVERSA (referências como "agora", "essa seção", "antes", "aquela imagem" se aplicam a estas trocas):\n${conversation.join("\n")}\n`
      : "";

    // Se o pedido envolver imagens, busca assets reais do nicho (Pexels).
    const wantsImages = /imagem|imagens|foto|fotos|galeria|fundo/i.test(instruction);
    const images = wantsImages ? await fetchImagesForSegment(String(context.segment ?? "")) : { hero: null, extras: [] };
    const assetBlock = images.hero || images.extras.length
      ? `\nASSETS DE IMAGENS DISPONÍVEIS (imagens ilustrativas novas; use SOMENTE estas URLs se precisar trocar/criar imagens):\n${[
        images.hero ? `HERO: ${images.hero.url} (alt: ${images.hero.alt || "Ambiente"})` : "",
        ...images.extras.slice(0, 6).map((a) => `GALERIA: ${a.url} (alt: ${a.alt || "Ambiente"})`),
      ].filter(Boolean).join("\n")}\n`
      : "";

    const userPrompt = `CONTEXTO DO PROJETO:
${ctxLines || "(sem contexto adicional)"}
${conversationBlock}${memoryBlock}${assetBlock}
INSTRUÇÃO DO USUÁRIO:
"${instruction}"

SPEC ATUAL (JSON):
${JSON.stringify(original)}

Devolva a spec COMPLETA atualizada conforme a instrução.`;

    let raw = "";
    let usedModel = DEFAULT_DEEPSEEK_MODEL;
    try {
      const result = await generateText({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.8,
        json: true,
        maxOutputTokens: 8192,
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

    const parsedOuter = extractJson(raw);
    if (!parsedOuter || Object.keys(parsedOuter).length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA retornou JSON inválido ou vazio.", raw: raw.slice(0, 800) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const reply = typeof parsedOuter.reply === "string" ? parsedOuter.reply.slice(0, 1200) : "";
    const mode = ["edit", "question", "clarify", "chat"].includes(parsedOuter.mode as string) ? parsedOuter.mode as string : "edit";
    // Wrapper { reply, spec } — caso o modelo retorne a spec direto (compat), usa o próprio objeto.
    const specPayload = parsedOuter.spec && isObj(parsedOuter.spec) ? parsedOuter.spec : parsedOuter;

    // Mensagens de conversa/consulta NÃO alteram nada (mode != edit).
    if (mode !== "edit") {
      return new Response(
        JSON.stringify({ spec: original, model: usedModel, status: "ok", changed: false, reply, mode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const merged = deepMerge(original, specPayload) as Record<string, unknown>;
    const protectedSpec = protectFactual(original, merged, instruction);
    attachImagesIfRequested(protectedSpec, images, instruction);
    const spec = normalizeResult(protectedSpec);
    if (!spec) {
      return new Response(JSON.stringify({ error: "Spec inválida após edição." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changed = JSON.stringify(spec) !== JSON.stringify(original);
    return new Response(
      JSON.stringify({ spec, model: usedModel, status: "ok", changed, reply, mode }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
