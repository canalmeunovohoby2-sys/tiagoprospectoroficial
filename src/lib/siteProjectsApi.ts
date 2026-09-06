import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { LeadSource, SiteProjectRow, SiteSpec } from "@/data/siteProjects";
import { pickLeadForSpec } from "@/data/siteProjects";

function rowToProject(row: unknown): SiteProjectRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const specRaw = r.spec && typeof r.spec === "object" && Object.keys(r.spec as object).length > 0 ? (r.spec as SiteSpec) : null;
  const pubRaw = r.published_spec && typeof r.published_spec === "object" && Object.keys(r.published_spec as object).length > 0 ? (r.published_spec as SiteSpec) : null;
  return {
    id: String(r.id ?? ""),
    user_id: String(r.user_id ?? ""),
    lead_id: r.lead_id ? String(r.lead_id) : null,
    name: String(r.name ?? "Novo site"),
    company_name: String(r.company_name ?? ""),
    segment: r.segment ? String(r.segment) : null,
    city: r.city ? String(r.city) : null,
    state: r.state ? String(r.state) : null,
    status: (r.status as SiteProjectRow["status"]) ?? "draft",
    slug: r.slug ? String(r.slug) : null,
    published_status: (r.published_status as SiteProjectRow["published_status"]) ?? "unpublished",
    published_spec: pubRaw,
    published_at: r.published_at ? String(r.published_at) : null,
    briefing: r.briefing && typeof r.briefing === "object" ? (r.briefing as Record<string, unknown>) : {},
    design_system: r.design_system && typeof r.design_system === "object" ? (r.design_system as Record<string, unknown>) : null,
    site_structure: r.site_structure && typeof r.site_structure === "object" ? (r.site_structure as Record<string, unknown>) : null,
    content: r.content && typeof r.content === "object" ? (r.content as Record<string, unknown>) : null,
    calls_to_action: Array.isArray(r.calls_to_action) ? r.calls_to_action : null,
    seo: r.seo && typeof r.seo === "object" ? (r.seo as Record<string, unknown>) : null,
    assets: Array.isArray(r.assets) ? r.assets.filter((a): a is Record<string, unknown> => !!a && typeof a === "object") : [],
    generated_code: r.generated_code && typeof r.generated_code === "object" ? (r.generated_code as Record<string, unknown>) : {},
    settings: r.settings && typeof r.settings === "object" ? (r.settings as Record<string, unknown>) : {},
    spec: specRaw,
    ai_model: r.ai_model ? String(r.ai_model) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugifyName(base) || "site";
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const { data } = await supabase.from("site_projects").select("id").eq("slug", candidate).limit(1).maybeSingle();
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function listSiteProjects(userId: string): Promise<SiteProjectRow[]> {
  const { data, error } = await supabase
    .from("site_projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return Array.isArray(data)
    ? data.map(rowToProject).filter((p): p is SiteProjectRow => p !== null)
    : [];
}

export async function fetchSiteProject(id: string): Promise<SiteProjectRow | null> {
  const { data, error } = await supabase
    .from("site_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return rowToProject(data);
}

// Cria um projeto de site para o lead (se já existir, apenas retorna o id).
export async function openOrCreateSiteProject(userId: string, lead: LeadSource): Promise<string> {
  if (!lead.id) throw new Error("Lead inválido");
  const { data: existing, error: existingError } = await supabase
    .from("site_projects")
    .select("id")
    .eq("lead_id", String(lead.id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return String(existing.id);

  const rawName = lead.name ?? lead.company_name ?? "Novo site";
  const name = String(rawName).trim() || "Novo site";
  const briefingMap = pickLeadForSpec(lead);
  const briefing = briefingMap as unknown as Json;
  const slug = await uniqueSlug(name);
  const { data: created, error } = await supabase
    .from("site_projects")
    .insert({
      user_id: userId,
      lead_id: String(lead.id),
      name,
      slug,
      company_name: String(briefingMap.name ?? name),
      segment: briefingMap.segment ? String(briefingMap.segment) : null,
      city: briefingMap.city ? String(briefingMap.city) : null,
      state: briefingMap.state ? String(briefingMap.state) : null,
      status: "draft",
      briefing,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return String(created.id);
}

// Invoca a Edge Function generate-site e devolve a especificação normalizada.
export async function generateSiteSpec(lead: LeadSource): Promise<{ spec: SiteSpec; model: string }> {
  const { data, error } = await supabase.functions.invoke<{ spec: SiteSpec; model: string }>(
    "generate-site",
    { body: { lead: pickLeadForSpec(lead) } },
  );
  if (error) throw error;
  if (!data?.spec || typeof data.spec !== "object") {
    throw new Error("A IA não retornou uma especificação válida.");
  }
  return { spec: data.spec, model: data.model ?? "deepseek-chat" };
}

export async function saveGeneratedSite(
  projectId: string,
  spec: SiteSpec,
  model: string,
  generatedFiles?: Record<string, string>,
): Promise<void> {
  const payload = {
    spec: spec as unknown as Json,
    design_system: (spec.design_system ?? {}) as unknown as Json,
    site_structure: {
      pages: spec.pages ?? {},
      sections: spec.sections ?? [],
      navigation: spec.navigation ?? [],
    } as unknown as Json,
    content: (spec.content ?? {}) as unknown as Json,
    calls_to_action: (spec.calls_to_action ?? []) as unknown as Json,
    seo: (spec.seo ?? {}) as unknown as Json,
    ai_model: model,
    status: "generated",
    // Workspace do agente: arquivos reais do projeto (Vite), materializados a
    // partir da spec. O ZIP/baixar projeto pode usar direto daqui.
    ...(generatedFiles ? { generated_code: generatedFiles as unknown as Json } : {}),
  };
  const { error } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
}

// Invoca a Edge Function edit-site com a spec atual e uma instrução livre.
export type AiEditMode = "edit" | "question" | "clarify" | "chat";
export async function editSiteWithAI(
  spec: SiteSpec,
  instruction: string,
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null },
  conversation?: string[],
  memory?: string[],
): Promise<{ spec: SiteSpec; model: string; changed: boolean; reply?: string; mode?: AiEditMode }> {
  const { data, error } = await supabase.functions.invoke<{ spec: SiteSpec; model: string; changed?: boolean; reply?: string; mode?: AiEditMode }>(
    "edit-site",
    { body: { spec, instruction, context, conversation: conversation ?? [], memory: memory ?? [] } },
  );
  if (error) throw error;
  if (!data?.spec || typeof data.spec !== "object") {
    throw new Error("A IA não retornou uma especificação válida.");
  }
  return { spec: data.spec, model: data.model ?? "deepseek-chat", changed: data.changed !== false, reply: data.reply, mode: data.mode };
}

export interface ResearchTraceItem {
  query: string;
  ok: boolean;
  resultsCount: number;
  source: string;
}

export interface AgentExecuteResult {
  status: "ok" | "error";
  reply?: string;
  errors?: string[];
  logs?: string[];
  changed?: boolean;
  touched?: string[];
  files?: Record<string, string>;
  spec?: Record<string, unknown> | null;
  model?: string;
  runtime?: "cline" | "edge-fallback";
  resumed_session?: boolean;
  activity?: Array<{ phase: string; detail: string }>;
  /** Prova de execução real da pesquisa web (sem secrets). */
  researchTrace?: ResearchTraceItem[];
}

// Code-first: invoca o agent-execute que opera sobre os ARQUIVOS reais do projeto.
// O fallback (edge) opera sobre o MAPA de arquivos (texto) — anexos são
// convertidos em arquivos reais no workspace (assets/<nome> com o data URL),
// para que o agente os leia/usar mesmo sem o runtime Node.
function slugName(label: string, idx: number, mime: string): string {
  const clean = (label || `anexo-${idx + 1}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : mime.includes("svg") ? "svg" : mime.includes("pdf") ? "pdf" : mime.includes("json") ? "json" : "txt";
  return `assets/${(clean.split(".")[0] || `anexo-${idx + 1}`).slice(0, 40)}-${idx + 1}.${ext}`;
}

export async function invokeAgentExecute(input: {
  instruction: string;
  files: Record<string, string>;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  memory?: string[];
  attachments?: ChatAttachmentInput[];
  /** Conversa recente (contexto de continuidade) — usada no prompt do agente. */
  conversation?: string[];
}): Promise<AgentExecuteResult> {
  // Anexos → arquivos reais no workspace (mapa), para o agente ler/usar.
  const files = { ...(input.files ?? {}) };
  let attachHint = "";
  const attachments = input.attachments ?? [];
  if (attachments.length) {
    const materialized: string[] = [];
    const rejected: string[] = [];
    attachments.forEach((att, i) => {
      const dataUrl = typeof att?.dataUrl === "string" ? att.dataUrl : "";
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
      const mime = (att?.mediaType || (m ? m[1] : "")) || "application/octet-stream";
      if (!m || !/^image\/(png|jpe?g|webp|gif|svg)|^text\/(plain|markdown)|^application\/(json|pdf)/i.test(mime)) {
        rejected.push(att?.name || `anexo ${i + 1}`);
        return;
      }
      const approx = Math.round((m[3].length * 3) / 4);
      if (approx === 0 || approx > 2_200_000) { rejected.push(att?.name || `anexo ${i + 1}`); return; }
      const path = slugName(att?.name ?? "", i, mime);
      files[path] = dataUrl;
      materialized.push(`${path} (${mime})`);
    });
    attachHint = materialized.length
      ? `\nANEXOS (arquivos reais no workspace — leia com read_file e use):\n${materialized.map((m) => `- ${m}`).join("\n")}\nPara usar uma imagem do usuário no site: referencie o arquivo real (<img src="assets/<nome>"> ou background url) — o preview do produto embute automaticamente; NÃO embuta o data URL gigante inline.\nReutilizar a MESMA foto do usuário em vários pontos é ESPERADO quando o usuário pedir.`
      : "";
    if (rejected.length) attachHint += `\nAnexos rejeitados (tipo/tamanho): ${rejected.join(", ")}`;
  }
  const instruction = `${input.instruction}${attachHint}`;

  const { data, error } = await supabase.functions.invoke<AgentExecuteResult>("agent-execute", {
    body: {
      instruction,
      files,
      context: input.context,
      memory: input.memory ?? [],
      conversation: (input.conversation ?? []).slice(-8),
      runtime: "static",
    },
  });
  if (error) throw new Error(friendlyAiError(error));
  const result = data ?? { status: "error", errors: ["Resposta vazia do agente de código."] };
  return result.files ? result : { ...result, files };
}

// Invoca o ProspectorSiteAgent (Cline SDK). Prefere o runtime Node local
// (VITE_AGENT_RUNTIME_URL); se não estiver disponível, faz fallback para a
// edge function agent-execute (mesmo contrato, infraestrutura atual).
export interface ChatAttachmentInput {
  name?: string;
  mediaType?: string;
  dataUrl?: string;
  label?: string;
}

// Captura screenshots REAIS do site (desktop + mobile) no Agent Runtime para o
// PDF de proposta. Sem runtime configurado ou em falha → {} (o PDF usa o hero).
export async function captureWorkspaceScreenshots(files: Record<string, string>): Promise<{ desktop?: string; mobile?: string }> {
  const runtimeUrl = import.meta.env.VITE_AGENT_RUNTIME_URL as string | undefined;
  if (!runtimeUrl || !files || !Object.keys(files).some((k) => k.endsWith("index.html"))) return {};
  try {
    const res = await fetch(`${runtimeUrl.replace(/\/$/, "")}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { ok?: boolean; desktop?: string; mobile?: string; error?: string };
    if (!data.ok || typeof data.desktop !== "string") return {};
    return { desktop: data.desktop, mobile: typeof data.mobile === "string" ? data.mobile : undefined };
  } catch {
    return {};
  }
}

export async function invokeProspectorAgent(input: {
  instruction: string;
  files: Record<string, string>;
  projectId?: string;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  memory?: string[];
  attachments?: ChatAttachmentInput[];
  conversation?: string[];
}, onLiveActivity?: (phase: string, detail: string) => void): Promise<AgentExecuteResult> {
  const runtimeUrl = import.meta.env.VITE_AGENT_RUNTIME_URL as string | undefined;
  if (runtimeUrl) {
    try {
      const res = await fetch(`${runtimeUrl.replace(/\/$/, "")}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: input.instruction,
          files: input.files,
          projectId: input.projectId,
          context: input.context,
          memory: input.memory ?? [],
          attachments: input.attachments ?? [],
          conversation: (input.conversation ?? []).slice(-8),
          stream: onLiveActivity ? true : false,
        }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        return { status: "error", errors: [`Runtime do agente indisponível (HTTP ${res.status}).`] };
      }
      // NDJSON ao vivo: cada linha de atividade é repassada para a UI (5.34).
      if (onLiveActivity && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let final: AgentExecuteResult | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const raw = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!raw.trim()) continue;
            try {
              const line = JSON.parse(raw) as Record<string, unknown>;
              if (line.type === "activity") onLiveActivity(String(line.phase ?? ""), String(line.detail ?? ""));
              else if (line.type === "result") final = line as unknown as AgentExecuteResult;
            } catch { /* linha inválida ignora */ }
          }
        }
        if (final) return final;
        return { status: "error", errors: ["Stream do agente terminou sem resultado."] };
      }
      const data = (await res.json()) as AgentExecuteResult & { error?: string };
      if (data.error) return { status: "error", errors: [data.error] };
      return data;
    } catch {
      // conexão recusada → fallback para a edge function
    }
  }
  return invokeAgentExecute(input);
}

// Monta a missão de geração premium (identidade/skills + contexto real do negócio).
function buildGenerationMission(ctx: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null; about?: string | null; services?: string[] }, briefing?: Record<string, unknown>): string {
  const ctxLines = [
    ctx.name && `Empresa: ${ctx.name}`,
    ctx.segment && `Segmento: ${ctx.segment}`,
    ctx.city && `Cidade: ${ctx.city}`,
    ctx.state && `Estado: ${ctx.state}`,
    ctx.address && `Endereço: ${ctx.address}`,
    ctx.phone && `Telefone: ${ctx.phone}`,
    ctx.whatsapp && `WhatsApp: ${ctx.whatsapp}`,
    ctx.about && `Sobre: ${ctx.about}`,
    Array.isArray(ctx.services) && ctx.services.length ? `Serviços: ${ctx.services.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const extra = briefing && Object.keys(briefing).length ? `\nBriefing adicional (use o que for real; não invente):\n${JSON.stringify(briefing).slice(0, 1800)}` : "";
  return `CRIE UM SITE COMPLETO E PREMIUM para este negócio, direto no workspace (site estático autocontido: index.html completo, CSS em <style> inline ou src/site.css, dados em src/site.json). Você é um Senior UI/UX Director + Art Director + Frontend Engineer especialista em landing pages de alta conversão.

CONTEXTO REAL DO NEGÓCIO:
${ctxLines || "(poucos dados — não invente o resto)"}
${extra}

REGRA DE DIRECÃO (aplique a SKILL de Design Contextual Adaptativo):
- Você é o cérebro criativo: defina a identidade sob medida (paleta, tipografia, layout, composição, imagens, interações) para ESTE negócio — cada site deve ser distinto, nunca o mesmo template de outro projeto.
- Use o bloco PESQUISA WEB DE REFERÊNCIA (se presente) para tendências e referências do nicho — inspire-se sem copiar.
- Google Maps (embed, só com endereço real), Google Fonts, ícones e recursos externos são permitidos quando fizerem sentido.
- Psicologia das cores do segmento, tipografia Google Fonts expressiva, imagens reais contextualizadas (Unsplash, 3+ DISTINTAS, coerentes com o negócio — NUNCA repita a mesma imagem e NUNCA use imagem de outro segmento).
- Aplique a SKILL de Efeitos/Motion: glassmorphism no header/cards quando couber, glow/bordas sutis, botões com hover, cards com elevação, microinterações e transições — sem exagerar.
- Use arquitetura de conversão com ritmo: header/nav, hero de alto impacto (headline + CTA principal + secundário), seções variadas (valor/diferenciais, serviços/ambientes, como funciona, prova apenas com dados reais, CTA final), footer profissional completo.
- Responsividade total (mobile/tablet/desktop) sem overflow.

REGRAS:
- NÃO invente endereço/telefone/WhatsApp/horários/preços/avaliações/certificações/resultados/serviços não fornecidos.
- NÃO deixe placeholders ("lorem", "adicione aqui") — código 100% integral do <!DOCTYPE html> ao </html>.
- Faça o site COMPLETO (não curto): hero forte + pelo menos 4-5 seções com função + footer rico.`;
}

// Geração inicial: prefere o Cline Agent Runtime (Node); sem ele, usa o agente
// de código (edge agent-execute) com a mesma missão premium — nunca o gerador
// legado curto.
export async function invokeProspectorGenerate(input: {
  projectId: string;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null; about?: string | null; services?: string[] };
  briefing?: Record<string, unknown>;
}): Promise<AgentExecuteResult> {
  const runtimeUrl = import.meta.env.VITE_AGENT_RUNTIME_URL as string | undefined;
  if (runtimeUrl) {
    try {
      const res = await fetch(`${runtimeUrl.replace(/\/$/, "")}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: input.projectId, context: input.context, briefing: input.briefing ?? {} }),
        signal: AbortSignal.timeout(300_000),
      });
      if (res.ok) {
        const data = (await res.json()) as AgentExecuteResult & { error?: string };
        if (data.error) return { status: "error", runtime: "cline", errors: [data.error] };
        return data;
      }
    } catch {
      // runtime indisponível → tenta o agente de código edge
    }
  }
  // Sem runtime Node: usa o AGENTE DE CÓDIGO (edge) para criar o site do zero
  // com a missão premium — qualidade muito superior ao gerador legado.
  const instruction = buildGenerationMission(input.context, input.briefing);
  return invokeAgentExecute({
    instruction,
    files: {},
    context: input.context,
    memory: [],
    attachments: [],
  });
}

export interface PersistedChatMsg {
  id: string;  role: "user" | "assistant";
  text: string;
  attachment: { label?: string; type?: string } | null;
  created_at: string;
}

export async function loadSiteChatMessages(projectId: string): Promise<PersistedChatMsg[]> {
  const { data, error } = await supabase
    .from("site_chat_messages")
    .select("id,role,text,attachment,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    role: r.role as "user" | "assistant",
    text: String(r.text ?? ""),
    attachment: r.attachment && typeof r.attachment === "object" ? (r.attachment as { label?: string; type?: string }) : null,
    created_at: String(r.created_at ?? ""),
  }));
}

export async function appendSiteChatMessages(projectId: string, userId: string, messages: Array<{ role: "user" | "assistant"; text: string; label?: string; type?: string }>): Promise<void> {
  if (messages.length === 0) return;
  const rows = messages.map((m) => ({
    project_id: projectId,
    user_id: userId,
    role: m.role,
    text: m.text.slice(0, 4000),
    attachment: m.label ? { label: m.label.slice(0, 200), type: m.type ?? "file" } : null,
  }));
  const { error } = await supabase.from("site_chat_messages").insert(rows);
  if (error) throw new Error(error.message);
}

// Publicação atômica: copia o draft (spec + código real) para published_*.
// A URL pública renderiza o published_code quando existir (code-first).
export async function publishSiteProject(projectId: string, spec: SiteSpec, generatedFiles?: Record<string, string>): Promise<void> {
  const payload = {
    published_status: "published" as const,
    published_spec: spec as unknown as Json,
    // Snapshot imutável do código real no momento da publicação (code-first).
    published_code: (generatedFiles && Object.keys(generatedFiles).length ? generatedFiles : null) as unknown as Json | null,
    published_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function unpublishSiteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("site_projects").update({ published_status: "unpublished" as const }).eq("id", projectId);
  if (error) throw new Error(error.message);
}

export interface PublicSiteData {
  slug: string;
  name: string;
  published_spec: SiteSpec;
  published_code?: Record<string, string> | null;
  published_at: string | null;
}

// Acesso público via RPC (somente publicado; nada privado é exposto).
export async function fetchPublicSite(slug: string): Promise<PublicSiteData | null> {
  const { data, error } = await supabase.rpc("get_public_site", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0 || !data[0]?.published_spec) return null;
  const row = data[0];
  const code = row.published_code;
  return {
    slug: String(row.slug ?? slug),
    name: String(row.name ?? ""),
    published_spec: row.published_spec as SiteSpec,
    published_code: code && typeof code === "object" && !Array.isArray(code)
      ? (Object.fromEntries(Object.entries(code as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : null,
    published_at: row.published_at ? String(row.published_at) : null,
  };
}

export interface SiteVersion {
  id: string;
  version_number: number;
  spec: SiteSpec;
  files?: Record<string, string> | null;
  change_summary: string | null;
  created_at: string;
}

function versionRowToVersion(row: Record<string, unknown>): SiteVersion {
  const rawFiles = row.files;
  return {
    id: String(row.id ?? ""),
    version_number: Number(row.version_number ?? 0),
    spec: (row.spec && typeof row.spec === "object" ? row.spec : {}) as SiteSpec,
    files: rawFiles && typeof rawFiles === "object" && !Array.isArray(rawFiles)
      ? (Object.fromEntries(Object.entries(rawFiles as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : null,
    change_summary: row.change_summary ? String(row.change_summary) : null,
    created_at: String(row.created_at ?? ""),
  };
}

// Resumo simples de alteração baseado em comparação estrutural (sem IA).
export function diffSummary(before: SiteSpec | null, after: SiteSpec): string {
  if (!before) return "Versão inicial";
  const areas: Array<[keyof SiteSpec, string]> = [
    ["content", "Conteúdo"],
    ["design_system", "Identidade visual"],
    ["sections", "Seções"],
    ["calls_to_action", "CTAs"],
    ["navigation", "Navegação"],
    ["seo", "SEO"],
    ["pages", "Estrutura"],
  ];
  const changed = areas.filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(([, label]) => label);
  return changed.length > 0 ? `${changed.slice(0, 3).join(", ")} alterado(s)` : "Alterações no projeto";
}

export async function listSiteVersions(projectId: string): Promise<SiteVersion[]> {
  const { data, error } = await supabase
    .from("site_project_versions")
    .select("id,version_number,spec,files,change_summary,created_at")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => versionRowToVersion(r as unknown as Record<string, unknown>));
}

// AUTOSAVE (5.24): comparação pura de "houve mudança real?" para não criar
// versões duplicadas. Mudança é detectada pelo workspace (files) quando existir.
export function versionChanged(
  lastVersion: { spec: SiteSpec; files?: Record<string, string> | null } | null,
  spec: SiteSpec,
  files?: Record<string, string> | null,
): boolean {
  const hasFiles = !!files && Object.keys(files).length > 0;
  // Estado atual code-first com files.
  if (hasFiles) {
    // Última versão sem files (só spec) → primeira versão com código = mudança real.
    if (!lastVersion?.files) return true;
    return JSON.stringify(lastVersion.files) !== JSON.stringify(files);
  }
  // Estado atual sem files (projeto legado spec-only).
  if (lastVersion?.files) return true; // perdeu o código? considera mudança
  const prevSpec = lastVersion?.spec ?? null;
  return !prevSpec || JSON.stringify(prevSpec) !== JSON.stringify(spec);
}

// Cria uma versão apenas quando há alteração REAL em relação à última versão.
// A mudança é comparada pelo workspace (files) quando existir — senão pela spec.
// Retorna true se criou; false se a alteração é idêntica à última (não duplica).
export async function createSiteVersion(
  projectId: string,
  userId: string,
  spec: SiteSpec,
  summary?: string,
  files?: Record<string, string>,
): Promise<boolean> {
  const { data: last, error: lastErr } = await supabase
    .from("site_project_versions")
    .select("version_number,spec,files")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw new Error(lastErr.message);

  const hasFiles = !!files && Object.keys(files).length > 0;
  const lastVersion = last ? {
    spec: (last.spec && typeof last.spec === "object" ? last.spec as SiteSpec : {} as SiteSpec),
    files: last.files && typeof last.files === "object" ? (last.files as Record<string, string>) : null,
  } : null;
  if (!versionChanged(lastVersion, spec, files)) return false; // sem mudança real → não duplica

  const nextNumber = last ? Number(last.version_number) + 1 : 1;
  let changeSummary = summary || diffSummary(lastVersion?.spec ?? null, spec);
  if (hasFiles && changeSummary === "Versão inicial") changeSummary = "Alteração no código do site";
  if (changeSummary === "Alterações no projeto") changeSummary = "Alteração no site";

  const { error } = await supabase.from("site_project_versions").insert({
    project_id: projectId,
    user_id: userId,
    version_number: nextNumber,
    spec: spec as unknown as Json,
    files: hasFiles ? (files as unknown as Json) : null,
    change_summary: changeSummary.slice(0, 240),
  });
  if (error) throw new Error(error.message);
  return true;
}

// Restaura uma versão: aplica spec + workspace (files) no projeto (draft) sem
// tocar na publicação. Devolve o estado restaurado para o front atualizar.
export async function restoreSiteVersion(projectId: string, versionId: string): Promise<SiteVersion> {
  const { data, error } = await supabase
    .from("site_project_versions")
    .select("id,version_number,spec,files,change_summary,created_at")
    .eq("project_id", projectId)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Versão não encontrada para este projeto.");
  const version = versionRowToVersion(data as unknown as Record<string, unknown>);

  // Aplica no projeto (draft): spec + generated_code; NÃO mexe em published_*.
  const payload: Record<string, unknown> = {
    spec: version.spec as unknown as Json,
    design_system: (version.spec.design_system ?? {}) as unknown as Json,
    site_structure: {
      pages: version.spec.pages ?? {},
      sections: version.spec.sections ?? [],
      navigation: version.spec.navigation ?? [],
    } as unknown as Json,
    content: (version.spec.content ?? {}) as unknown as Json,
    calls_to_action: (version.spec.calls_to_action ?? []) as unknown as Json,
    seo: (version.spec.seo ?? {}) as unknown as Json,
    ...(version.files && Object.keys(version.files).length ? { generated_code: version.files as unknown as Json } : {}),
  };
  const { error: upErr } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (upErr) throw new Error(upErr.message);
  return version;
}

export async function deleteSiteProject(id: string): Promise<void> {
  const { error } = await supabase.from("site_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Persiste edições manuais mantendo os campos estruturados consistentes com a spec.
export async function updateProjectSpec(
  projectId: string,
  spec: SiteSpec,
  generatedFiles?: Record<string, string>,
): Promise<void> {
  const payload = {
    spec: spec as unknown as Json,
    design_system: (spec.design_system ?? {}) as unknown as Json,
    site_structure: {
      pages: spec.pages ?? {},
      sections: spec.sections ?? [],
      navigation: spec.navigation ?? [],
    } as unknown as Json,
    content: (spec.content ?? {}) as unknown as Json,
    calls_to_action: (spec.calls_to_action ?? []) as unknown as Json,
    seo: (spec.seo ?? {}) as unknown as Json,
    ...(generatedFiles ? { generated_code: generatedFiles as unknown as Json } : {}),
  };
  const { error } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
}
