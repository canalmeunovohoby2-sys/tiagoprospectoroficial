// Servidor HTTP do Prospector Agent Runtime.
// Expoe /health e /run (JSON). Roda em Node (fora do front e do edge Deno).
// Uso: PROSPECTOR_API_KEY=... npx tsx src/server.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ProspectorSiteAgent, type AgentRunOutcome } from "./prospector-site-agent";
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace } from "./workspace";
import type { BusinessContext } from "./tools";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

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

export function startServer(port = PORT, host = HOST) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    try {
      if (url.pathname === "/health") {
        send(res, 200, { ok: true, provider: process.env.PROSPECTOR_PROVIDER ?? "deepseek", hasKey: !!(process.env.DEEPSEEK_API_KEY ?? process.env.PROSPECTOR_API_KEY) });
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

        const root = ensureWorkspaceDir(projectId, files);
        const agent = new ProspectorSiteAgent({
          workspaceRoot: root,
          business,
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
          baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
          modelId: typeof body.modelId === "string" ? body.modelId : undefined,
          providerId: typeof body.providerId === "string" ? body.providerId : undefined,
          maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : undefined,
          initialFiles: files,
        });

        const events: string[] = [];
        agent.subscribe((event) => {
          try { events.push(event.type); } catch { /* noop */ }
        });

        const memoryBlock = memory.length ? `\nMEMÓRIA DE DECISÕES (preserve):\n- ${memory.join("\n- ")}\n` : "";
        const outcome: AgentRunOutcome = await agent.runTask(`${memoryBlock}${instruction}`);
        const finalFiles = outcome.files;
        const touched = outcome.touched;
        cleanupWorkspace(projectId);

        send(res, 200, {
          status: outcome.ok ? "ok" : "error",
          reply: outcome.reply,
          error: outcome.error,
          changed: touched.length > 0,
          touched,
          files: finalFiles,
          model: process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
          provider: process.env.PROSPECTOR_PROVIDER ?? "deepseek",
          events: events.slice(0, 120),
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

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("server.ts")) {
  startServer();
}
