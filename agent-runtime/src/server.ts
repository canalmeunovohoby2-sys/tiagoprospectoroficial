// Servidor HTTP do Prospector Agent Runtime.
// Expoe /health e /run (JSON). Roda em Node (fora do front e do edge Deno).
// Uso: PROSPECTOR_API_KEY=... npx tsx src/server.ts
//
// SESSÃO PERSISTENTE POR PROJETO: um Agent (Cline) fica vivo por projectId em
// memória; cada nova mensagem chama agent.continue() para manter o contexto.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ProspectorSiteAgent } from "./prospector-site-agent";
import { ensureWorkspaceDir, readWorkspace, resolveWorkspaceRoot } from "./workspace";
import type { BusinessContext } from "./tools";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

interface AgentSession {
  agent: ProspectorSiteAgent;
  projectId: string;
  lastActive: number;
  resetToken: string; // altera quando o usuário pede "começar do zero"/novo foco
}

const sessions = new Map<string, AgentSession>();
const SESSION_TTL_MS = 30 * 60_000; // 30min de inatividade encerra a sessão
const MAX_SESSIONS = 40;

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

function makeAgent(sessionKey: string, projectId: string, files: Record<string, string>, business: BusinessContext, body: Record<string, unknown>): ProspectorSiteAgent {
  const root = ensureWorkspaceDir(projectId, files);
  return new ProspectorSiteAgent({
    workspaceRoot: root,
    business,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    modelId: typeof body.modelId === "string" ? body.modelId : undefined,
    providerId: typeof body.providerId === "string" ? body.providerId : undefined,
    maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : undefined,
    initialFiles: files,
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
        });
        return;
      }

      if (url.pathname === "/session" && req.method === "DELETE") {
        const body = (await readJson(req).catch(() => ({}))) as Record<string, unknown>;
        const projectId = String(body.projectId ?? "").trim();
        if (projectId) sessions.delete(projectId);
        send(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/run" && req.method === "POST") {
        const body = await readJson(req);
        const instruction = String(body.instruction ?? "").trim();
        const projectId = String(body.projectId ?? body.sessionId ?? "default").trim();
        if (!instruction) { send(res, 400, { error: "instruction é obrigatória" }); return; }
        const files = (body.files && typeof body.files === "object" ? body.files as Record<string, string> : {});
        const business = (body.context && typeof body.context === "object" ? body.context : {}) as BusinessContext;
        const memory = Array.isArray(body.memory) ? (body.memory as unknown[]).filter((x): x is string => typeof x === "string") : [];
        const fresh = body.fresh === true; // força nova sessão (novo foco)

        pruneSessions();

        // Resolve a sessão existente OU cria uma nova.
        const existing = fresh ? undefined : sessions.get(projectId);
        let agent: ProspectorSiteAgent;
        let resume = false;

        if (existing && existing.agent) {
          agent = existing.agent;
          resume = true;
          existing.lastActive = Date.now();
          // Garante que o workspace em disco reflita o estado enviado pelo front.
          // (arquivos podem ter mudado entre sessões por materialização de spec)
          ensureWorkspaceDir(projectId, files);
        } else {
          agent = makeAgent(projectId, projectId, files, business, body);
          sessions.set(projectId, { agent, projectId, lastActive: Date.now(), resetToken: "" });
        }

        const events: string[] = [];
        const activity: Array<{ phase: string; detail: string }> = [];
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
              } else if (tool === "write_file" || tool === "edit_file") {
                activity.push({ phase: "editing", detail: `Alterando ${path}` });
              } else if (tool === "finish_task") {
                activity.push({ phase: "done", detail: "Concluído" });
              }
            } else if (e.type === "turn-finished") {
              activity.push({ phase: "reviewing", detail: "Revisando o resultado…" });
            }
          } catch { /* noop */ }
        });

        const memoryBlock = memory.length ? `\nMEMÓRIA DE DECISÕES (preserve):\n- ${memory.join("\n- ")}\n` : "";
        const outcome = await agent.runTask(`${memoryBlock}${instruction}`, { continueSession: resume });

        // workspace final
        const root = resolveWorkspaceRoot(projectId);
        const finalFiles = readWorkspace(root);
        const touched = outcome.touched;

        send(res, 200, {
          status: outcome.ok ? "ok" : "error",
          reply: outcome.reply,
          error: outcome.error,
          changed: touched.length > 0,
          touched,
          files: finalFiles,
          model: process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
          provider: process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          runtime: "cline",
          resumed_session: resume,
          events: events.slice(0, 150),
          activity,
        });
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
