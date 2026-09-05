import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, extractJson, DEFAULT_GEMINI_MODEL } from "../_shared/ai.ts";

const ALLOWED_SECTIONS = ["hero", "about", "services", "testimonials", "cta", "contact"];

const SYSTEM_PROMPT = `Você é o editor inteligente de sites do TiagoProspector. Você recebe uma ESPECIFICAÇÃO ESTRUTURADA atual de um site (JSON) e uma instrução de edição do usuário. Sua função é devolver a ESPECIFICAÇÃO COMPLETA atualizada, em JSON válido, alterando SOMENTE o necessário para atender à instrução.

# REGRAS DE SAÍDA
- Responda APENAS JSON (sem markdown, sem texto, sem HTML).
- Devolva a spec COMPLETA: todas as chaves de nível superior que existirem na entrada (business, design_system, pages, sections, navigation, content, calls_to_action, seo) e todo conteúdo que NÃO foi pedido para mudar deve permanecer IGUAL ao original (mesmos textos, mesmas cores não relacionadas, mesma ordem).
- Não remova conteúdo não relacionado ao pedido.
- Se a instrução for ambígua ou vaga, faça apenas melhorias visuais/textuais seguras e genéricas.

# CONTROLE DE ESCOPO
- Instrução de estilo/visual (ex.: "mais sofisticado", "moderno", "minimalista", "elegante", "mudar cor") pode alterar: design_system (cores, tipografia, visual_style, layout_mood) e, se relevante, textos publicitários do hero/sobre. NUNCA altere contatos, dados factuais, serviços factuais ou estrutura de negócio.
- Instrução de conteúdo (ex.: "melhore o título do hero") altera apenas o conteúdo citado.
- Instrução de seções só pode ADICIONAR/REMOVER/REORDENAR seções com um destes tipos EXATOS: ${ALLOWED_SECTIONS.join(", ")} (ids: hero, about, services, testimonials, cta, contact). A lista "sections" usa o formato [{ id, type, order }]. Não crie tipos fora desta lista.
- Se a instrução pedir seção não suportada, NÃO a crie; apenas melhore o que for seguro.

# PROIBIÇÕES (NUNCA FAZER)
- NUNCA inventar telefone, WhatsApp, endereço, e-mail, horário, avaliações, CNPJ, funcionários ou prêmios.
- NUNCA inventar serviços/benefícios que dependam de fatos não fornecidos.
- NUNCA alterar telephone/WhatsApp/contatos reais a menos que o usuário tenha fornecido explicitamente o número na instrução.
- NUNCA criar depoimentos com nomes ou histórias fictícias.
- Se um valor não existir na entrada, mantenha null/vazio (não preencha com dados falsos).
- NUNCA retorne HTML, CSS, JS ou Markdown: somente o JSON da spec.

# ESTRUTURA DA SPEC (mantenha exatamente o formato da entrada)
{
  "business": { "name": string, "segment": string|null, "city": string|null, "state": string|null, "tagline": string|null, "about": string|null },
  "design_system": {
    "colors": { "primary","on_primary","secondary","accent","background","surface","on_surface","muted": "#hex" },
    "typography": { "heading_font": string, "body_font": string },
    "visual_style": string,
    "layout_mood": "minimal|editorial|bold|organic|premium|playful"
  },
  "pages": { "home": true, "services": boolean, "contact": boolean },
  "navigation": [ { "label": string, "anchor": string } ],
  "sections": [ { "id": string, "type": "hero|about|services|testimonials|cta|contact", "order": number } ],
  "content": {
    "hero": { "title": string, "subtitle": string, "primary_cta": string|null, "primary_cta_type": "whatsapp|tel|scroll|link", "primary_cta_value": string|null, "secondary_cta": string|null, "image": null },
    "about": { "title": string, "body": string },
    "services": { "title": string, "subtitle": string|null, "items": [ { "title": string, "description": string } ] },
    "testimonials": { "title": string, "items": [ { "quote": string, "author": string|null, "role": string|null } ] },
    "cta": { "title": string, "body": string, "button_label": string|null },
    "contact": { "title": string, "body": string|null, "phone": string|null, "whatsapp": string|null },
    "footer": { "tagline": string }
  },
  "calls_to_action": [ { "label": string, "type": "whatsapp|tel|scroll|link", "value": string } ],
  "seo": { "title": string, "description": string, "keywords": string[] }
}`;

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

    // Histórico recente da conversa (opcional) — ajuda a entender referências
    // como "agora", "essa seção", "a cor anterior". NUNCA inclui dados factuais.
    const conversation = Array.isArray(body?.conversation)
      ? (body.conversation as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(-6).map((x) => x.slice(0, 1200))
      : [];
    const conversationBlock = conversation.length > 0
      ? `\nÚLTIMAS INSTRUÇÕES DA CONVERSA (referências como "agora", "essa seção", "antes" se aplicam a elas):\n- ${conversation.join("\n- ")}\n`
      : "";

    const userPrompt = `CONTEXTO DO PROJETO:
${ctxLines || "(sem contexto adicional)"}
${conversationBlock}
INSTRUÇÃO DO USUÁRIO:
"${instruction}"

SPEC ATUAL (JSON):
${JSON.stringify(original)}

Devolva a spec COMPLETA atualizada conforme a instrução.`;

    let raw = "";
    let usedModel = DEFAULT_GEMINI_MODEL;
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

    const parsed = extractJson(raw);
    if (!parsed || Object.keys(parsed).length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA retornou JSON inválido ou vazio.", raw: raw.slice(0, 800) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const merged = deepMerge(original, parsed) as Record<string, unknown>;
    const protectedSpec = protectFactual(original, merged, instruction);
    const spec = normalizeResult(protectedSpec);
    if (!spec) {
      return new Response(JSON.stringify({ error: "Spec inválida após edição." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const changed = JSON.stringify(spec) !== JSON.stringify(original);
    return new Response(JSON.stringify({ spec, model: usedModel, status: "ok", changed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
