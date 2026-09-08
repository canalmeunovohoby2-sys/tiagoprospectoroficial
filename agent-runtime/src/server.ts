// Servidor HTTP do Prospector Agent Runtime.
// Expoe /health e /run (JSON). Roda em Node (fora do front e do edge Deno).
// Uso: PROSPECTOR_API_KEY=... npx tsx src/server.ts
//
// SESSÃO PERSISTENTE POR PROJETO: um Agent (Cline) fica vivo por projectId em
// memória; cada nova mensagem chama agent.continue() para manter o contexto.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ProspectorSiteAgent, isSurgicalEditTask } from "./prospector-site-agent.js";
import { BrowserSession } from "./browser-session.js";
import { auditSiteInteractions } from "./interaction-audit.js";
import { isBugReport } from "./completion-guard.js";
import { ensureWorkspaceDir, readWorkspace, resolveWorkspaceRoot, cleanupWorkspace } from "./workspace.js";
import type { BusinessContext } from "./tools.js";
import { assertGenerationQuality } from "./generation-gate.js";
import { buildCreativeBrief, formatCreativeBrief } from "./creative-direction.js";
import { materializeAttachments, type ChatAttachment } from "./attachments.js";
import { researchBusiness, formatResearch, type ResearchOutcome } from "./research.js";
import { trimConversationWindow } from "./conversation-window.js";

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

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

async function makeAgent(sessionKey: string, projectId: string, files: Record<string, string>, business: BusinessContext, body: Record<string, unknown>, exec?: ResolvedExec): Promise<ProspectorSiteAgent> {
  const root = ensureWorkspaceDir(projectId, files);
  const resolved = exec ?? await prepareExec(body, undefined);
  const apiKey = resolved.apiKey ?? (typeof body.apiKey === "string" ? body.apiKey : undefined);
  const baseUrl = resolved.baseUrl ?? (typeof body.baseUrl === "string" ? body.baseUrl : undefined);

  return new ProspectorSiteAgent({
    workspaceRoot: root,
    business,
    apiKey,
    baseUrl,
    modelId: resolved.modelId,
    providerId: resolved.providerId,
    maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : Math.min(80, Math.max(8, Number(process.env.AGENT_MAX_ITERATIONS ?? 40))),
    initialFiles: files,
    mode: typeof body.mode === "string" ? (body.mode as "edit" | "generate") : "edit",
    enableBrowser: body.enableBrowser !== false,
    initialMessages: resolved.initialMessages?.length ? trimConversationWindow(resolved.initialMessages) : undefined,
  });
}

export function startServer(port = PORT, host = HOST) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

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
        const session = new BrowserSession(root);
        const toDataUrl = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
        const err = (e: unknown) => send(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
        try {
          const base = await session.startServer();
          await session.open(base, { width: 1366, height: 850 });
          await new Promise((r) => setTimeout(r, 300));
          const desktop = await session.screenshot("desktop", { fullPage: false });
          await session.setViewport(390, 844);
          await session.reload();
          await new Promise((r) => setTimeout(r, 600));
          const mobile = await session.screenshot("mobile", { fullPage: false });
          send(res, 200, { ok: true, desktop: toDataUrl(desktop), mobile: toDataUrl(mobile) });
        } catch (e) {
          err(e);
        } finally {
          await session.close().catch(() => {});
          cleanupWorkspace(pid);
        }
        return;
      }

      if (url.pathname === "/generate" && req.method === "POST") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        const identity = await resolveIdentity(req.headers.authorization, projectId || undefined);
        if (!identity) { sendDenied(res, "Autenticação necessária para gerar o site.", 401); return; }
        if (!projectId) { send(res, 400, { error: "projectId é obrigatório" }); return; }
        if (identity.pid && projectId && identity.pid !== projectId) { sendDenied(res, "Projeto não autorizado para este usuário.", 403); return; }
        const business = (body.context && typeof body.context === "object" ? body.context : {}) as BusinessContext;
        const briefing = (body.briefing && typeof body.briefing === "object" ? body.briefing : {}) as Record<string, unknown>;

        // Missão de geração: workspace limpo (ou arquivos pré-existentes se houver).
        const seed = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        const gExec = executionConfig(body);
        if (gExec.provider && !["deepseek", "openai", "nvidia", "openrouter", "gemini", "ollama"].includes(gExec.provider)) {
            send(res, 400, { error: `Provedor "${gExec.provider}" não é suportado pelo runtime (use deepseek, openai, nvidia, openrouter, gemini ou ollama).` });
          return;
        }
        const genKey = genKeyFor(identity.uid, projectId);
        pruneSessions();
        const existingGen = sessions.get(genKey);
        const genIter = Math.min(80, Math.max(10, Number(body.maxIterations ?? process.env.GENERATE_MAX_ITERATIONS ?? 32)));
        // Browser QA na geração fica LIGADO por padrão (teste de clique sem tela
        // preta, mapa, menu mobile). Para desligar: GENERATE_BROWSER=0 ou envie
        // enableBrowser:false.
        const genBrowser = process.env.GENERATE_BROWSER !== "0" && body.enableBrowser !== false;
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
          : await makeAgent(genKey, projectId, seed, business, { ...body, mode: "generate", maxIterations: genIter, enableBrowser: genBrowser }, genExec);
        sessions.set(genKey, { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });
        sessions.set(editKey(identity.uid, projectId), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });

        // ANEXOS (5.26) na geração: materializa no workspace (ex.: logo/foto real do cliente).
        const attachResult = materializeAttachments(resolveWorkspaceRoot(projectId), (body.attachments ?? []) as ChatAttachment[]);
        const genAttachBlock = attachResult.attachments.length || attachResult.errors.length
          ? `\nANEXOS DO USUÁRIO (arquivos reais no workspace — use se fizerem sentido para o site):\n${attachResult.attachments.map((a) => `- ${a.path} (${a.mediaType}, ${a.bytes} bytes)`).join("\n")}\nPara usar uma imagem do usuário: referencie o arquivo real (<img src="assets/<nome>"> ou background url). O preview embute o asset automaticamente; NÃO embuta o data URL gigante inline.\nPRESERVE A TRANSPARÊNCIA de logos/PNG sem fundo — nunca adicione fundo preto/branco, não converta para JPG e não coloque caixa escura atrás da imagem transparente.\nReutilizar a MESMA foto do usuário em vários pontos é ESPERADO e permitido quando fizer sentido.\n${attachResult.errors.length ? `Anexos rejeitados (segurança):\n- ${attachResult.errors.join("\n- ")}\n` : ""}`
          : "";

        const activity: Array<{ phase: string; detail: string }> = [];
        const events: string[] = [];
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

        const mission = `Crie do zero o site deste negócio, seguindo o fluxo da sua instrução de sistema (analisar → pesquisar quando necessário → direcionar → estruturar → criar código real → auto-revisar → corrigir → finalizar).

CONTEXTO REAL DO NEGÓCIO:
${ctxLines || "(apenas nome de arquivo/nenhum dado além do projeto)"}
${extra}
${genAttachBlock}
${researchBlock}
${formatCreativeBrief(buildCreativeBrief(business.name ?? "", business.segment ?? ""))}

IMPORTANTE: a "Direção criativa sugerida" é apenas um PONTO DE PARTIDA entre muitas direções possíveis — combine-a com a pesquisa e com o que encontrar no negócio. Cada site deve ter identidade, paleta, tipografia, arquitetura e efeitos PRÓPRIOS (nunca copie o mesmo layout de outros projetos). Você tem liberdade para escolher o layout e a direção visual. Use imagens contextuais reais.`;

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
        const genBlocked = !interaction.ok;
        // Move o agente de geração para o pool de edição do mesmo projectId,
        // para que o chat continue a MESMA conversa/sessão após a geração.
        sessions.delete(genKey);
        sessions.set(editKey(identity.uid, projectId), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: genExec.key });

        send(res, 200, {
          status: genBlocked ? "error" : (finalOutcome.ok ? "ok" : "error"),
          reply: finalOutcome.reply,
          error: genBlocked
            ? "O site gerado reprovou na auditoria de interação (clique deixa a tela preta) e a correção automática não resolveu. A entrega foi BLOQUEADA — gere novamente para tentar de novo."
            : finalOutcome.error,
          errors: genBlocked ? interaction.issues.slice(0, 5) : undefined,
          interaction_blocked: genBlocked || undefined,
          changed: true,
          touched: finalOutcome.touched,
          files: finalFiles,
          model: genExec.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
          provider: genExec.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          config_source: genExec.source,
          config_warning: genExec.warning ?? null,
          provider_changed: genProviderChanged,
          runtime: "cline",
          mode: "generate",
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
          const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
          const rExec = executionConfig(body);
          if (rExec.provider && !["deepseek", "openai", "nvidia", "openrouter", "gemini", "ollama"].includes(rExec.provider)) {
            send(res, 400, { error: `Provedor "${rExec.provider}" não é suportado pelo runtime (use deepseek, openai, nvidia, openrouter, gemini ou ollama).` });
            return;
          }
        const business = (body.context && typeof body.context === "object" ? body.context : {}) as BusinessContext;
        const memory = Array.isArray(body.memory) ? (body.memory as unknown[]).filter((x): x is string => typeof x === "string") : [];
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
          agent = await makeAgent(editKey(identity.uid, projectId, conversationId || undefined), projectId, files, business, body, exec);
          sessions.set(editKey(identity.uid, projectId, conversationId || undefined), { agent, projectId, lastActive: Date.now(), resetToken: "", execKey: exec.key });
        }

        const events: string[] = [];
        const activity: Array<{ phase: string; detail: string }> = [];
        const writeLine = (obj: unknown) => {
          if (!stream) return;
          try { res.write(`${JSON.stringify(obj)}\n`); } catch { /* cliente desconectou */ }
        };
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
                activity.push({ phase: "verifying", detail: "Análise visual (Gemini)" });
                writeLine({ type: "activity", phase: "verifying", detail: activity[activity.length - 1].detail });
              } else if (tool === "browser_open" || tool === "browser_reload" || tool === "browser_inspect") {
                activity.push({ phase: "verifying", detail: "Verificando o site no navegador" });
                writeLine({ type: "activity", phase: "verifying", detail: activity[activity.length - 1].detail });
              } else if (tool === "finish_task") {
                activity.push({ phase: "done", detail: "Concluindo tarefa…" });
                writeLine({ type: "activity", phase: "done", detail: activity[activity.length - 1].detail });
              }
            } else if (e.type === "turn-started") {
              activity.push({ phase: "thinking", detail: "Analisando a alteração…" });
              writeLine({ type: "activity", phase: "thinking", detail: activity[activity.length - 1].detail });
            }
          } catch { /* noop */ }
        });

        const memoryBlock = memory.length ? `\nMEMÓRIA DE DECISÕES (preserve):\n- ${memory.join("\n- ")}\n` : "";

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

        const outcome = await agent.runTask(`${memoryBlock}${attachBlock}${instruction}`, { continueSession: resume });

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
          status: interactionBlocked ? "error" : (outcome.ok ? "ok" : "error"),
          reply: interactionBlocked
            ? `⚠ Não concluído: ${interaction.issues[0] ?? "alguns cliques deixam a tela preta"}. A auditoria automática de interação não passou mesmo após a correção. Continue pedindo o ajuste que eu tento de novo (o site NÃO foi entregue como corrigido).`
            : outcome.reply,
          error: interactionBlocked
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
          attachments: attachResult.attachments,
          attach_errors: attachResult.errors,
          interaction,
          resumed_session: resume,
          timing: outcome.timing,
          events: events.slice(0, 150),
          activity,
        };
        if (stream) {
          writeLine({ type: "result", ...payload });
          res.end();
        } else {
          send(res, 200, payload);
        }
        return;
      }

      send(res, 404, { error: "rota não encontrada" });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : "erro inesperado" });
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
