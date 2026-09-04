import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { LeadSource, SiteProjectRow, SiteSpec } from "@/data/siteProjects";
import { pickLeadForSpec } from "@/data/siteProjects";

function rowToProject(row: unknown): SiteProjectRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
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
    briefing: r.briefing && typeof r.briefing === "object" ? (r.briefing as Record<string, unknown>) : {},
    design_system: r.design_system && typeof r.design_system === "object" ? (r.design_system as Record<string, unknown>) : null,
    site_structure: r.site_structure && typeof r.site_structure === "object" ? (r.site_structure as Record<string, unknown>) : null,
    content: r.content && typeof r.content === "object" ? (r.content as Record<string, unknown>) : null,
    calls_to_action: Array.isArray(r.calls_to_action) ? r.calls_to_action : null,
    seo: r.seo && typeof r.seo === "object" ? (r.seo as Record<string, unknown>) : null,
    assets: Array.isArray(r.assets) ? r.assets.filter((a): a is Record<string, unknown> => !!a && typeof a === "object") : [],
    generated_code: r.generated_code && typeof r.generated_code === "object" ? (r.generated_code as Record<string, unknown>) : {},
    settings: r.settings && typeof r.settings === "object" ? (r.settings as Record<string, unknown>) : {},
    spec: r.spec && typeof r.spec === "object" && Object.keys(r.spec as object).length > 0 ? (r.spec as SiteSpec) : null,
    ai_model: r.ai_model ? String(r.ai_model) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
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
  const { data: created, error } = await supabase
    .from("site_projects")
    .insert({
      user_id: userId,
      lead_id: String(lead.id),
      name,
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
  return { spec: data.spec, model: data.model ?? "gemini-2.5-flash" };
}

export async function saveGeneratedSite(
  projectId: string,
  spec: SiteSpec,
  model: string,
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
  };
  const { error } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
}

// Invoca a Edge Function edit-site com a spec atual e uma instrução livre.
export async function editSiteWithAI(
  spec: SiteSpec,
  instruction: string,
  context: { name?: string | null; segment?: string | null; city?: string | null; state?: string | null },
): Promise<{ spec: SiteSpec; model: string; changed: boolean }> {
  const { data, error } = await supabase.functions.invoke<{ spec: SiteSpec; model: string; changed?: boolean }>(
    "edit-site",
    { body: { spec, instruction, context } },
  );
  if (error) throw error;
  if (!data?.spec || typeof data.spec !== "object") {
    throw new Error("A IA não retornou uma especificação válida.");
  }
  return { spec: data.spec, model: data.model ?? "gemini-2.5-flash", changed: data.changed !== false };
}

export async function deleteSiteProject(id: string): Promise<void> {
  const { error } = await supabase.from("site_projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Persiste edições manuais mantendo os campos estruturados consistentes com a spec.
export async function updateProjectSpec(projectId: string, spec: SiteSpec): Promise<void> {
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
  };
  const { error } = await supabase.from("site_projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
}
