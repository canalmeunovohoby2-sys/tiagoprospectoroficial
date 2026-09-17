// Servidor HTTP do Prospector Agent Runtime.
// Expoe /health e /run (JSON). Roda em Node (fora do front e do edge Deno).
// Uso: PROSPECTOR_API_KEY=... npx tsx src/server.ts
//
// SESSÃO PERSISTENTE POR PROJETO: um Agent (Cline) fica vivo por projectId em
// memória; cada nova mensagem chama agent.continue() para manter o contexto.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ProspectorSiteAgent, isSurgicalEditTask, type AgentRunOutcome } from "./prospector-site-agent.js";
import { BrowserSession } from "./browser-session.js";
import { auditSiteInteractions } from "./interaction-audit.js";
import { isBugReport, instructionRequestsChange } from "./completion-guard.js";
import { ensureWorkspaceDir, readWorkspace, resolveWorkspaceRoot, cleanupWorkspace, materializeWorkspace, withWorkspaceLock } from "./workspace.js";
import type { BusinessContext } from "./tools.js";
import { assertGenerationQuality } from "./generation-gate.js";
import { buildCreativeBrief, formatCreativeBrief } from "./creative-direction.js";
import { buildGenerationSeed, formatBaseDirective } from "./site-bases.js";
import { ensureClientFavicon } from "./site-favicon.js";
import { generateSitePromoVideo } from "./site-video-promo.js";
import { appendChange, appendMemory, makeChangeEntry, memoryLineFromChange, renderProjectContextBlock, normalizeContext, type ProjectContext } from "./project-context.js";
import { buildGenerateSystemPrompt, needsBrandIdentity } from "./agent-identity.js";
import { materializeAttachments, type ChatAttachment } from "./attachments.js";
import { researchBusiness, formatResearch, type ResearchOutcome } from "./research.js";
import { trimConversationWindow } from "./conversation-window.js";
import { createArtifactStore } from "./artifact-store.js";
import { serveProjectArtifact } from "./artifacts-api.js";
import { runStudioOrchestration } from "./studio/orchestrator.js";
import { runStudioTeam } from "./studio/team.js";
import { applyDeterministicVisualEdit } from "./studio/visual-edit.js";
import { ensureGitRepo, gitCommit, gitDiff, gitLog, gitRestore, gitShow, gitStatus } from "./studio/git.js";
import { deriveCommitMessage } from "./studio/commit-message.js";
import { buildReactProject } from "./studio/build.js";
import { filterWorkingImages, mergeValidatedImages, normalizeWorkspaceMapEmbeds } from "./studio/agent-core/site-media.js";
import { activityForEvent } from "./studio/agent-core/activity-feed.js";
import { mediaContextBlock } from "./studio/agent-core/site-media.js";
import { generateCreativeBrief } from "./studio/agent-core/creative-brief.js";
import { callModelWithTools } from "./studio/agent-core/model.js";
import { isBootstrapProject } from "./studio/agent-core/first-message.js";
import { EDIT_TOOLS } from "./work-evidence.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

interface AgentSession {
  agent: ProspectorSiteAgent;
  projectId: string;
  lastActive: number;
  resetToken: string; // altera quando o usuário pede "começar do zero"/novo foco
  /** chave da config de IA usada ao criar a sessão (mudou → recria a sessão) */
  execKey?: string;
}

const sessions = new Map<string, AgentSession>();
const SESSION_TTL_MS = 30 * 60_000; // 30min de inatividade encerra a sessão
const MAX_SESSIONS = 40;

// Chaves de sessão ISOLADAS POR USUÁRIO + PROJETO — nunca reutilizáveis entre
// usuários e nunca indexadas só por projectId (anti-IDOR).
export const editKey = (uid: string, pid: string, cid?: string) => cid ? `edit:${uid}:${pid}:${cid}` : `edit:${uid}:${pid}`;
export const genKeyFor = (uid: string, pid: string, cid?: string) => cid ? `gen:${uid}:${pid}:${cid}` : `gen:${uid}:${pid}`;

/** Identidade resolvida da request. ticket = HMAC (Railway remoto);
 * jwt = JWT do usuário validado contra o Supabase (runtime LOCAL, sem secrets globais). */
export interface AuthIdentity {
  uid: string;
  pid: string | null;
  method: "ticket" | "jwt";
  /** JWT original (somente method=jwt) — usado para autenticar chamadas às
   * edge functions sem depender de RUNTIME_GATEWAY_SECRET global. */
  token?: string;
}

function supabaseEnv(): { url?: string; anon?: string } {
  return {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

// Valida um JWT do Supabase (sem biblioteca): GET /auth/v1/user com o token.
async function supabaseUser(token: string): Promise<string | null> {
  const { url, anon } = supabaseEnv();
  if (!url || !anon) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string } | null;
    return u?.id ?? null;
  } catch {
    return null;
  }
}

// Confirma que o usuário DONO do JWT também é dono do projeto (RLS via JWT).
async function jwtOwnsProject(token: string, userId: string, projectId: string): Promise<boolean> {
  const { url, anon } = supabaseEnv();
  if (!url || !anon) return false;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/site_projects?select=id&id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}`, apikey: anon, Accept: "application/vnd.pgrst.object+json" }, signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return false;
    const o = (await res.json()) as { id?: string } | null;
    return Boolean(o?.id);
  } catch {
    return false;
  }
}

/** Resolve a identidade da request: ticket HMAC (se AGENT_TICKET_SECRET) OU
 * JWT do usuário validado no Supabase (runtime local). Nunca confia em
 * user_id/projectId do body quando method=jwt — a identidade vem do token. */
export async function resolveIdentity(authHeader?: string | null, projectId?: string): Promise<AuthIdentity | null> {
  const raw = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;

  // Caminho Railway/ticket (mantém o comportamento atual byte a byte).
  if (process.env.AGENT_TICKET_SECRET && raw.split(".").length === 2) {
    const t = verifyTicket(authHeader);
    if (t) return { uid: t.uid, pid: t.pid, method: "ticket" };
    return null;
  }

  // Caminho LOCAL (JWT do usuário). 3 partes → parece JWT do Supabase.
  if (raw.split(".").length === 3) {
    const uid = await supabaseUser(raw);
    if (!uid) return null;
    if (projectId && projectId.trim() && projectId !== "default") {
      const owns = await jwtOwnsProject(raw, uid, projectId.trim());
      if (!owns) return null;
    }
    return { uid, pid: projectId && projectId.trim() && projectId !== "default" ? projectId.trim() : null, method: "jwt", token: raw };
  }

  return null;
}

// Ticket de execução assinado (HMAC-SHA256) emitido pela edge agent-ticket.
// O Runtime NÃO confia em user_id/projectId do body — apenas no ticket.
interface TicketClaims { uid: string; pid: string | null; exp: number }
export function verifyTicket(authHeader?: string | null): TicketClaims | null {
  const raw = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  const secret = process.env.AGENT_TICKET_SECRET;
  if (!secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64").toString("utf8")) as Partial<TicketClaims>;
    if (typeof claims.uid !== "string" || !claims.uid) return null;
    if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
    const pid = typeof claims.pid === "string" ? claims.pid : null;
    const body = `${claims.uid}|${pid ?? ""}|${claims.exp}`;
    const expected = createHmac("sha256", secret).update(body).digest();
    const got = Buffer.from(parts[1], "base64");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    return { uid: claims.uid, pid, exp: claims.exp };
  } catch {
    return null;
  }
}
function sendDenied(res: ServerResponse, message: string, code = 403): void {
  send(res, code, { status: "error", error: message, blocked_reason: message, blocked_code: "unauthorized" });
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendBinary(res: ServerResponse, code: number, contentType: string, bytes: Buffer): void {
  res.writeHead(code, { "Content-Type": contentType, "Content-Length": bytes.length });
  res.end(bytes);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

/** Texto de uma AgentMessage (partes `text` ou resultado de ferramenta). */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | null)?.content;
  const parts: unknown[] = Array.isArray(content) ? content : [];
  const out: string[] = [];
  for (const p of parts) {
    const part = p as { type?: string; text?: string; content?: unknown };
    if (part?.type === "text" && typeof part.text === "string") out.push(part.text);
    else if (part?.type === "tool-result") {
      if (typeof part.content === "string") out.push(part.content);
      else if (Array.isArray(part.content)) {
        for (const x of part.content as Array<{ text?: string }>) if (typeof x?.text === "string") out.push(x.text);
      }
    }
  }
  return out.join("\n").trim();
}

function truncateText(text: string, max = 4_000): string {
  return text.length > max ? `${text.slice(0, max)}… (+${text.length - max} caracteres)` : text;
}

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL_MS) sessions.delete(id);
  }
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastActive - b[1].lastActive);
    const toRemove = oldest.slice(0, oldest.length - MAX_SESSIONS);
    for (const [id] of toRemove) sessions.delete(id);
  }
}

// Portão de interação: clica nos elementos reais do site e, se um clique deixar
// a tela preta, o agente corrige (até maxCycles) ANTES de responder ao usuário.
// Browser indisponível → passa sem bloquear (tested=0).
async function runInteractionGate(
  agent: ProspectorSiteAgent,
  root: string,
  activity?: Array<{ phase: string; detail: string }>,
  maxCycles = 2,
): Promise<{ ok: boolean; tested: number; issues: string[]; cycles: number }> {
  let tested = 0;
  let issues: string[] = [];
  let cycles = 0;
  try {
    for (let i = 0; i <= maxCycles; i++) {
      const session = new BrowserSession(root);
      let audit;
      try {
        audit = await auditSiteInteractions(session);
      } finally {
        await session.close().catch(() => {});
      }
      tested = audit.tested;
      issues = audit.issues;
      if (audit.ok || i === maxCycles) break;
      cycles += 1;
      activity?.push({ phase: "verifying", detail: `Auditoria de cliques: tela preta ao clicar (${audit.issues.length}). Corrigindo…` });
      await agent.runTask(
        `ANTES DE FINALIZAR: a auditoria automática de interação detectou que clicar em alguns elementos deixa a página TODA PRETA. Corrija TODOS os casos:\n- ${audit.issues.join("\n- ")}\n` +
        `Investigue a causa raiz no código (overlay/modal/menu full-screen que não fecha, camada escura cobrindo a página, erro JS no handler do clique, classe adicionada ao clicar). Use browser_open + browser_eval para reproduzir e confirmar com browser_reload que o clique não deixa mais a tela preta.`,
        { continueSession: true },
      );
    }
  } catch {
    return { ok: true, tested: 0, issues: [], cycles: 0 };
  }
  return { ok: issues.length === 0, tested, issues, cycles };
}

function executionConfig(body: Record<string, unknown>): { provider?: string; model?: string } {
  const exec = (body.execution ?? null) as { provider?: unknown; model?: unknown } | null;
  if (!exec) return {};
  return {
    provider: typeof exec.provider === "string" && exec.provider.trim() ? exec.provider.trim().toLowerCase() : undefined,
    model: typeof exec.model === "string" && exec.model.trim() ? exec.model.trim() : undefined,
  };
}

interface RuntimeAiConfig { provider: string; model: string; baseUrl: string; apiKey: string; initialMessages?: unknown[] }

// Busca a config segura de execução do usuário via edge runtime-ai-config.
// Autentica com RUNTIME_GATEWAY_SECRET; NUNCA vai ao cliente. Falha → null
// (mantém o comportamento default sem quebrar o runtime).
async function fetchRuntimeAiConfig(userId: string, execution?: unknown, options?: { projectId?: string; conversationId?: string }, identity?: AuthIdentity | null): Promise<RuntimeAiConfig | null> {
  const proxyBase = process.env.PROSPECTOR_BASE_URL ?? "";
  const funcBase = process.env.SUPABASE_FUNCTIONS_URL || (proxyBase.includes("/functions/v1") ? proxyBase.split("/functions/v1")[0] + "/functions/v1" : "");
  if (!funcBase) return null;
  // Runtime LOCAL (JWT do usuário): autentica com o próprio token — NENHUM
  // secret global (RUNTIME_GATEWAY_SECRET) precisa estar na máquina do usuário.
  if (identity?.method === "jwt" && identity.token) {
    try {
      const res = await fetch(`${funcBase.replace(/\/$/, "")}/runtime-ai-config`, {
        method: "POST",
        headers: { Authorization: `Bearer ${identity.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ execution: execution ?? undefined, projectId: options?.projectId, conversationId: options?.conversationId }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { provider?: string; model?: string; baseUrl?: string; apiKey?: string; error?: string; initialMessages?: unknown[] };
      if (data.error || !data.provider || !data.model || !data.baseUrl) return null;
      if (!data.apiKey && data.provider !== "ollama") return null;
      return { provider: data.provider, model: data.model, baseUrl: data.baseUrl, apiKey: data.apiKey ?? "", initialMessages: data.initialMessages };
    } catch {
      return null;
    }
  }
  // Runtime remoto (Railway): autentica com RUNTIME_GATEWAY_SECRET (comportamento atual).
  const secret = process.env.RUNTIME_GATEWAY_SECRET;
  if (!secret) return null;
  try {
    const res = await fetch(`${funcBase.replace(/\/$/, "")}/runtime-ai-config`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, execution: execution ?? undefined, projectId: options?.projectId, conversationId: options?.conversationId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { provider?: string; model?: string; baseUrl?: string; apiKey?: string; error?: string; initialMessages?: unknown[] };
    if (data.error || !data.provider || !data.model || !data.baseUrl) return null;
    // Ollama é provider local sem chave: apiKey pode vir vazio e ainda assim executar.
    if (!data.apiKey && data.provider !== "ollama") return null;
    return { provider: data.provider, model: data.model, baseUrl: data.baseUrl, apiKey: data.apiKey ?? "", initialMessages: data.initialMessages };
  } catch {
    return null;
  }
}

async function saveConversation(userId: string, projectId: string, conversationId: string, messages: unknown[], filesChanged: string[], model?: string, provider?: string, identity?: AuthIdentity | null): Promise<void> {
  const proxyBase = process.env.PROSPECTOR_BASE_URL ?? "";
  const funcBase = process.env.SUPABASE_FUNCTIONS_URL || (proxyBase.includes("/functions/v1") ? proxyBase.split("/functions/v1")[0] + "/functions/v1" : "");
  if (!funcBase) return;
  try {
    if (identity?.method === "jwt" && identity.token) {
      await fetch(`${funcBase.replace(/\/$/, "")}/conversation-save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${identity.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, conversation_id: conversationId, messages, files_changed: filesChanged, model, provider }),
        signal: AbortSignal.timeout(8_000),
      });
      return;
    }
    const secret = process.env.RUNTIME_GATEWAY_SECRET;
    if (!secret) return;
    await fetch(`${funcBase.replace(/\/$/, "")}/conversation-save`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, project_id: projectId, conversation_id: conversationId, messages, files_changed: filesChanged, model, provider }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Non-blocking: persistência de conversa é best-effort
  }
}

/** Endpoint do conversation-save (mesma base das outras funções). */
async function conversationEndpoint(): Promise<string> {
  const proxyBase = process.env.PROSPECTOR_BASE_URL ?? "";
  const funcBase = process.env.SUPABASE_FUNCTIONS_URL || (proxyBase.includes("/functions/v1") ? proxyBase.split("/functions/v1")[0] + "/functions/v1" : "");
  return funcBase ? `${funcBase.replace(/\/$/, "")}/conversation-save` : "";
}

/** Contexto persistente do PROJETO (memória + histórico de alterações). Isolado por projectId. */
export async function loadProjectContext(userId: string, projectId: string, identity?: AuthIdentity | null): Promise<ProjectContext> {
  const endpoint = await conversationEndpoint();
  if (!endpoint || !projectId) return { memory: [], changes: [] };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const body: Record<string, unknown> = { project_id: projectId, kind: "context_load" };
    if (identity?.method === "jwt" && identity.token) headers.Authorization = `Bearer ${identity.token}`;
    else if (process.env.RUNTIME_GATEWAY_SECRET) { headers.Authorization = `Bearer ${process.env.RUNTIME_GATEWAY_SECRET}`; body.user_id = userId; }
    else return { memory: [], changes: [] };
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { memory: [], changes: [] };
    return normalizeContext(await res.json());
  } catch {
    return { memory: [], changes: [] };
  }
}

/** Salva o contexto do projeto (memória + alterações) — best-effort, não bloqueia. */
export async function saveProjectContext(userId: string, projectId: string, ctx: ProjectContext, identity?: AuthIdentity | null, model?: string, provider?: string): Promise<void> {
  const endpoint = await conversationEndpoint();
  if (!endpoint || !projectId) return;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const body: Record<string, unknown> = { project_id: projectId, kind: "context", memory: ctx.memory, changes: ctx.changes, model, provider };
    if (identity?.method === "jwt" && identity.token) headers.Authorization = `Bearer ${identity.token}`;
    else if (process.env.RUNTIME_GATEWAY_SECRET) { headers.Authorization = `Bearer ${process.env.RUNTIME_GATEWAY_SECRET}`; body.user_id = userId; }
    else return;
    await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });
  } catch {
    // best-effort
  }
}

export interface ResolvedExec {
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  initialMessages?: unknown[];
  /** de onde veio a IA que SERÁ usada: "user_config" (conta validada) */
  source: "user_config" | "request" | "env";
  warning?: string;
  /** identifica a config usada na sessão (troca de IA → recria a sessão) */
  key: string;
  /** PRINCÍPIO ABSOLUTO: se não provar a IA configurada → não executar. */
  blocked?: { code: string; message: string };
}

// Resolve QUAL provider/modelo/chave o runtime REALMENTE vai usar nesta request.
// Regra: SÓ a IA validada do usuário (is_default com chave, definida por um
// TESTE real) pode executar. Sem prova → bloqueia (nunca env/DeepSeek padrão).
async function prepareExec(body: Record<string, unknown>, authUid?: string, identity?: AuthIdentity | null): Promise<ResolvedExec> {
  const exec = executionConfig(body);
  const userId = (authUid && authUid.trim() ? authUid.trim() : "")
    || (typeof body.user_id === "string" && body.user_id.trim() ? body.user_id : "");
  const explicitProvider = exec?.provider ?? (typeof body.providerId === "string" && body.providerId.trim() ? body.providerId.toLowerCase() : undefined);
  const explicitModel = exec?.model ?? (typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : undefined);

  if (!userId) {
    return {
      source: "env",
      key: "blocked",
      blocked: { code: "no_user_id", message: "Execução bloqueada: não é possível provar qual IA foi configurada/validada sem o usuário autenticado (user_id). Envie o usuário e valide a IA em Configurações." },
    };
  }

  const runtimeCfg = await fetchRuntimeAiConfig(userId, body.execution, {
    projectId: typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : undefined,
    conversationId: typeof body.conversationId === "string" && body.conversationId.trim() ? body.conversationId.trim() : undefined,
  }, identity);
  if (runtimeCfg) {
    // Divergência entre o pedido e a IA validada → erro, não executa.
    if (explicitProvider && explicitProvider !== runtimeCfg.provider) {
      return {
        source: "user_config",
        key: `blocked:${explicitProvider}`,
        blocked: { code: "provider_divergence", message: `Divergência de IA: o pedido indicou "${explicitProvider}", mas a IA validada da sua conta é "${runtimeCfg.provider}". Corrija a configuração ou o pedido e tente de novo (nenhuma execução foi feita).` },
      };
    }
    if (explicitModel && explicitModel !== runtimeCfg.model) {
      return {
        source: "user_config",
        key: `blocked:${explicitModel}`,
        blocked: { code: "model_divergence", message: `Divergência de modelo: o pedido indicou "${explicitModel}", mas a IA validada usa "${runtimeCfg.model}". Nenhuma execução foi feita.` },
      };
    }
    return {
      providerId: runtimeCfg.provider,
      modelId: runtimeCfg.model,
      apiKey: runtimeCfg.apiKey,
      baseUrl: runtimeCfg.baseUrl,
      initialMessages: runtimeCfg.initialMessages,
      source: "user_config",
      key: `user:${runtimeCfg.provider}|${runtimeCfg.model}|${runtimeCfg.apiKey.slice(-6)}`,
    };
  }

  return {
    source: "env",
    key: "blocked",
    blocked: {
      code: "no_validated_ai",
      message: "Execução bloqueada: nenhuma IA validada foi encontrada na sua conta. Vá em Configurações → IA, adicione a chave do provedor e clique em TESTAR — só uma IA testada com sucesso pode executar gerações e edições. (DeepSeek padrão NÃO é usado como fallback.)",
    },
  };
}

// Log objetivo de geração (server-side; não vai para o usuário). Permite medir
// BASE/AI/BUILD e confirmar que a base é o workspace inicial do agente.
function genLog(genId: string, event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ scope: "generate", generation_id: genId, event, ts: Date.now(), ...data }));
  } catch { /* noop */ }
}

async function makeAgent(sessionKey: string, projectId: string, files: Record<string, string>, business: BusinessContext, body: Record<string, unknown>, exec?: ResolvedExec, opts?: { hasBase?: boolean; branding?: boolean }): Promise<ProspectorSiteAgent> {
  const root = ensureWorkspaceDir(projectId, files);
  const resolved = exec ?? await prepareExec(body, undefined);
  const apiKey = resolved.apiKey ?? (typeof body.apiKey === "string" ? body.apiKey : undefined);
  const baseUrl = resolved.baseUrl ?? (typeof body.baseUrl === "string" ? body.baseUrl : undefined);
  const mode = typeof body.mode === "string" ? (body.mode as "edit" | "generate") : "edit";
  // Em GERAÇÃO, o system prompt precisa saber se há base pré-carregada — senão o
  // modelo é instruído a "criar do zero" e descarta a base (bug de integração).
  const systemPrompt = mode === "generate" ? buildGenerateSystemPrompt({ hasBase: !!opts?.hasBase, branding: !!opts?.branding }) : undefined;

  return new ProspectorSiteAgent({
    workspaceRoot: root,
    business,
    projectId: projectId || undefined,
    apiKey,
    baseUrl,
    modelId: resolved.modelId,
    providerId: resolved.providerId,
    systemPrompt,
    maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : Math.min(80, Math.max(8, Number(process.env.AGENT_MAX_ITERATIONS ?? 40))),
    initialFiles: files,
    mode,
    hasBase: !!opts?.hasBase,
    branding: !!opts?.branding,
    enableBrowser: body.enableBrowser !== false,
    initialMessages: resolved.initialMessages?.length ? trimConversationWindow(resolved.initialMessages) : undefined,
  });
}

/**
 * Prepara um diretório para servir o SITE REAL à captura/vídeo.
 *
 * Projetos React (Vite/TSX) NÃO rodam servidos como código-fonte — o Chromium não
 * executa `.tsx`, o que produzia capturas/vídeos VAZIOS. Aqui compilamos
 * (`npm run build`) e servimos o HTML final (self-contained). Sites estáticos
 * seguem servindo o próprio workspace (comportamento antigo preservado).
 */
/**
 * Valida as imagens do negócio SEM NUNCA quebrar a geração: roda em paralelo, tem
 * teto de tempo e, em qualquer falha/timeout, devolve o contexto ORIGINAL.
 */
async function validateBusinessImages(business: BusinessContext): Promise<BusinessContext> {
  const photos = business.photos ?? [];
  const stock = business.stockImages ?? [];
  if (photos.length === 0 && stock.length === 0) return business;
  // NUNCA devolver menos imagens do que recebemos: as VALIDADAS vêm primeiro e as
  // demais continuam na lista (o modelo recebe `onError` para esconder se falhar).
  // Sem isso, uma falha de rede do runtime deixava o site SEM FOTO NENHUMA.

  try {
    const work = (async (): Promise<BusinessContext> => {
      const [okPhotos, okStock] = await Promise.all([
        photos.length ? filterWorkingImages(photos) : Promise.resolve([] as string[]),
        stock.length ? filterWorkingImages(stock) : Promise.resolve([] as string[]),
      ]);
      return { ...business, photos: mergeValidatedImages(photos, okPhotos), stockImages: mergeValidatedImages(stock, okStock) };
    })();
    return await Promise.race([
      work,
      new Promise<BusinessContext>((resolve) => setTimeout(() => resolve(business), 7000)),
    ]);
  } catch {
    return business; // imagens são melhoria, nunca bloqueio da geração
  }
}

export async function prepareSiteServeDir(root: string): Promise<{ dir: string; temp?: string }> {  const isReact = existsSync(join(root, "package.json"))
    && (existsSync(join(root, "src")) || existsSync(join(root, "vite.config.ts")) || existsSync(join(root, "vite.config.js")));
  if (!isReact) return { dir: root };
  const built = await buildReactProject(root);
  if (!built.ok || !built.html) throw new Error(built.error || "Falha ao compilar o site para captura.");
  const dir = mkdtempSync(join(tmpdir(), "prospector-serve-"));
  writeFileSync(join(dir, "index.html"), built.html, "utf8");
  return { dir, temp: dir };
}

export function startServer(port = PORT, host = HOST) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Streaming do /generate (NDJSON + heartbeat): se o streaming já começou, o
    // catch de erro deve emitir um evento `result` de erro (não `send(500)`).
    let genStreamStarted = false;
    let genStreamFinish: ((payload: Record<string, unknown>) => void) | null = null;

    try {
      if (url.pathname === "/health") {
        send(res, 200, {
          ok: true,
          provider: process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          hasKey: !!(process.env.DEEPSEEK_API_KEY ?? process.env.PROSPECTOR_API_KEY),
          activeSessions: sessions.size,
          runtime: "cline",
          // Versão/commit identificável (sem secrets): Railway injeta
          // RAILWAY_GIT_COMMIT_SHA; permitimos override explícito via env.
          version: process.env.DEPLOY_VERSION ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev",
          auth: process.env.AGENT_TICKET_SECRET ? "enabled" : (supabaseEnv().url ? "jwt" : "disabled"),
          mode: process.env.AGENT_RUNTIME_LOCAL === "1" ? "local" : "remote",
        });
        return;
      }

      if (url.pathname === "/session" && req.method === "DELETE") {
        const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
        const projectId = String(body.projectId ?? "").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Sem autorização para encerrar a sessão.", 401); return; }
        if (identity.pid && projectId && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        if (projectId) sessions.delete(editKey(identity.uid, projectId));
        send(res, 200, { ok: true });
        return;
      }

      // Captura screenshots REAIS (desktop + mobile) do site para o PDF de proposta.
      if (url.pathname === "/capture" && req.method === "POST") {
        const identity = await resolveIdentity(req.headers.authorization);
        if (!identity) { sendDenied(res, "Autenticação necessária para capturar screenshots.", 401); return; }
        const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
        const files = (body.files && typeof body.files === "object" ? body.files : {}) as Record<string, string>;
        const hasIndex = Object.keys(files).some((k) => k.endsWith("index.html"));
        if (!hasIndex) { send(res, 400, { ok: false, error: "Nenhum arquivo index.html para capturar." }); return; }
        const pid = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const root = ensureWorkspaceDir(pid, files);
        const toDataUrl = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
        const err = (e: unknown) => send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
        let built: { dir: string; temp?: string } | null = null;
        let session: BrowserSession | null = null;
        try {
          // Compila o projeto (React) e serve o SITE REAL — nunca o código-fonte.
          built = await prepareSiteServeDir(root);
          session = new BrowserSession(built.dir);
          const base = await session.startServer();
          await session.open(base, { width: 1366, height: 850 });
          await new Promise((r) => setTimeout(r, 1500)); // deixa o app montar/animar
          const desktop = await session.screenshot("desktop", { fullPage: false });
          await session.setViewport(390, 844);
          await session.reload();
          await new Promise((r) => setTimeout(r, 1200));
          const mobile = await session.screenshot("mobile", { fullPage: false });
          send(res, 200, { ok: true, desktop: toDataUrl(desktop), mobile: toDataUrl(mobile) });
        } catch (e) {
          err(e);
        } finally {
          await session?.close().catch(() => {});
          if (built?.temp) { try { rmSync(built.temp, { recursive: true, force: true }); } catch { /* noop */ } }
          cleanupWorkspace(pid);
        }
        return;
      }

      if (url.pathname === "/generate" && req.method === "POST") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        const genId = `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const t0 = Date.now();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para gerar o site.", 401); return; }
        if (!projectId) { send(res, 400, { error: "projectId é obrigatório" }); return; }
        if (identity.pid && projectId && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        const business = (body.context && typeof body.context === "object" ? body.context : {}) as BusinessContext;
        const briefing = (body.briefing && typeof body.briefing === "object" ? body.briefing : {}) as Record<string, unknown>;

        // Direção criativa do negócio (calculada uma vez): é a AUTORIDADE visual
        // do projeto e também orienta a escolha da base estrutural.
        const creativeBrief = buildCreativeBrief(business.name ?? "", business.segment ?? "");

        // BASE TÉCNICA (scaffold): quando a geração parte de um workspace vazio,
        // injeta uma cópia sanitizada de site-bases/<id> para o agente ADAPTAR —
        // economiza estrutura/CSS/responsividade sem virar template. Arquivos
        // enviados pelo cliente sempre têm precedência e nunca são sobrescritos.
        const incomingSeed = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        const { seed, baseUsed } = buildGenerationSeed({
          files: incomingSeed,
          business,
          brief: creativeBrief,
          briefing,
        });
        genLog(genId, "BASE_SELECTED", {
          base: baseUsed,
          incoming_files: Object.keys(incomingSeed).length,
          staged_files: Object.keys(seed).length,
          ms: Date.now() - t0,
        });
        const gExec = executionConfig(body);
        if (gExec.provider && !["deepseek", "openai", "nvidia", "openrouter", "gemini", "ollama"].includes(gExec.provider)) {
            send(res, 400, { error: `Provedor "${gExec.provider}" não é suportado pelo runtime (use deepseek, openai, nvidia, openrouter, gemini ou ollama).` });
          return;
        }
        const genKey = genKeyFor(identity.uid, projectId);
        pruneSessions();
        const existingGen = sessions.get(genKey);
        // Gera em MENOS iterações por padrão (a geração é uma chamada bloqueante; 32
        // iterações + browser estouram o limite de ~300s de proxy/transport e dão
        // "Agent Runtime não respondeu"). Configurável via GENERATE_MAX_ITERATIONS.
        const genIter = Math.min(60, Math.max(8, Number(body.maxIterations ?? process.env.GENERATE_MAX_ITERATIONS ?? 22)));
        // Browser QA na geração fica OPT-IN (acelera muito; evita timeout). Para
        // ligar por padrão: GENERATE_BROWSER=1 ou envie enableBrowser:true.
        const genBrowser = process.env.GENERATE_BROWSER === "1" || body.enableBrowser === true;
        // Prova real: resolve a IA da conta; se a config mudou desde a última
        // geração, recria a sessão do agente com provider/modelo/chave novos.
        const genExec = await prepareExec({ ...body, mode: "generate" }, identity.uid, identity);
        // PRINCÍPIO ABSOLUTO: sem prova da IA validada → NÃO gera.
        if (genExec.blocked) {
          send(res, 200, {
            status: "error",
            error: genExec.blocked.message,
            errors: [genExec.blocked.message],
            blocked_reason: genExec.blocked.message,
            blocked_code: genExec.blocked.code,
            runtime: "cline",
            changed: false,
            touched: [],
            files: seed,
            provider: null,
            model: null,
            config_source: "blocked",
          });
          return;
        }
        const genProviderChanged = !!(existingGen?.agent && existingGen.execKey !== genExec.key);
        const agent = (existingGen?.agent && !genProviderChanged)
          ? existingGen.agent
          : await makeAgent(genKey, projectId, seed, business, { ...body, mode: "generate", maxIterations: genIter, enableBrowser: genBrowser }, genExec, { hasBase: !!baseUsed, branding: needsBrandIdentity(`${String(body.prompt ?? "")} ${JSON.stringify(body.briefing ?? {})}`) });
        sessions.set(genKey, { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });
        sessions.set(editKey(identity.uid, projectId), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });

        // Evidência objetiva: quais arquivos existem no workspace ANTES da IA agir.
        {
          const genRoot = resolveWorkspaceRoot(projectId);
          const initialWorkspaceFiles = Object.keys(readWorkspace(genRoot));
          genLog(genId, "BASE_WORKSPACE_PREPARED", {
            base: baseUsed,
            root: genRoot,
            files: initialWorkspaceFiles.length,
            reused_session: !!(existingGen?.agent && !genProviderChanged),
            ms: Date.now() - t0,
          });
          genLog(genId, "BASE_FILES_PRESENT", {
            base: baseUsed,
            has_index: initialWorkspaceFiles.includes("index.html"),
            has_css: initialWorkspaceFiles.some((f) => f.endsWith(".css")),
            has_js: initialWorkspaceFiles.some((f) => f.endsWith(".js")),
            files: initialWorkspaceFiles.slice(0, 12),
            ms: Date.now() - t0,
          });
        }

        // ANEXOS (5.26) na geração: materializa no workspace (ex.: logo/foto real do cliente).
        const attachResult = materializeAttachments(resolveWorkspaceRoot(projectId), (body.attachments ?? []) as ChatAttachment[]);
        const genAttachBlock = attachResult.attachments.length || attachResult.errors.length
          ? `\nANEXOS DO USUÁRIO (arquivos reais no workspace — use se fizerem sentido para o site):\n${attachResult.attachments.map((a) => `- ${a.path} (${a.mediaType}, ${a.bytes} bytes)`).join("\n")}\nPara usar uma imagem do usuário: referencie o arquivo real (<img src="assets/<nome>"> ou background url). O preview embute o asset automaticamente; NÃO embuta o data URL gigante inline.\nPRESERVE A TRANSPARÊNCIA de logos/PNG sem fundo — nunca adicione fundo preto/branco, não converta para JPG e não coloque caixa escura atrás da imagem transparente.\nReutilizar a MESMA foto do usuário em vários pontos é ESPERADO e permitido quando fizer sentido.\n${attachResult.errors.length ? `Anexos rejeitados (segurança):\n- ${attachResult.errors.join("\n- ")}\n` : ""}`
          : "";

        const activity: Array<{ phase: string; detail: string }> = [];
        const events: string[] = [];
        let firstToolAt = 0, firstChangeAt = 0, firstRenderAt = 0, toolCount = 0, writeCount = 0;
        agent.subscribe((event) => {
          try {
            events.push((event as { type: string }).type);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const e = event as any;
            if (e.type === "tool-started") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const input = e.toolCall?.input ?? {};
              const path = typeof input?.path === "string" ? input.path : "";
              const tool = e.toolCall?.toolName ?? "";
              const detail = path ? `${path}` : "";
              if (tool) {
                toolCount++;
                if (!firstToolAt) { firstToolAt = Date.now(); genLog(genId, "FIRST_TOOL", { tool, path, ms: firstToolAt - t0 }); }
                if (["write_file", "edit_file", "delete_file"].includes(tool)) {
                  writeCount++;
                  if (!firstChangeAt) { firstChangeAt = Date.now(); genLog(genId, "FIRST_FILE_CHANGE", { tool, path, ms: firstChangeAt - t0 }); }
                }
                if ((/^browser_/.test(tool) || /^visual_/.test(tool)) && !firstRenderAt) {
                  firstRenderAt = Date.now();
                  genLog(genId, "FIRST_RENDER", { tool, ms: firstRenderAt - t0 });
                }
              }
              if (tool === "read_file" || tool === "list_files" || tool === "get_site_context") {
                activity.push({ phase: detail ? "reading" : "analyzing", detail: detail ? `Analisando ${detail}` : "Analisando o negócio…" });
              } else if (tool === "write_file") {
                activity.push({ phase: "creating", detail: `Criando ${detail}` });
              } else if (tool === "edit_file") {
                activity.push({ phase: "editing", detail: `Ajustando ${detail}` });
              } else if (tool === "finish_task") {
                activity.push({ phase: "done", detail: "Finalizando" });
              }
            } else if (e.type === "turn-finished") {
              activity.push({ phase: "reviewing", detail: "Revisando o código…" });
            }
          } catch { /* noop */ }
        });

        // Instrução da missão embutida com briefing (sem inventar fatos).
        const ctxLines = [
          business.name && `Empresa: ${business.name}`,
          business.segment && `Segmento: ${business.segment}`,
          business.city && `Cidade: ${business.city}`,
          business.state && `Estado: ${business.state}`,
          business.address && `Endereço: ${business.address}`,
          business.phone && `Telefone: ${business.phone}`,
          business.whatsapp && `WhatsApp: ${business.whatsapp}`,
          Array.isArray(business.services) && business.services.length && `Serviços: ${(business.services as string[]).join(", ")}`,
          typeof business.about === "string" && `Sobre: ${business.about}`,
        ].filter(Boolean).join("\n");

        const extra = Object.keys(briefing).length
          ? `\nInformações adicionais do briefing (use o que for real; não invente o resto):\n${JSON.stringify(briefing).slice(0, 2000)}`
          : "";

        // PESQUISA WEB (5.26): referências/tendências do segmento antes da missão.
        // Best-effort — se não houver chave configurada, segue sem pesquisa.
        let research: ResearchOutcome | null = null;
        try {
          research = await researchBusiness({ businessName: business.name, segment: business.segment, city: business.city });
        } catch { research = null; }
        const researchBlock = research && research.ok && research.snippets.length
          ? `\nPESQUISA WEB DE REFERÊNCIA (5.26) — use para decidir a direção (tendências, técnicas, o que líderes do nicho fazem). NÃO copie sites/layouts/textos encontrados; crie algo próprio:\n${formatResearch(research)}`
          : "";

        // Diretiva de EXECUÇÃO dos tokens: não são sugestões, são decisões.
        const tokenDirective = `
REGRA DE EXECUÇÃO DOS DESIGN TOKENS:
- Os tokens acima (paleta, tipografia, composição, arquitetura ESCOLHIDA) são DECISÕES DE DESIGN para este projeto. NÃO substitua pelos seus defaults pessoais.
- NÃO invente outra paleta sem motivo; NÃO troque as fontes definidas sem necessidade; NÃO trate os tokens como sugestões genéricas. Use-os como BASE REAL para implementar.
- Se uma decisão técnica exigir pequena adaptação (ex.: contraste, responsividade), PRESERVE a intenção visual.
- Isso NÃO é um template: você mantém liberdade de seções, componentes, arquivos, microinterações e decisões de UX. A direção define a LINGUAGEM VISUAL, não o site inteiro.`;

        const userPrompt = (
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : typeof briefing.user_prompt === "string" && briefing.user_prompt.trim()
              ? briefing.user_prompt.trim()
              : ""
        );
        // Diretriz de DIVERSIDADE VISUAL (comportamental): cada projeto é um novo
        // desafio de direção criativa. O nicho é só uma variável — a identidade do
        // NEGÓCIO guia a estética. Proibido operar com template/template implícito
        // ou repetir paleta/imagens/layout/fontes de outro projeto.
        const creativeDirective = `
DIRETRIZ DE DIVERSIDADE CRIATIVA (obrigatória — leia e aplique):
- Este NÃO é "o site de um nicho". É o site de ESTE negócio específico (nome, posicionamento, público, serviços, local, proposta de valor, tom). A identidade visual deve nascer dele.
- Reconsidere a direção criativa DO ZERO para este projeto. Não assuma estética padrão, não aplique um "template mental" nem repita paleta/cores/fontes/layout/herobanner/composição de outros projetos que você já viu no nicho.
- Varie de forma INTENCIONAL E COERENTE: conceito, atmosfera, paleta, tipografia, tratamento de imagens, composição, hierarquia, componentes (cards/botões/menus/badges/grids/divisores/sombras/tratamentos), ritmo entre seções, CTAs, elementos gráficos e comportamento responsivo.
- Estrutura NÃO é fórmula: pode alterar ordem de seções, criar novas, remover as desnecessárias, combinar informação, usar grids assimétricos, seções em tela cheia, sobreposições, composição editorial, layout minimalista — desde que sirva ao projeto e à conversão.
- Imagens têm FUNÇÃO na narrativa: escolha referências ADEQUADAS a este projeto e à sua direção (não banco fixo do nicho; não repita a mesma foto/pessoa/pose/equipamento de outro projeto). Se imagens externas forem necessárias, busque as que traduzem ESTA direção.
- Tipografia acompanha a direção (família/peso/escala/contraste/largura/ritmo), sempre legível e profissional.
- Diversidade ≠ caos: mantenha originalidade + usabilidade + hierarquia + conversão + identidade, respeitando acessibilidade, legibilidade, responsividade, performance e coerência de marca.
- ENTREGUE EXECUTANDO: crie/edite/remova arquivos reais no workspace. Não explique como fazer nem responda no lugar da execução.`;

        // Diretiva da BASE TÉCNICA (só quando uma base foi pré-carregada).
        const baseDirective = baseUsed ? `\n${formatBaseDirective(baseUsed)}\n` : "";

        // FASE 7 — quando há base, o fechamento da missão NÃO pode dizer "crie do
        // zero"/"PRÓPRIOS": precisa mandar ADAPTAR a base existente.
        const baseAwareImportant = baseUsed
          ? `IMPORTANTE: ADAPTE a base técnica JÁ CARREGADA no workspace (index.html, src/site.css, src/main.js). Preserve a arquitetura, o sistema de CSS (classes/variáveis --c-*/tokens), o JS e a responsividade existentes e TRANSFORME-OS para ESTE negócio (identidade, paleta, tipografia, seções, composição, efeitos PRÓPRIOS). NÃO reconstrua o site do zero sem necessidade: use edit_file para o que for localizado e só reescreva um arquivo por inteiro quando a missão exigir. Sempre preserve o que não faz parte do pedido.`
          : `IMPORTANTE: crie um site completo conforme o pedido, com identidade, paleta, tipografia, arquitetura e efeitos PRÓPRIOS, responsivo. Use imagens contextuais reais quando fizer sentido. NUNCA deixe o site "de rascunho" — entregue código real dos arquivos necessários.`;

        // FASE 7 — os ARQUIVOS atuais vencem qualquer memória/conversa.
        const memoryDirective = `
FONTE DE VERDADE DO PROJETO (obrigatória): os ARQUIVOS ATUAIS do workspace são a verdade absoluta. A conversa/memória serve para intenção e decisões anteriores, mas se ela CONTRADIZER o código/arquivos atuais, os ARQUIVOS vencem. Antes de editar algo "lembrado", releia o arquivo atual. Nunca reverta mudanças recentes por causa de memória antiga.`;

        const mission = userPrompt
          ? `${userPrompt}

[INSTRUÇÃO DO USUÁRIO acima — é EXATAMENTE o que você deve CONSTRUIR. Siga o seu fluxo de sistema: analisar → pesquisar quando útil → direcionar → estruturar → criar código real → auto-revisar → corrigir → finalizar. EXECUTE criando, editando ou removendo os arquivos do workspace — NÃO responda apenas explicando. Inspecione o projeto, use as ferramentas de arquivo e entregue o resultado no código. Entrega finalista é o site real, não uma explicação.]

${ctxLines ? `CONTEXTO REAL DO NEGÓCIO (se fornecido):\n${ctxLines}` : ""}
${extra}
${genAttachBlock}
${researchBlock}
${formatCreativeBrief(creativeBrief)}
${tokenDirective}
${baseDirective}
${creativeDirective}
${memoryDirective}

${baseAwareImportant}`
          : `${baseUsed ? "Transforme a base técnica já carregada no site deste negócio, seguindo o fluxo da sua instrução de sistema (analisar → pesquisar quando necessário → direcionar → estruturar → adaptar o código real → auto-revisar → corrigir → finalizar)." : "Crie do zero o site deste negócio, seguindo o fluxo da sua instrução de sistema (analisar → pesquisar quando necessário → direcionar → estruturar → criar código real → auto-revisar → corrigir → finalizar)."}

CONTEXTO REAL DO NEGÓCIO:
${ctxLines || "(apenas nome de arquivo/nenhum dado além do projeto)"}
${extra}
${genAttachBlock}
${researchBlock}
${formatCreativeBrief(creativeBrief)}
${tokenDirective}
${baseDirective}
${creativeDirective}
${memoryDirective}

${baseUsed ? baseAwareImportant : `IMPORTANTE: a "Direção criativa sugerida" é apenas um PONTO DE PARTIDA entre muitas direções possíveis — combine-a com a pesquisa e com o que encontrar no negócio. Cada site deve ter identidade, paleta, tipografia, arquitetura e efeitos PRÓPRIOS (nunca copie o mesmo layout de outros projetos). Você tem liberdade para escolher o layout e a direção visual. Use imagens contextuais reais.`}`;

        // STREAMING + HEARTBEAT: geração longa; sem bytes a conexão é morta pelo
        // transporte (~300s). Envia NDJSON com ping para manter viva.
        const genWriteLine = (obj: unknown) => { try { res.write(`${JSON.stringify(obj)}\n`); } catch { /* cliente desconectou */ } };
        res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
        genWriteLine({ type: "start", runtime: "cline", mode: "generate" });
        const genHeartbeat = setInterval(() => { try { genWriteLine({ type: "ping" }); } catch { /* noop */ } }, 12_000);
        const finishGenerate = (payload: Record<string, unknown>) => { clearInterval(genHeartbeat); try { genWriteLine({ type: "result", ...payload }); } catch { /* noop */ } try { res.end(); } catch { /* noop */ } };
        genStreamStarted = true;
        genStreamFinish = finishGenerate;

        genLog(genId, "AGENT_STARTED", { base: baseUsed, reused_session: !!existingGen, ms: Date.now() - t0 });
        const outcome = await agent.runTask(mission, { continueSession: !!existingGen });
        // ===== QUALITY GATE PÓS-GERAÇÃO (5.21) =====
        // A qualidade passa a ser consequência do processo: se a primeira versão
        // estiver tecnicamente deficiente (sem imagens em segmento visual, sem
        // CTA, sem responsividade, footer simples...), o agente recebe a lista
        // concreta de problemas e roda UMA correção dirigida. Máx. 2 ciclos.
        let finalOutcome = outcome;
        let gateResult = assertGenerationQuality(readWorkspace(resolveWorkspaceRoot(projectId)), {
          segment: business.segment ?? "",
          name: business.name ?? "",
          businessHas: (f) => f === "hours" ? false : true,
        });
        const gateCycles = Math.min(3, Math.max(0, Number(process.env.GENERATE_GATE_CYCLES ?? 1)));
        for (let g = 0; g < gateCycles && !gateResult.ok; g++) {
          const fixMission = `Antes de finalizar, você precisa corrigir os problemas técnicos abaixo apontados pela revisão automática da geração. Continue trabalhando no código (pode abrir o navegador para validar) e corrija TODOS:
${gateResult.issues.map((i) => `- ${i}`).join("\n")}
Mantenha os dados reais do negócio e não invente nada. Após corrigir, verifique novamente e finalize.`;
          const fixOut = await agent.runTask(fixMission, { continueSession: true });
          const filesAfter = readWorkspace(resolveWorkspaceRoot(projectId));
          gateResult = assertGenerationQuality(filesAfter, {
            segment: business.segment ?? "",
            name: business.name ?? "",
            businessHas: () => true,
          });
          finalOutcome = fixOut;
          activity.push({ phase: "gate", detail: `Revisão automática: ${gateResult.ok ? "problemas resolvidos" : `${gateResult.issues.length} problema(s) restante(s)`}` });
          if (gateResult.ok) break;
        }
        // Auditoria de interação: clica nos elementos e corrige tela preta antes
        // de entregar o site (garantia de "pronto para uso").
        const interaction = await runInteractionGate(agent, resolveWorkspaceRoot(projectId), activity);
        if (interaction.cycles > 0) activity.push({ phase: "verifying", detail: interaction.ok ? "Interações corrigidas e revalidadas." : "Interações ainda com problema (entrega bloqueada)." });
        const finalFiles = readWorkspace(resolveWorkspaceRoot(projectId));
        // FAVICON DO CLIENTE (final): se o Branding Studio criou a logo do cliente
        // (assets/brand/*.svg), o favicon passa a usar o SÍMBOLO dela; senão mantém
        // o monograma do cliente já semeado na base. Persiste index.html + asset.
        const fav = ensureClientFavicon(finalFiles, business, creativeBrief.tokens.palette);
        if (fav.changed) materializeWorkspace(resolveWorkspaceRoot(projectId), fav.files);
        const deliveredFiles = fav.changed ? fav.files : finalFiles;
        genLog(genId, "CLIENT_FAVICON", { source: fav.source, href: fav.href, changed: fav.changed });
        const genBlocked = !interaction.ok;
        // Move o agente de geração para o pool de edição do mesmo projectId,
        // para que o chat continue a MESMA conversa/sessão após a geração.
        sessions.delete(genKey);
        sessions.set(editKey(identity.uid, projectId), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });

        genLog(genId, "GENERATION_COMPLETED", {
          base: baseUsed,
          ok: finalOutcome.ok,
          gate_ok: gateResult.ok,
          interaction_ok: interaction.ok,
          tools: toolCount,
          file_changes: writeCount,
          first_tool_ms: firstToolAt ? firstToolAt - t0 : null,
          first_file_change_ms: firstChangeAt ? firstChangeAt - t0 : null,
          first_render_ms: firstRenderAt ? firstRenderAt - t0 : null,
          total_ms: Date.now() - t0,
        });
        // FALHA FALSA EVITADA: se a run terminou sem `finish_task` aprovado
        // (unverified), mas o QUALITY GATE objetivo passou E o site foi realmente
        // criado nesta run, aceitamos a geração. O gate continua sendo a evidência
        // real de qualidade — isto só evita punir o modelo por não ter chamado o
        // finish_task após entregar um site válido.
        const generationProduced = writeCount > 0 && !!finalFiles["index.html"];
        const generationOk = finalOutcome.ok || (
          finalOutcome.unverified === true && gateResult.ok && generationProduced && !genBlocked
        );
        genLog(genId, "GENERATION_VERDICT", {
          outcome_ok: finalOutcome.ok,
          unverified: finalOutcome.unverified === true,
          gate_ok: gateResult.ok,
          produced: generationProduced,
          interaction_ok: interaction.ok,
          accepted: generationOk,
        });
        finishGenerate({
          status: genBlocked ? "error" : (generationOk ? "ok" : "error"),
          reply: generationOk && !finalOutcome.ok ? (finalOutcome.rawReply || "Site gerado com sucesso.") : finalOutcome.reply,
          error: genBlocked
            ? "O site gerado reprovou na auditoria de interação (clique deixa a tela preta) e a correção automática não resolveu. A entrega foi BLOQUEADA — gere novamente para tentar de novo."
            : (generationOk ? undefined : finalOutcome.error),
          errors: genBlocked ? interaction.issues.slice(0, 5) : undefined,
          interaction_blocked: genBlocked || undefined,
          changed: true,
          touched: finalOutcome.touched,
          files: deliveredFiles,
          model: genExec.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
          provider: genExec.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          config_source: genExec.source,
          config_warning: genExec.warning ?? null,
          provider_changed: genProviderChanged,
          runtime: "cline",
          mode: "generate",
          base: baseUsed,
          gate_ok: gateResult.ok,
          gate_issues: gateResult.issues,
          interaction: { ok: interaction.ok, tested: interaction.tested, issues: interaction.issues, cycles: interaction.cycles },
          timing: finalOutcome.timing,
          finish_skips: finalOutcome.finishSkips,
          finish_blocked: finalOutcome.finishBlocked,
          events: events.slice(0, 200),
          activity,
        });
        return;
      }

      // PROVA real: qual IA o runtime USARÁ para este usuário (sanitizado).
      if (url.pathname === "/agent-config" && req.method === "POST") {
        const identity = await resolveIdentity(req.headers.authorization);
        if (!identity) { send(res, 200, { ok: false, provider: null, model: null, config_source: "blocked", blocked_reason: "Autenticação necessária para consultar a IA do usuário." }); return; }
        const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
        const exec = await prepareExec({ ...body, user_id: identity.uid }, identity.uid, identity);
        if (exec.blocked) {
          send(res, 200, {
            ok: false,
            provider: null,
            model: null,
            config_source: "blocked",
            blocked_reason: exec.blocked.message,
          });
          return;
        }
        send(res, 200, {
          ok: true,
          provider: exec.providerId ?? null,
          model: exec.modelId ?? null,
          config_source: exec.source,
          warning: exec.warning ?? null,
        });
        return;
      }

      if (url.pathname.startsWith("/artifacts/branding/") && req.method === "GET") {
          const rest = url.pathname.slice("/artifacts/branding/".length);
          const slash = rest.indexOf("/");
          const projectId = slash === -1 ? rest : rest.slice(0, slash);
          const rel = slash === -1 ? "" : rest.slice(slash + 1);
          const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
          if (!identity) { sendDenied(res, "Autenticação necessária para acessar artefatos.", 401); return; }
          if (!projectId || identity.pid && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
          const store = createArtifactStore();
          const out = await serveProjectArtifact(store, projectId, rel);
          if (!out.ok) { send(res, out.status, { error: out.content }); return; }
          sendBinary(res, out.status, out.contentType ?? "application/octet-stream", out.bytes!);
          return;
      }

      // GERA VÍDEO do site real (apresentação para o cliente) — MP4 H.264.
      // SÓ LEITURA: grava o estado atual do projeto, nunca altera arquivos.
      if (url.pathname === "/video" && req.method === "POST") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const projectId = String(body.projectId ?? "").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para gerar o vídeo.", 401); return; }
        if (!projectId || (identity.pid && identity.pid !== projectId)) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        const rawFiles = body.files && typeof body.files === "object" ? (body.files as Record<string, unknown>) : {};
        const files: Record<string, string> = {};
        for (const [p, c] of Object.entries(rawFiles)) if (typeof c === "string") files[p] = c;
        if (!Object.keys(files).some((p) => p.endsWith("index.html"))) {
          send(res, 400, { status: "error", ok: false, error: "projeto sem index.html — não há site para gravar." });
          return;
        }
        ensureWorkspaceDir(projectId, files);
        const root = resolveWorkspaceRoot(projectId);
        const phases: string[] = [];
        const target = Number(body.target ?? 30) || 30;
        // STREAMING + HEARTBEAT: a gravação+encode levam ~40-70s; sem bytes a
        // conexão é morta pelo transporte e o navegador reporta "Failed to fetch".
        // Envia NDJSON com ping (igual a /run e /generate) para manter viva.
        res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
        const vWrite = (obj: unknown) => { try { res.write(`${JSON.stringify(obj)}\n`); } catch { /* cliente desconectou */ } };
        vWrite({ type: "start", kind: "video" });
        const vHeartbeat = setInterval(() => { vWrite({ type: "ping" }); }, 12_000);
        const vFinish = (payload: Record<string, unknown>) => { clearInterval(vHeartbeat); vWrite({ type: "result", ...payload }); try { res.end(); } catch { /* noop */ } };
        let vBuilt: { dir: string; temp?: string } | null = null;
        try {
          // Compila o projeto (React) e grava o SITE REAL — nunca o código-fonte.
          vBuilt = await prepareSiteServeDir(root);
          const result = await generateSitePromoVideo({ workspaceRoot: vBuilt.dir, projectId, target, onPhase: (ph) => { phases.push(ph); vWrite({ type: "phase", phase: ph }); } });
          if (!result.ok) {
            vFinish({ status: "error", ok: false, error: result.reason ?? "falha ao gerar o vídeo.", reason: result.reason ?? null, checks: result.checks ?? [], issues: result.issues ?? [], phases });
            return;
          }
          vFinish({
            status: "ready",
            ok: true,
            duration: result.duration ?? null,
            width: result.width ?? null,
            height: result.height ?? null,
            fileSize: result.fileSize ?? null,
            codec: result.codec ?? "h264",
            videoUrl: `/artifacts/branding/${projectId}/video/current.mp4`,
            posterUrl: result.posterRelPath ? `/artifacts/branding/${projectId}/${result.posterRelPath}` : null,
            checks: result.checks ?? [],
            phases,
          });
        } catch (e) {
          vFinish({ status: "error", ok: false, error: e instanceof Error ? e.message : "erro ao gerar o vídeo.", checks: [], issues: [], phases });
        } finally {
          if (vBuilt?.temp) { try { rmSync(vBuilt.temp, { recursive: true, force: true }); } catch { /* noop */ } }
        }
        return;
      }

      if (url.pathname === "/git" && req.method === "POST") {
        // Git REAL do workspace do projeto (Fase 6). Operações controladas e
        // scoped: nunca shell livre, nunca fora do root, nunca segredos.
        const body = await readJson(req);
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para operações Git.", 401); return; }
        if (identity.pid && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        // C4: o novo Git UX é exclusivo de projetos React (static usa versões internas).
        if (String(body.projectKind ?? "") !== "react") {
          send(res, 400, { ok: false, error: "Git do Studio é exclusivo de project_kind=react." });
          return;
        }
        const action = String(body.action ?? "").trim();
        const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        // Serializa por projeto: uma operação de Git NÃO materializa o workspace
        // enquanto um /run (Coder) está escrevendo nele.
        await withWorkspaceLock(projectId || "default", async () => {
          const root = ensureWorkspaceDir(projectId || "default", files);
          try {
            let payload: unknown;
            if (action === "status" || action === "ensure") {
              const ensured = await ensureGitRepo(root);
              payload = ensured.ok ? { ...(await gitStatus(root)), created: ensured.created } : { ok: false, repo: true, clean: false, entries: [], error: ensured.error };
            } else if (action === "log") {
              const ensured = await ensureGitRepo(root);
              payload = ensured.ok ? await gitLog(root, Number(body.limit) || 50) : { ok: false, repo: true, commits: [], error: ensured.error };
            } else if (action === "diff") {
              await ensureGitRepo(root);
              payload = await gitDiff(root, { from: body.from as string | undefined, to: body.to as string | undefined, path: body.path as string | undefined });
            } else if (action === "show") {
              await ensureGitRepo(root);
              payload = await gitShow(root, { hash: String(body.hash ?? ""), path: String(body.path ?? "") });
            } else if (action === "commit") {
              const provided = String(body.message ?? "").trim();
              const wsFiles = Object.keys(readWorkspace(root));
              const message = deriveCommitMessage({
                files: wsFiles,
                summary: provided || (typeof body.summary === "string" ? body.summary : undefined),
                instruction: typeof body.instruction === "string" ? body.instruction : undefined,
              });
              payload = await gitCommit(root, message);
            } else if (action === "restore") {
              payload = await gitRestore(root, { hash: String(body.hash ?? ""), path: body.path as string | undefined, message: body.message as string | undefined });
            } else {
              payload = { ok: false, error: `ação git desconhecida: ${action || "(vazia)"}` };
            }
            send(res, 200, payload);
          } catch (e) {
            send(res, 500, { ok: false, error: e instanceof Error ? e.message : "erro no git" });
          }
        });
        return;
      }

      if (url.pathname === "/build" && req.method === "POST") {
        // Build de PRODUÇÃO real do projeto React (C5) — no workspace do runtime,
        // com o script permitido pelo próprio package.json (nunca comando do cliente).
        const body = await readJson(req);
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para build.", 401); return; }
        if (identity.pid && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        if (String(body.projectKind ?? "") !== "react") {
          send(res, 400, { ok: false, error: "build é exclusivo de project_kind=react." });
          return;
        }
        const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        await withWorkspaceLock(projectId || "default", async () => {
          const root = ensureWorkspaceDir(projectId || "default", files);
          try {
            const result = await buildReactProject(root);
            send(res, 200, {
              ok: result.ok,
              html: result.html ?? null,
              error: result.error ?? null,
              log: (result.log ?? "").slice(0, 20_000),
            });
          } catch (e) {
            send(res, 500, { ok: false, error: e instanceof Error ? e.message : "erro no build" });
          }
        });
        return;
      }

      if (url.pathname === "/visual-edit" && req.method === "POST") {
        // Visual edit (C3) para projetos React: tenta a alteração DETERMINÍSTICA
        // e segura; se não for inequívoca, devolve handoff para o Coder (C1).
        const body = await readJson(req);
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para edição visual.", 401); return; }
        if (identity.pid && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        if (String(body.projectKind ?? "") !== "react") {
          send(res, 400, { ok: false, applied: false, error: "visual-edit é exclusivo de project_kind=react." });
          return;
        }
        const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        await withWorkspaceLock(projectId || "default", async () => {
          const root = ensureWorkspaceDir(projectId || "default", files);
          const outcome = applyDeterministicVisualEdit(root, {
            file: typeof body.file === "string" ? body.file : undefined,
            line: typeof body.line === "number" ? body.line : undefined,
            selector: typeof body.selector === "string" ? body.selector : undefined,
            tagName: typeof body.tagName === "string" ? body.tagName : undefined,
            classes: Array.isArray(body.classes) ? (body.classes as string[]) : undefined,
            text: typeof body.text === "string" ? body.text : undefined,
            newText: typeof body.newText === "string" ? body.newText : undefined,
            changes: Array.isArray(body.changes) ? (body.changes as Array<{ property: string; value: string }>) : undefined,
            scope: typeof body.scope === "string" ? body.scope : undefined,
          });
          send(res, 200, outcome);
        });
        return;
      }

      if (url.pathname === "/run" && req.method === "POST") {
          const body = await readJson(req);
          const instruction = String(body.instruction ?? "").trim();
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
          const conversationId = typeof body.conversationId === "string" && body.conversationId.trim() ? body.conversationId.trim() : "";
          const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
          if (!identity) { sendDenied(res, "Autenticação necessária para executar o agente.", 401); return; }
          if (!instruction) { send(res, 400, { error: "instruction é obrigatória" }); return; }
          if (identity.pid && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
          const stream = body.stream === true; // NDJSON ao vivo (5.34)
          // Orquestração Router→(Planner)→Coder do Studio (Fase 2). O agente
          // legado continua exatamente igual quando `orchestrate` não é enviado.
          const orchestrate = body.orchestrate === true;
          const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
          const rExec = executionConfig(body);
          if (rExec.provider && !["deepseek", "openai", "nvidia", "openrouter", "gemini", "ollama"].includes(rExec.provider)) {
            send(res, 400, { error: `Provedor "${rExec.provider}" não é suportado pelo runtime (use deepseek, openai, nvidia, openrouter, gemini ou ollama).` });
            return;
          }
        const business = (body.context && typeof body.context === "object" ? body.context : {}) as BusinessContext;
        const memory = Array.isArray(body.memory) ? (body.memory as unknown[]).filter((x): x is string => typeof x === "string") : [];
        // CONTEXTO PERSISTENTE do projeto (memória + histórico de alterações).
        // Carregado do banco por projectId → sobrevive a fechar/reabrir a aplicação.
        const persistedContext = await loadProjectContext(identity.uid, projectId, identity);
        const mergedMemory = [...persistedContext.memory, ...memory];
        const recentConversation = Array.isArray(body.conversation) ? (body.conversation as unknown[]).filter((x): x is string => typeof x === "string") : [];
        const fresh = body.fresh === true; // força nova sessão (novo foco)

        pruneSessions();

        // Resolve a sessão existente OU cria uma nova (ISOLADA POR USUÁRIO+PROJETO).
        // EDIÇÕES CIRÚRGICAS começam sessão NOVA (contexto compacto): continuar a
        // conversa da geração reenvia o histórico inteiro a cada turno — a causa
        // medida da lentidão em edições simples.
        const surgicalEdit = isSurgicalEditTask(instruction);
        const existing = fresh || surgicalEdit ? undefined : sessions.get(editKey(identity.uid, projectId, conversationId || undefined));
        let agent: ProspectorSiteAgent;
        let resume = false;

        // PROVA REAL da IA que será usada nesta execução: resolve antes da
        // sessão. Se a config mudou desde a última mensagem (outro provider/
        // modelo/chave validado), a sessão ANTIGA é descartada e uma nova é
        // criada com a IA correta — nunca continua no DeepSeek por inércia.
        const exec = await prepareExec(body, identity.uid, identity);
        // PRINCÍPIO ABSOLUTO: sem prova da IA validada → NÃO executa.
        if (exec.blocked) {
          send(res, 200, {
            status: "error",
            error: exec.blocked.message,
            errors: [exec.blocked.message],
            blocked_reason: exec.blocked.message,
            blocked_code: exec.blocked.code,
            runtime: "cline",
            changed: false,
            touched: [],
            files,
            provider: null,
            model: null,
            config_source: "blocked",
          });
          return;
        }
        // ===== C1: projeto React → StudioTeam (Coder-first + Planner-only).
        // NÃO usa o Router heurístico nem o ProspectorSiteAgent. O fluxo static
        // segue exatamente igual logo abaixo. =====
        if (String(body.projectKind ?? "") === "react") {
          // Serializa por projeto: /build, /git, /visual-edit e autosave não
          // materializam o workspace enquanto o Coder está escrevendo nele.
          await withWorkspaceLock(projectId, async () => {
          const root = ensureWorkspaceDir(projectId, files);
          const writeLine = (obj: unknown) => { if (!stream) return; try { res.write(`${JSON.stringify(obj)}\n`); } catch { /* cliente desconectou */ } };
          // ATIVIDADE REAL para o card do chat: cada evento do time (ferramenta
          // chamada pelo modelo / frase do próprio modelo) vira uma linha
          // humanizada com a AÇÃO e o ARQUIVO daquele momento — nada de texto
          // pronto. Nunca expõe nome de ferramenta.
          const emit = (obj: Record<string, unknown>) => {
            writeLine(obj);
            try {
              const line = activityForEvent(obj as never);
              if (line) writeLine({ type: "activity", phase: line.phase, detail: line.detail });
            } catch { /* nunca derruba o stream por causa do indicador */ }
          };
          const emitFiles = () => { try { writeLine({ type: "files_ready", files: readWorkspace(root) }); } catch { /* noop */ } };
          if (stream) {
            res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
            writeLine({ type: "start", runtime: "studio-team" });
          }
          try {
            // IMAGENS REAIS: valida as URLs (HTTP) antes de levá-las ao site — mas
            // de forma NÃO-FATAL e com timeout: se demorar/falhar, seguimos com as
            // imagens originais (a geração NUNCA cai por causa disso).
            const businessForRun = await validateBusinessImages(business);
            // C6: materializa anexos (imagem vira contexto visual real; PDF/arquivo
            // fica como referência). Nunca embute data URL gigante no chat.
            const attachResult = materializeAttachments(root, (body.attachments ?? []) as ChatAttachment[]);
            const attachBlock = attachResult.attachments.length || attachResult.errors.length
              ? `\nANEXOS DO USUÁRIO (arquivos reais no workspace):\n${attachResult.attachments.map((a) => `- ${a.path} (${a.mediaType}, ${a.bytes} bytes)`).join("\n")}\nImagens estão no seu contexto visual; PDFs/binários são referência de arquivo (se não puder interpretar, diga isso — nunca invente).\n${attachResult.errors.length ? `Anexos rejeitados (segurança):\n- ${attachResult.errors.join("\n- ")}\n` : ""}`
              : "";
            // ===== MOTOR ANTIGO (ProspectorSiteAgent) NO COMANDO DO CAMINHO REACT =====
            // Recuperado do commit 652dd1d: UM único agente, loop próprio, até
            // `maxIterations` (padrão 40), tool calling real e conclusão decidida
            // pelo PRÓPRIO motor (decideFinishBlock/classifyCompletion/isBugReport/
            // replyAsksForCode). O StudioTeam (Coder/Planner/selector) e os guards de
            // conclusão deixam de controlar este fluxo; `design_skills`/`visual_verify`
            // seguem disponíveis como FERRAMENTAS para o agente decidir quando usar.
            const currentFiles = readWorkspace(root);
            const firstGen = isBootstrapProject(currentFiles) || Object.keys(currentFiles).length === 0;
            // ===== CONVERSA PURA ("oi, boa noite", "tudo bem?") =====
            // Se a mensagem NÃO pede alteração e o projeto já existe, o agente apenas
            // RESPONDE: nenhuma ferramenta, nenhuma edição, nenhuma automação. Se a
            // conversa falhar no provider, seguimos o fluxo normal (nunca travamos).
            if (!firstGen && !instructionRequestsChange(instruction)) {
              const chatSystem = [
                "Você é o parceiro de conversa do usuário dentro do Studio de sites.",
                "- Responda SEMPRE em português do Brasil, curto e natural (2 a 4 frases).",
                "- Agora é só conversa: NÃO edite arquivos, não cite ferramentas nem etapas internas.",
                businessForRun.name ? `- Projeto do cliente: ${businessForRun.name}${businessForRun.segment ? ` (${businessForRun.segment})` : ""}${businessForRun.city ? ` — ${businessForRun.city}${businessForRun.state ? `/${businessForRun.state}` : ""}` : ""}.` : "",
                "- Se o usuário quiser mudar algo no site, diga que pode fazer e pergunte o que ele quer alterar.",
              ].filter(Boolean).join("\n");
              const chatUser = recentConversation.length
                ? `CONVERSA RECENTE:\n${recentConversation.slice(-6).join("\n")}\n\nMENSAGEM ATUAL DO USUÁRIO:\n${instruction}`
                : instruction;
              const chat = await callModelWithTools({
                providerId: exec.providerId,
                modelId: exec.modelId,
                apiKey: exec.apiKey,
                baseUrl: exec.baseUrl,
                system: chatSystem,
                messages: [{ role: "user", content: chatUser }],
                tools: [],
                maxTokens: 800,
                temperature: 0.6,
              }).catch(() => null);
              const chatReply = chat?.ok ? (chat.turn?.text ?? "").trim() : "";
              if (chatReply) {
                const payload = {
                  status: "ok",
                  reply: chatReply,
                  changed: false,
                  no_file_changes: true,
                  touched: [],
                  files: currentFiles,
                  plan: null,
                  iterations: 0,
                  model: exec.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
                  provider: exec.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
                  config_source: exec.source,
                  runtime: "conversation",
                  orchestrated: false,
                };
                if (stream) {
                  writeLine({ type: "complete", ...payload, timestamp: Date.now() });
                  writeLine({ type: "result", ...payload });
                  res.end();
                } else {
                  send(res, 200, payload);
                }
                return;
              }
            }
            writeLine({ type: "activity", phase: "analyzing", detail: firstGen ? "Analisando o negócio e montando o site…" : "Analisando o projeto para aplicar o pedido…" });
            const mediaBlockForRun = mediaContextBlock(businessForRun);
            const creativeBrief = (firstGen && (exec.apiKey || exec.providerId))
              ? await generateCreativeBrief({
                  model: callModelWithTools,
                  ai: { providerId: exec.providerId, modelId: exec.modelId, apiKey: exec.apiKey, baseUrl: exec.baseUrl },
                  business: businessForRun,
                }).catch(() => "")
              : "";
            const mission = [
              instruction,
              creativeBrief ? `BRIEFING CRIATIVO DESTE CLIENTE (decisão da IA — direção principal; implemente isto):\n${creativeBrief}` : "",
              mediaBlockForRun,
            ].filter(Boolean).join("\n\n");
            const oldAgent = await makeAgent(
              `react:${identity.uid}:${projectId}:${conversationId ?? "default"}`,
              projectId,
              currentFiles,
              businessForRun,
              { ...body, mode: firstGen ? "generate" : "edit" },
              exec,
              { hasBase: !firstGen },
            );
        let outcome = await oldAgent.runTask(mission, { continueSession: !firstGen });
            // Atividade REAL do agente antigo (traço da missão) para o card do chat.
            if (Array.isArray(outcome.activity)) {
              for (const a of outcome.activity.slice(-20)) { try { writeLine({ type: "activity", phase: a.phase, detail: a.detail }); } catch { /* noop */ } }
            }
            const mapFixed = (() => { try { return normalizeWorkspaceMapEmbeds(root, business); } catch { return [] as string[]; } })();
            const finalFiles = readWorkspace(root);
            if (mapFixed.length > 0) emitFiles();
            const touched = [...new Set([...(outcome.touched ?? []), ...mapFixed])];
            const payload = {
              status: outcome.ok ? "ok" : "error",
              reply: outcome.reply,
              error: outcome.error,
              errors: outcome.error ? [outcome.error] : undefined,
              changed: touched.length > 0,
              no_file_changes: touched.length === 0,
              touched,
              files: finalFiles,
              plan: null,
              iterations: outcome.iterations ?? 0,
              model: exec.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
              provider: exec.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
              config_source: exec.source,
              runtime: "prospector-site-agent",
              orchestrated: false,
            };
            if (stream) {
              writeLine({ type: "files_ready", files: finalFiles });
              writeLine({ type: "complete", ...payload, timestamp: Date.now() });
              writeLine({ type: "result", ...payload });
              res.end();
            } else {
              send(res, 200, payload);
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const safeFiles = (() => { try { return readWorkspace(root); } catch { return {} as Record<string, string>; } })();
            const payload = { status: "error", error: message, errors: [message], changed: false, no_file_changes: true, touched: [], files: safeFiles, runtime: "studio-team" };
            if (stream) { writeLine({ type: "error", message }); writeLine({ type: "result", ...payload }); res.end(); }
            else send(res, 200, payload);
          }
          }).catch((e) => {
            // Falha ANTES/depois do try interno (ex.: materializar o workspace ou
            // stream já iniciado): o cliente NUNCA pode terminar sem um `result`,
            // senão o front mostra "Stream terminou sem resultado" e descarta a
            // entrega real.
            const message = e instanceof Error ? e.message : String(e);
            if (stream) {
              try {
                const filesNow = (() => { try { return readWorkspace(resolveWorkspaceRoot(projectId)); } catch { return {} as Record<string, string>; } })();
                res.write(`${JSON.stringify({ type: "result", status: "error", error: message, errors: [message], changed: false, no_file_changes: true, touched: [], files: filesNow, runtime: "studio-team" })}\n`);
              } catch { /* conexão encerrada */ }
              try { res.end(); } catch { /* noop */ }
            } else {
              send(res, 200, { status: "error", error: message, errors: [message], changed: false, touched: [], files, runtime: "studio-team" });
            }
          });
          return;
        }

        const providerChanged = !!(existing && existing.agent && existing.execKey !== exec.key);
        if (existing && existing.agent && !providerChanged) {
          agent = existing.agent;
          resume = true;
          existing.lastActive = Date.now();
          // Garante que o workspace em disco reflita o estado enviado pelo front.
          // (arquivos podem ter mudado entre sessões por materialização de spec)
          ensureWorkspaceDir(projectId, files);
        } else {
          if (providerChanged) sessions.delete(editKey(identity.uid, projectId, conversationId || undefined));
          agent = await makeAgent(editKey(identity.uid, projectId, conversationId || undefined), projectId, files, business, body, exec, { branding: needsBrandIdentity(`${String(body.instruction ?? "")} ${JSON.stringify(body.memory ?? [])}`) });
          sessions.set(editKey(identity.uid, projectId, conversationId || undefined), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: exec.key });
        }

        // CANCELAMENTO: se o cliente desconectar no meio, aborta a execução em
        // andamento em vez de continuar consumindo o provider sem ninguém ouvir.
        let cancelled = false;
        res.on("close", () => {
          if (!res.writableEnded) {
            cancelled = true;
            agent.abort("client_disconnect");
          }
        });

        const events: string[] = [];
        const activity: Array<{ phase: string; detail: string }> = [];
        const writeLine = (obj: unknown) => {
          if (!stream) return;
          try { res.write(`${JSON.stringify(obj)}\n`); } catch { /* cliente desconectou */ }
        };
        const emit: (obj: Record<string, unknown>) => void = (obj) => writeLine(obj);
        // `files_ready` com os arquivos reais: no máximo 1x/1.2s durante a run;
        // o evento final `complete` sempre carrega o estado definitivo.
        let lastFilesReadyAt = 0;
        const emitFilesReady = (force = false) => {
          const t = Date.now();
          if (!force && t - lastFilesReadyAt < 1_200) return;
          lastFilesReadyAt = t;
          try {
            writeLine({ type: "files_ready", files: readWorkspace(resolveWorkspaceRoot(projectId)) });
          } catch { /* noop */ }
        };
        agent.subscribe((event) => {
          try {
            events.push((event as { type: string }).type);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const e = event as any;
            const toolCall = e.toolCall ?? {};
            const tool = String(e.toolName ?? toolCall.toolName ?? "");
            const input = toolCall.input ?? {};
            const path = typeof input?.path === "string" ? input.path : typeof input?.file === "string" ? input.file : "";
            const toolCallId = String(toolCall.toolCallId ?? e.toolCallId ?? "");
            if (e.type === "tool-started") {
              if (tool === "read_file" || tool === "list_files" || tool === "get_site_context") {
                activity.push({ phase: "analyzing", detail: path ? `Lendo ${path}` : "Analisando o projeto…" });
                writeLine({ type: "activity", phase: "analyzing", detail: activity[activity.length - 1].detail });
              } else if (tool === "write_file" || tool === "edit_file" || tool === "delete_file") {
                activity.push({ phase: "editing", detail: `Alterando ${path}` });
                writeLine({ type: "activity", phase: "editing", detail: activity[activity.length - 1].detail });
              } else if (tool === "web_search") {
                activity.push({ phase: "researching", detail: "Pesquisando na web…" });
                writeLine({ type: "activity", phase: "researching", detail: activity[activity.length - 1].detail });
              } else if (tool === "visual_review") {
                activity.push({ phase: "verifying", detail: "Análise visual" });
                writeLine({ type: "activity", phase: "verifying", detail: activity[activity.length - 1].detail });
              } else if (tool === "browser_open" || tool === "browser_reload" || tool === "browser_inspect") {
                activity.push({ phase: "verifying", detail: "Verificando o site no navegador" });
                writeLine({ type: "activity", phase: "verifying", detail: activity[activity.length - 1].detail });
              } else if (tool === "finish_task") {
                activity.push({ phase: "done", detail: "Concluindo tarefa…" });
                writeLine({ type: "activity", phase: "done", detail: activity[activity.length - 1].detail });
              }
              // STUDIO (Fase 2): tool_call agrupável no ChatPanel (só no modo orquestrado).
              if (orchestrate && tool) {
                writeLine({ type: "agent_interaction", agent_name: "Coder", message_type: "tool_call", tool_name: tool, tool_arguments: input, tool_call_id: toolCallId, timestamp: Date.now() });
              }
            } else if (e.type === "tool-finished") {
              // STUDIO (Fase 2): tool_response pareado por tool_call_id/índice.
              if (orchestrate && tool) {
                writeLine({ type: "agent_interaction", agent_name: "Coder", message_type: "tool_response", tool_name: tool, tool_call_id: toolCallId, content: truncateText(messageText(e.message)), timestamp: Date.now() });
              }
              if (orchestrate && EDIT_TOOLS.has(tool)) {
                emitFilesReady();
                writeLine({ type: "reload_preview", reason: tool, path, timestamp: Date.now() });
              }
            } else if (e.type === "turn-started") {
              activity.push({ phase: "thinking", detail: "Analisando a alteração…" });
              writeLine({ type: "activity", phase: "thinking", detail: activity[activity.length - 1].detail });
              // RACIOCÍNIO visível no chat em TODOS os caminhos (React inclusive):
              // o painel unificado mostra isso enquanto o agente pensa e recolhe
              // quando a resposta final chega.
              writeLine({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: "Analisando a alteração…", iteration: e.iteration, timestamp: Date.now() });
            } else if (e.type === "assistant-message") {
              const text = messageText(e.message);
              if (text) writeLine({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: truncateText(text), iteration: e.iteration, timestamp: Date.now() });
            } else if (e.type === "turn-finished") {
              if (orchestrate) emitFilesReady(true);
            }
          } catch { /* noop */ }
        });

        const memoryBlock = mergedMemory.length ? `\nMEMÓRIA DE DECISÕES (preserve):\n- ${mergedMemory.join("\n- ")}\n` : "";
        // Histórico estruturado de alterações + conversa recente (continuidade em
        // conversas longas SEM reenviar o chat inteiro ao modelo).
        const changesBlock = renderProjectContextBlock({ memory: [], changes: persistedContext.changes });
        const conversationBlock = recentConversation.length ? `\nCONVERSA RECENTE (contexto de continuidade):\n${recentConversation.map((c) => `- ${c}`).join("\n")}\n` : "";

        // ANEXOS (5.26): materializa arquivos anexados no workspace para o Cline
        // acessar/ler/usar de verdade. Nunca apenas dataURL.
        const attachments = (body.attachments ?? []) as ChatAttachment[];
        const attachResult = materializeAttachments(resolveWorkspaceRoot(projectId), attachments);
        const attachBlock = attachResult.attachments.length || attachResult.errors.length
          ? `\nANEXOS DO USUÁRIO (arquivos reais no workspace — você pode ler/usar):\n${attachResult.attachments.map((a) => `- ${a.path} (${a.mediaType}, ${a.bytes} bytes)`).join("\n")}\nPara usar uma imagem do usuário no site: referencie o arquivo real — <img src="assets/<nome>"> ou background url(...). O preview do produto embute o asset automaticamente; NÃO embuta o data URL gigante inline (deixa o HTML enorme e quebra edições futuras).\nPRESERVE A TRANSPARÊNCIA de logos/PNG sem fundo — nunca adicione fundo preto/branco atrás da imagem, não converta para JPG e não envolva o logo em caixa escura.\nReutilizar a MESMA foto do usuário em vários pontos (hero + cards + sobre) é ESPERADO e permitido quando o usuário pedir.\n${attachResult.errors.length ? `Anexos rejeitados (segurança):\n- ${attachResult.errors.join("\n- ")}\n` : ""}`
          : "";

        if (stream) {
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
          });
          writeLine({ type: "start", runtime: "cline", resumed_session: resume });
        }

        const contextPrefix = `${memoryBlock}${changesBlock}${conversationBlock}${attachBlock}`;
        let outcome: AgentRunOutcome;
        if (orchestrate) {
          // Studio (Fase 2): Router → (Planner) → Coder. O Coder é o MESMO
          // ProspectorSiteAgent (guardas preservados); o Planner é modelo sem tools.
          const root = resolveWorkspaceRoot(projectId);
          const orchestration = await runStudioOrchestration({
            instruction,
            mode: "edit",
            contextPrefix,
            filePaths: Object.keys(readWorkspace(root)),
            business,
            memory: mergedMemory,
            recentChanges: persistedContext.changes.map((c) => c.summary).filter(Boolean),
            ai: { providerId: exec.providerId, modelId: exec.modelId, apiKey: exec.apiKey, baseUrl: exec.baseUrl },
            continueSession: resume,
            runCoder: (prompt, opts) => agent.runTask(prompt, opts),
            emit,
            isCancelled: () => cancelled,
          });
          outcome = orchestration.outcome ?? {
            ok: false,
            reply: orchestration.cancelled ? "Execução cancelada antes de concluir." : "A execução não produziu resultado.",
            files: readWorkspace(root),
            touched: [],
            iterations: 0,
            events: [],
            error: orchestration.cancelled ? "cancelado" : "sem resultado",
          };
        } else {
          outcome = await agent.runTask(`${contextPrefix}${instruction}`, { continueSession: resume });
        }

        // Persiste transcript da conversa (best-effort, não bloqueia resposta)
        if (conversationId && outcome.conversationMessages) {
          void saveConversation(
            identity.uid, projectId, conversationId,
            outcome.conversationMessages,
            outcome.touched ?? [],
            exec.modelId, exec.providerId,
            identity,
          );
        }

        // HISTÓRICO DE ALTERAÇÕES + MEMÓRIA do projeto (persistente): registra a
        // alteração aplicada para permitir referências futuras ("volta como estava",
        // "mantém o tamanho que definimos", "usa a cor daquela seção").
        if (outcome.ok && (outcome.touched ?? []).length > 0) {
          const summary = String(outcome.reply ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "alteração aplicada";
          const entry = makeChangeEntry(instruction, outcome.touched ?? [], summary, new Date().toISOString());
          const nextChanges = appendChange(persistedContext.changes, entry);
          const nextMemory = appendMemory(mergedMemory, memoryLineFromChange(entry));
          void saveProjectContext(identity.uid, projectId, { memory: nextMemory, changes: nextChanges }, identity, exec.modelId, exec.providerId);
        }

        // workspace final
        const root = resolveWorkspaceRoot(projectId);
        // Pedido de correção de DEFEITO → auditoria de interação (clique não pode
        // deixar a tela preta). Correções feitas aqui já entram nos arquivos finais.
        const interaction = isBugReport(instruction)
          ? await runInteractionGate(agent, root, activity)
          : { ok: true, tested: 0, issues: [] as string[], cycles: 0 };
        // Trava de entrega: se a auditoria de interação NÃO passou depois dos
        // ciclos de correção, o runtime NÃO entrega como concluído.
        const interactionBlocked = interaction.cycles > 0 && !interaction.ok;
        const finalFiles = readWorkspace(root);
        const touched = outcome.touched;
        const changed = touched.length > 0 || interaction.cycles > 0;

        const payload = {
          status: cancelled ? "error" : interactionBlocked ? "error" : (outcome.ok ? "ok" : "error"),
          cancelled: cancelled || undefined,
          reply: cancelled
            ? "Execução cancelada antes de concluir."
            : interactionBlocked
              ? `⚠ Não concluído: ${interaction.issues[0] ?? "alguns cliques deixam a tela preta"}. A auditoria automática de interação não passou mesmo após a correção. Continue pedindo o ajuste que eu tento de novo (o site NÃO foi entregue como corrigido).`
              : outcome.reply,
          error: cancelled
            ? "Execução cancelada pelo cliente."
            : interactionBlocked
              ? "A auditoria de interação detectou tela preta/overlay ao clicar e a correção automática não resolveu. Entrega bloqueada até nova validação."
              : outcome.error,
          errors: interactionBlocked ? interaction.issues.slice(0, 5) : undefined,
          interaction_blocked: interactionBlocked || undefined,
          changed,
          touched,
          files: finalFiles,
          model: exec.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
          provider: exec.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          config_source: exec.source,
          config_warning: exec.warning ?? null,
          provider_changed: providerChanged,
          runtime: "cline",
          orchestrated: orchestrate || undefined,
          attachments: attachResult.attachments,
          attach_errors: attachResult.errors,
          interaction,
          resumed_session: resume,
          timing: outcome.timing,
          events: events.slice(0, 150),
          activity,
        };
        if (stream) {
          // Evento terminal do Studio (Fase 2): fronteira explícita de conclusão,
          // para o chat nunca associar a resposta a uma execução anterior. Só é
          // emitido no modo orquestrado (legado continua recebendo apenas `result`).
          if (orchestrate) writeLine({ type: "complete", ...payload, timestamp: Date.now() });
          writeLine({ type: "result", ...payload });
          res.end();
        } else {
          send(res, 200, payload);
        }
        return;
      }

      send(res, 404, { error: "rota não encontrada" });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "erro inesperado";
      if (genStreamStarted && genStreamFinish) {
        try { genStreamFinish({ status: "error", error: errMsg, reply: `Falha na geração: ${errMsg}`, changed: false, files: {}, runtime: "cline", mode: "generate" }); } catch { try { res.end(); } catch { /* noop */ } }
      } else {
        send(res, 500, { error: errMsg });
      }
    }
  });

  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[prospector-agent-runtime] ouvindo em http://${host}:${port}`);
  });
  return server;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  startServer();
}
