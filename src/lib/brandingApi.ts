// Branding API (6.2) — ponte real entre a UI do Branding Studio e o produto:
// cria projeto, carrega o estado persistido (brand-state.json + assets/brand/*.svg)
// a partir dos arquivos do projeto, e envia instruções ao MESMO /run (mesmo agente/
// cérebro, tool `branding`, conversationId e memória existentes).
import { supabase } from "@/integrations/supabase/client";
import { createSiteProjectFromPrompt, fetchSiteProject, invokeProspectorAgent, loadSiteChatMessages, appendSiteChatMessages, type AgentExecuteResult } from "@/lib/siteProjectsApi";
import type { BrandSnapshotLike } from "@/lib/brandingView";
import { extractBrandSnapshot, mergeBrandFiles, hasBrandState } from "@/lib/brandingPersist";

export interface BrandProjectData {
  projectId: string;
  projectName: string;
  files: Record<string, string>;
  snapshot: BrandSnapshotLike | null;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  conversationId: string | null;
}

export function brandFilesToSnapshot(files: Record<string, string>): BrandSnapshotLike | null {
  return extractBrandSnapshot(files);
}

export function brandConversationKey(userId: string, projectId: string): string {
  return `prospector-conv:${userId}:${projectId}`;
}

export function getBrandConversationId(userId: string, projectId: string): string {
  const key = brandConversationKey(userId, projectId);
  const saved = localStorage.getItem(key);
  const cid = saved ?? crypto.randomUUID();
  localStorage.setItem(key, cid);
  return cid;
}

export async function createBrandingProject(userId: string, briefing: string): Promise<string> {
  const id = await createSiteProjectFromPrompt(userId, briefing);
  // Dispara a GERAÇÃO INICIAL pelo MESMO agente/runtime (tool `branding`), da
  // mesma forma que o chat do Branding Studio. Sem isso, a tela abre com
  // "Nenhum conceito ainda" (projeto criado sem executar o agente).
  const conversationId = getBrandConversationId(userId, id);
  const projectName = briefing.split(/\r?\n/)[0].slice(0, 80).trim() || "Marca";
  const res = await sendBrandInstruction({ projectId: id, conversationId, instruction: briefing, files: {}, projectName, userId });
  if (!res.ok || !res.persisted) {
    throw new Error(res.error ?? "O agente não conseguiu gerar a identidade. Verifique se o Agent Runtime / AI está configurado e tente novamente.");
  }
  if (!res.snapshot) {
    throw new Error("A geração terminou, mas nenhuma identidade (conceitos/SVGs) foi criada. Tente novamente.");
  }
  return id;
}

export async function loadBrandData(projectId: string, conversationId?: string | null): Promise<BrandProjectData> {
  const project = await fetchSiteProject(projectId);
  const files = (project?.generated_code ?? {}) as Record<string, string>;
  const snapshot = brandFilesToSnapshot(files);
  const messages = conversationId ? await loadSiteChatMessages(projectId, conversationId) : [];
  return {
    projectId, projectName: project?.name ?? "Marca", files, snapshot,
    messages: messages.map((m) => ({ role: m.role, text: m.text })),
    conversationId: conversationId ?? null,
  };
}

/** Persiste os arquivos do Branding em site_projects.generated_code (merge seguro). */
export async function persistBrandingFiles(projectId: string, incoming: Record<string, string>): Promise<void> {
  const project = await fetchSiteProject(projectId);
  const current = ((project?.generated_code ?? {}) as Record<string, unknown>) ?? {};
  const merged = mergeBrandFiles(current, incoming);
  const { error } = await supabase.from("site_projects").update({ generated_code: merged as unknown }).eq("id", projectId);
  if (error) throw new Error(error.message);
}

export interface SendBrandResult { snapshot: BrandSnapshotLike | null; files: Record<string, string>; reply?: string; ok: boolean; error?: string; persisted: boolean; }

export async function sendBrandInstruction(input: {
  projectId: string;
  conversationId: string | null;
  instruction: string;
  files: Record<string, string>;
  projectName: string;
  userId?: string;
}): Promise<SendBrandResult> {
  try {
    const res: AgentExecuteResult = await invokeProspectorAgent({
      instruction: `BRANDING STUDIO — ${input.instruction}`,
      files: input.files,
      projectId: input.projectId,
      userId: input.userId,
      conversationId: input.conversationId ?? undefined,
      context: { name: input.projectName || undefined, segment: undefined, city: undefined, state: undefined, phone: undefined, whatsapp: undefined, address: undefined },
    });
    const files = res.files ?? input.files;
    const hasState = hasBrandState(files);
    const agentOk = res.status !== "error";
    if (!agentOk) {
      return { snapshot: extractBrandSnapshot(files), files, reply: res.reply, ok: false, persisted: false, error: res.errors?.[0] ?? "execução falhou" };
    }
    // Persistência como parte da confirmação: só ok:true se salvar.
    try {
      await persistBrandingFiles(input.projectId, files);
      return { snapshot: extractBrandSnapshot(files), files, reply: res.reply, ok: true, persisted: true };
    } catch (e) {
      return {
        snapshot: extractBrandSnapshot(files), files, reply: res.reply, ok: false, persisted: false,
        error: `A alteração foi gerada, mas não foi possível salvar o projeto. ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  } catch (e) {
    return { snapshot: extractBrandSnapshot(input.files), files: input.files, ok: false, persisted: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function persistBrandChatMessage(projectId: string, userId: string, message: { role: "user" | "assistant"; text: string }, conversationId?: string | null): Promise<void> {
  await appendSiteChatMessages(projectId, userId, [{ role: message.role, text: message.text }], conversationId ?? undefined).catch(() => {});
}

export { supabase };

