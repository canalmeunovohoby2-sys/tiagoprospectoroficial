// ProspectorSiteAgent — wrapper do Cline Agent SDK focado no workspace de um
// Site Project do TiagoProspector. É o "motor de agente": analisa, lê, cria e
// edita os arquivos reais do site; eventos de progresso são expostos para a UI.
import { Agent, createTool } from "@cline/agents";
import type { AgentRuntimeEvent } from "@cline/agents";
import { z } from "zod";
import { buildSiteTools, type BusinessContext } from "./tools";
import { buildBrowserTools } from "./browser-tools";
import { BrowserSession } from "./browser-session";
import { readWorkspace, type FileMap } from "./workspace";
import { GENERATION_SYSTEM_PROMPT } from "./generation-prompt";

export interface AgentRunOutcome {
  ok: boolean;
  reply: string;
  files: FileMap;               // workspace completo depois da execução
  touched: string[];            // paths alterados nesta execução
  iterations: number;
  events: AgentRuntimeEvent[];
  activity?: Array<{ phase: string; detail: string }>;
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
  systemPrompt?: string;
  /** mode de missão: "edit" (padrão) ou "generate" (criação inicial). */
  mode?: "edit" | "generate";
  /** habilita browser tools (Playwright) — browser real para QA do site. */
  enableBrowser?: boolean;
}

const SYSTEM_PROMPT = `Você é o ProspectorSiteAgent: um SENIOR Web Designer + Art Director + Frontend Engineer que trabalha DENTRO do código real de um site de um pequeno negócio brasileiro.

IMPORTANTE — IDIOMA: responda SEMPRE em português do Brasil (pt-BR). Nomes técnicos de arquivos/classes podem permanecer em inglês, mas a comunicação com o usuário é sempre em pt-BR.

O projeto é um site estático Vite com estrutura típica:
- index.html — marcação/HTML completo da página
- src/site.css — estilos
- src/main.js — interações
- src/site.json — dados estruturados do negócio (não é o produto: é dado auxiliar)

REGRAS DE TRABALHO:
1. ANTES de editar, use list_files e read_file para entender o estado real dos arquivos.
2. Use write_file (conteúdo completo) ou edit_file (trecho exato) — só altere o necessário e de forma coordenada.
3. Preserve dados factuais do negócio (nome, telefone, endereço) — use get_site_context; NUNCA invente dados. Em especial, NÃO invente horários de funcionamento, especialidades, avaliações, preços, certificações ou informações que não estejam no contexto. Se faltar dado, deixe o campo genérico ou omita.
4. Preserve decisões já aprovadas (se o usuário gostou do header, não o reconstrua sem pedido).
5. Trabalhe como um estúdio: hierarquia, contraste, composição, ritmo, responsividade, sem cara de template/PDF.
6. Para mudanças visuais grandes, pode alterar index.html E src/site.css juntos (multi-file).
7. Ao terminar, resuma em pt-BR, de forma natural, o que foi feito (reply) — sem expor chain-of-thought.
8. Se uma tool falhar, analise o erro e tente corrigir antes de desistir.

BROWSER QA (ferramentas browser_*):
- Você possui ferramentas de navegador real (browser_open, browser_inspect, browser_console, browser_links, browser_screenshot, browser_set_viewport, browser_reload) que abrem o SITE RENDERIZADO do workspace.
- Use-as quando a tarefa envolver validar o resultado visual/estrutural (geração completa, "deixa o site perfeito", responsividade mobile, overflow, contraste, links quebrados, console). NÃO use para mudanças triviais de texto.
- Fluxo recomendado: editar código → browser_open → browser_inspect / browser_console / mobile (browser_set_viewport mobile) → se houver problema (overflow horizontal, anchor quebrado, imagem que não carrega, erro de console), edite o código → browser_reload → confirme que resolveu.
- Retorne na resposta apenas os problemas reais encontrados e corrigidos; nunca invente QA.
- Screenshot: a ferramenta salva o arquivo, mas o modelo pode NÃO receber a imagem visualmente — use as métricas de DOM/console/links como evidência primária.

O site DEVE continuar válido: index.html com <!doctype html>, <style> balanceado, src/site.json JSON válido.`;

export class ProspectorSiteAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any;
  private options: ProspectorAgentOptions;
  private beforeFiles: FileMap = {};
  private conversationStarted = false;
  private browserSession: BrowserSession | null = null;

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
    const systemPrompt = options.systemPrompt ?? (options.mode === "generate" ? GENERATION_SYSTEM_PROMPT : SYSTEM_PROMPT);

    // Browser tools: compartilham UMA sessão Playwright por agente (lazy).
    let browserTools: ReturnType<typeof buildBrowserTools> = [];
    if (options.enableBrowser) {
      browserTools = buildBrowserTools(() => {
        if (!this.browserSession) this.browserSession = new BrowserSession(options.workspaceRoot);
        return this.browserSession;
      });
    }

    this.agent = new (Agent as unknown as new (cfg: Record<string, unknown>) => unknown)({
      providerId: options.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
      modelId: options.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.PROSPECTOR_API_KEY,
      baseUrl: options.baseUrl ?? process.env.PROSPECTOR_BASE_URL ?? "https://api.deepseek.com",
      systemPrompt,
      tools: [...tools, ...browserTools, complete],
      maxIterations: options.maxIterations ?? 40,
    });
  }

  subscribe(listener: (event: AgentRuntimeEvent) => void): () => void {
    return this.agent.subscribe(listener);
  }

  // Eventos operacionais legíveis (sem raciocínio interno) derivados de tool calls.
  // Mapeia a atividade real do agente para o front (fase + arquivo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static operationalEvents(events: any[]): Array<{ phase: string; detail: string }> {
    const out: Array<{ phase: string; detail: string }> = [];
    let analyzing = false;
    for (const e of events ?? []) {
      if (e.type === "tool-started") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const input = e.toolCall?.input ?? e.input ?? {};
        const path = typeof input?.path === "string" ? input.path : typeof input?.file === "string" ? input.file : "";
        switch (e.toolCall?.toolName ?? e.toolName) {
          case "list_files":
            analyzing = true;
            out.push({ phase: "analyzing", detail: "Lendo a estrutura do projeto…" });
            break;
          case "read_file":
            analyzing = true;
            out.push({ phase: "analyzing", detail: `Lendo ${path}` });
            break;
          case "get_site_context":
            analyzing = true;
            out.push({ phase: "analyzing", detail: "Consultando os dados da empresa…" });
            break;
          case "write_file":
          case "edit_file":
            analyzing = false;
            out.push({ phase: "editing", detail: `Alterando ${path}` });
            break;
          case "delete_file":
            analyzing = false;
            out.push({ phase: "editing", detail: `Removendo ${path}` });
            break;
          case "finish_task":
            out.push({ phase: "done", detail: "Concluído" });
            break;
          default:
            out.push({ phase: "working", detail: String(e.toolCall?.toolName ?? e.toolName ?? "trabalhando…") });
        }
      } else if (e.type === "tool-finished" && analyzing) {
        // após ler, próximo estágio é revisar/verificar
        analyzing = false;
      } else if (e.type === "turn-finished") {
        out.push({ phase: "reviewing", detail: "Revisando o resultado…" });
      }
    }
    return out;
  }

  // Roda/continua uma tarefa na sessão do projeto. Se a sessão já iniciou
  // (mesmo Agent), usa continue() para manter o contexto da conversa.
  async runTask(instruction: string, opts?: { continueSession?: boolean }): Promise<AgentRunOutcome> {
    const events: AgentRuntimeEvent[] = [];
    const unsub = this.agent.subscribe((event: AgentRuntimeEvent) => events.push(event));
    try {
      const shouldContinue = opts?.continueSession === true && this.conversationStarted;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await (shouldContinue ? this.agent.continue(instruction) : this.agent.run(instruction))) as { messages?: unknown[] };
      this.conversationStarted = true;
      const files = readWorkspace(this.options.workspaceRoot);
      const before = this.beforeFiles;
      const touched = Object.keys(files).filter((p) => before[p] !== files[p]);
      const reply = extractLastAssistantText(result?.messages ?? []) || "Concluído.";
      const activity = ProspectorSiteAgent.operationalEvents(events as unknown as never[]);
      return { ok: true, reply, files, touched, iterations: 0, events, activity };
    } catch (e) {
      const files = readWorkspace(this.options.workspaceRoot);
      return { ok: false, reply: "", files, touched: [], iterations: 0, events, error: e instanceof Error ? e.message : String(e) };
    } finally {
      unsub();
      if (this.browserSession) {
        await this.browserSession.close().catch(() => {});
        this.browserSession = null;
      }
    }
  }

  // Reinicia a conversa (nova tarefa sem contexto anterior) — usado ao trocar
  // de projeto/instrução totalmente nova.
  resetSession(): void {
    this.conversationStarted = false;
    this.beforeFiles = {};
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
