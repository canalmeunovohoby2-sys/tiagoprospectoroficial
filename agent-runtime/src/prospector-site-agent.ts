// ProspectorSiteAgent — wrapper do Cline Agent SDK focado no workspace de um
// Site Project do TiagoProspector. É o "motor de agente": analisa, lê, cria e
// edita os arquivos reais do site; eventos de progresso são expostos para a UI.
import { Agent, createTool } from "@cline/agents";
import type { AgentRuntimeEvent } from "@cline/agents";
import { z } from "zod";
import { buildSiteTools, type BusinessContext } from "./tools";
import { readWorkspace, type FileMap } from "./workspace";

export interface AgentRunOutcome {
  ok: boolean;
  reply: string;
  files: FileMap;               // workspace completo depois da execução
  touched: string[];            // paths alterados nesta execução
  iterations: number;
  events: AgentRuntimeEvent[];
  error?: string;
}

export interface ProspectorAgentOptions {
  workspaceRoot: string;
  business: BusinessContext;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  providerId?: string;
  maxIterations?: number;
  initialFiles?: FileMap;
}

const SYSTEM_PROMPT = `Você é o ProspectorSiteAgent: um SENIOR Web Designer + Art Director + Frontend Engineer que trabalha DENTRO do código real de um site de um pequeno negócio brasileiro.

O projeto é um site estático Vite com estrutura típica:
- index.html — marcação/HTML completo da página
- src/site.css — estilos
- src/main.js — interações
- src/site.json — dados estruturados do negócio (não é o produto: é dado auxiliar)

REGRAS DE TRABALHO:
1. ANTES de editar, use list_files e read_file para entender o estado real dos arquivos.
2. Use write_file (conteúdo completo) ou edit_file (trecho exato) — só altere o necessário e de forma coordenada.
3. Preserve dados factuais do negócio (nome, telefone, endereço) — use get_site_context; NUNCA invente dados.
4. Preserve decisões já aprovadas (se o usuário gostou do header, não o reconstrua sem pedido).
5. Trabalhe como um estúdio: hierarquia, contraste, composição, ritmo, responsividade, sem cara de template/PDF.
6. Para mudanças visuais grandes, pode alterar index.html E src/site.css juntos (multi-file).
7. Ao terminar, resuma em texto curto o que foi feito (reply) — sem expor chain-of-thought.

O site DEVE continuar válido: index.html com <!doctype html>, <style> balanceado, src/site.json JSON válido.`;

export class ProspectorSiteAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any;
  private options: ProspectorAgentOptions;
  private beforeFiles: FileMap = {};

  constructor(options: ProspectorAgentOptions) {
    this.options = options;
    const tools = buildSiteTools({ workspaceRoot: options.workspaceRoot, business: options.business });

    const complete = createTool({
      name: "finish_task",
      description: "Chame quando o trabalho estiver concluído, com um resumo do que foi feito.",
      inputSchema: z.object({ summary: z.string().describe("resumo do que foi alterado no site") }),
      lifecycle: { completesRun: true },
      async execute(input) {
        return JSON.stringify({ summary: input.summary });
      },
    });

    this.beforeFiles = { ...(options.initialFiles ?? {}) };
    this.agent = new (Agent as unknown as new (cfg: Record<string, unknown>) => unknown)({
      providerId: options.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
      modelId: options.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.PROSPECTOR_API_KEY,
      baseUrl: options.baseUrl ?? process.env.PROSPECTOR_BASE_URL ?? "https://api.deepseek.com",
      systemPrompt: SYSTEM_PROMPT,
      tools: [...tools, complete],
      maxIterations: options.maxIterations ?? 40,
    });
  }

  subscribe(listener: (event: AgentRuntimeEvent) => void): () => void {
    return this.agent.subscribe(listener);
  }

  async runTask(instruction: string): Promise<AgentRunOutcome> {
    const events: AgentRuntimeEvent[] = [];
    const unsub = this.agent.subscribe((event: AgentRuntimeEvent) => events.push(event));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await this.agent.run(instruction)) as { messages?: unknown[] };
      const files = readWorkspace(this.options.workspaceRoot);
      const before = this.beforeFiles;
      const touched = Object.keys(files).filter((p) => before[p] !== files[p]);
      const reply = extractLastAssistantText(result?.messages ?? []) || "Concluído.";
      return { ok: true, reply, files, touched, iterations: 0, events };
    } catch (e) {
      const files = readWorkspace(this.options.workspaceRoot);
      return { ok: false, reply: "", files, touched: [], iterations: 0, events, error: e instanceof Error ? e.message : String(e) };
    } finally {
      unsub();
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLastAssistantText(messages: unknown[]): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = messages[i] as any;
    const parts = Array.isArray(msg?.content) ? msg.content : [];
    const text = parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.text)
      .join(" ");
    if (text.trim()) return text.trim();
  }
  return "";
}
