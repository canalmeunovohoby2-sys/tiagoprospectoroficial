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
}

// Code-first: invoca o agent-execute que opera sobre os ARQUIVOS reais do projeto.
export async function invokeAgentExecute(input: {
  instruction: string;
  files: Record<string, string>;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  memory?: string[];
}): Promise<AgentExecuteResult> {
  const { data, error } = await supabase.functions.invoke<AgentExecuteResult>("agent-execute", {
    body: {
      instruction: input.instruction,
      files: input.files,
      context: input.context,
      memory: input.memory ?? [],
      runtime: "static",
    },
  });
  if (error) throw new Error(friendlyAiError(error));
  return data ?? { status: "error", errors: ["Resposta vazia do agente de código."] };
}

// Invoca o ProspectorSiteAgent (Cline SDK). Prefere o runtime Node local
// (VITE_AGENT_RUNTIME_URL); se não estiver disponível, faz fallback para a
// edge function agent-execute (mesmo contrato, infraestrutura atual).
export async function invokeProspectorAgent(input: {
  instruction: string;
  files: Record<string, string>;
  projectId?: string;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null };
  memory?: string[];
}): Promise<AgentExecuteResult> {
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
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        const data = (await res.json()) as AgentExecuteResult & { error?: string };
        if (data.error) return { status: "error", errors: [data.error] };
        return data;
      }
      // runtime respondeu com erro → reporta para o usuário entender
      return { status: "error", errors: [`Runtime do agente indisponível (HTTP ${res.status}).`] };
    } catch {
      // conexão recusada → fallback para a edge function
    }
  }
  return invokeAgentExecute(input);
}

// Geração inicial via Cline (FASE 5.19): o agente cria o site real no workspace.
// Prefere o runtime Node; se indisponível, retorna { status: "error", runtime: "edge-fallback" }
// para o caller decidir cair no gerador clássico (spec).
export async function invokeProspectorGenerate(input: {
  projectId: string;
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null; phone?: string | null; whatsapp?: string | null; address?: string | null; about?: string | null; services?: string[] };
  briefing?: Record<string, unknown>;
}): Promise<AgentExecuteResult> {
  const runtimeUrl = import.meta.env.VITE_AGENT_RUNTIME_URL as string | undefined;
  if (!runtimeUrl) return { status: "error", runtime: "edge-fallback", errors: ["runtime não configurado"] };
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
    return { status: "error", runtime: "edge-fallback", errors: [`runtime indisponível (HTTP ${res.status})`] };
  } catch {
    return { status: "error", runtime: "edge-fallback", errors: ["runtime indisponível"] };
  }
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

// Publicação atômica: copia o draft atual para published_spec e marca publicado.
export async function publishSiteProject(projectId: string, spec: SiteSpec): Promise<void> {
  const payload = {
    published_status: "published" as const,
    published_spec: spec as unknown as Json,
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
  published_at: string | null;
}

// Acesso público via RPC (somente publicado; nada privado é exposto).
export async function fetchPublicSite(slug: string): Promise<PublicSiteData | null> {
  const { data, error } = await supabase.rpc("get_public_site", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0 || !data[0]?.published_spec) return null;
  const row = data[0];
  return {
    slug: String(row.slug ?? slug),
    name: String(row.name ?? ""),
    published_spec: row.published_spec as SiteSpec,
    published_at: row.published_at ? String(row.published_at) : null,
  };
}

export interface SiteVersion {
  id: string;
  version_number: number;
  spec: SiteSpec;
  change_summary: string | null;
  created_at: string;
}

function versionRowToVersion(row: Record<string, unknown>): SiteVersion {
  return {
    id: String(row.id ?? ""),
    version_number: Number(row.version_number ?? 0),
    spec: (row.spec && typeof row.spec === "object" ? row.spec : {}) as SiteSpec,
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
    .select("id,version_number,spec,change_summary,created_at")
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => versionRowToVersion(r as unknown as Record<string, unknown>));
}

// Cria uma versão apenas quando há alteração real em relação à última versão.
export async function createSiteVersion(projectId: string, userId: string, spec: SiteSpec, summary?: string): Promise<boolean> {
  const { data: last, error: lastErr } = await supabase
    .from("site_project_versions")
    .select("version_number,spec")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw new Error(lastErr.message);

  const prev = last && last.spec && typeof last.spec === "object" ? (last.spec as SiteSpec) : null;
  if (prev && JSON.stringify(prev) === JSON.stringify(spec)) return false; // sem alteração real

  const nextNumber = last ? Number(last.version_number) + 1 : 1;
  const changeSummary = summary || diffSummary(prev, spec);
  const { error } = await supabase.from("site_project_versions").insert({
    project_id: projectId,
    user_id: userId,
    version_number: nextNumber,
    spec: spec as unknown as Json,
    change_summary: changeSummary.slice(0, 240),
  });
  if (error) throw new Error(error.message);
  return true;
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
