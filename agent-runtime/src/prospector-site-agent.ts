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
import { resolveVisionCapability, imageToDataUrl, type VisionConfig } from "./vision";
import { decideFinishBlock } from "./completion-guard";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "./agent-identity";
import { computeWorkEvidence, type WorkEventLike } from "./work-evidence";
import { researchEnabled, runSearchQuery } from "./research";

export interface AgentRunOutcome {
  ok: boolean;
  reply: string;
  files: FileMap;               // workspace completo depois da execução
  touched: string[];            // paths alterados nesta execução
  iterations: number;
  events: AgentRuntimeEvent[];
  activity?: Array<{ phase: string; detail: string }>;
  error?: string;
  /** Evidência da conclusão: o finish_task foi bloqueado pelo guard até a
   * qualidade passar (número de bloqueios) ou finalizou direto. */
  finishSkips?: number;
  finishBlocked?: boolean;
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
  /** habilita a tool web_search (quando houver chave de pesquisa configurada). */
  enableResearch?: boolean;
  /** pesquisa web de referência executada antes da missão (só quando disponível). */
  research?: ResearchOutcome | null;
}

export class ProspectorSiteAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any;
  private options: ProspectorAgentOptions;
  private beforeFiles: FileMap = {};
  private conversationStarted = false;
  private browserSession: BrowserSession | null = null;
  private vision: VisionConfig;
  private pendingScreenshotPath: string | null = null;
  private finishSkips = 0;
  private finishBlocked = false;
  private runStartFiles: Record<string, string> | null = null;
  private currentInstruction = "";
  /** Sequência de tool-started da run atual — evidência real para o Depth Guard. */
  private currentToolEvents: WorkEventLike[] = [];

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
    const systemPrompt = options.systemPrompt ?? (options.mode === "generate" ? buildGenerateSystemPrompt() : buildEditSystemPrompt());
    this.vision = resolveVisionCapability({ provider: options.providerId, model: options.modelId });

    // Browser tools: compartilham UMA sessão Playwright por agente (lazy).
    let browserTools: ReturnType<typeof buildBrowserTools> = [];
    if (options.enableBrowser) {
      browserTools = buildBrowserTools(() => {
        if (!this.browserSession) this.browserSession = new BrowserSession(options.workspaceRoot);
        return this.browserSession;
      }, (path) => {
        // screenshot capturado pelo agente → tenta disponibilizar ao modelo se houver visão.
        this.pendingScreenshotPath = path;
      }, {
        context: [
          options.business?.name && `Empresa: ${options.business.name}`,
          options.business?.segment && `Segmento: ${options.business.segment}`,
          options.business?.city && `Cidade: ${options.business.city}/${options.business.state}`,
        ].filter(Boolean).join(" · "),
      });
    }

    // web_search (5.26): pesquisa externa de referência/tendências — opcional e
    // disponível apenas quando há chave configurada (nunca bloqueia o trabalho).
    const researchTools: unknown[] = [];
    if (options.enableResearch !== false && researchEnabled()) {
      researchTools.push(createTool({
        name: "web_search",
        description:
          "Pesquisa na web por referências, tendências e técnicas de design do segmento (ex.: 'melhores sites de restaurante premium 2026', 'tendências web design gastronomia'). Use quando a pesquisa agregar valor à direção criativa ou à copy. NUNCA copie sites/layouts/textos encontrados — use apenas como referência para criar algo próprio e contextualizado.",
        inputSchema: z.object({ query: z.string().describe("consulta curta e específica (máx. ~60 palavras)") }),
        async execute(input) {
          const r = await runSearchQuery(input.query);
          return r.ok
            ? JSON.stringify({ ok: true, query: input.query, results: r.results })
            : JSON.stringify({ ok: false, error: r.error ?? "web_search indisponível" });
        },
      }));
    }

    // Hook antes do modelo: se houver visão real e um screenshot pendente,
    // anexa a imagem como mensagem de usuário (ImageContent) ao próximo request.
    const beforeModel = async (input: { messages?: unknown[]; systemPrompt?: string }) => {
      if (!this.vision.supported || !this.pendingScreenshotPath) return input;
      const img = await imageToDataUrl(this.pendingScreenshotPath);
      this.pendingScreenshotPath = null; // consome o screenshot
      if (!img) return input;
      const messages = Array.isArray(input?.messages) ? [...(input.messages as unknown[])] : [];
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Aqui está o screenshot da página atual do site. Analise visualmente (composição, hierarquia, contraste, espaçamento, imagens, primeira dobra) e use-o como evidência real. Se houver problema, corrija o código." },
          { type: "image", data: img.data, mediaType: img.mediaType },
        ],
      });
      return { ...input, messages };
    };

    // COMPLETION GUARD (arquitetural): impede finish_task sem evidência/qualidade.
    // No modo generate, bloqueia a conclusão enquanto o Quality Gate falhar.
    const beforeTool = async (ctx: { tool?: { name?: string } | undefined; toolCall?: { name?: string } | undefined; toolName?: string }) => {
      const name = ctx?.tool?.name ?? (ctx as { toolCall?: { toolName?: string } }).toolCall?.toolName ?? ctx?.toolName ?? "";
      if (name !== "finish_task") return undefined;
      const decision = decideFinishBlock({
        mode: options.mode ?? "edit",
        files: readWorkspace(options.workspaceRoot),
        startFiles: this.runStartFiles,
        instruction: this.currentInstruction,
        segment: options.business?.segment ?? undefined,
        name: options.business?.name ?? undefined,
        finishSkips: this.finishSkips,
        work: this.currentToolEvents.length ? computeWorkEvidence(this.currentToolEvents) : undefined,
      });
      if (decision.block) {
        this.finishSkips += 1;
        this.finishBlocked = true;
        return { skip: true, reason: decision.reason ?? "Revisão automática reprovou a finalização." };
      }
      return undefined;
    };

    this.agent = new (Agent as unknown as new (cfg: Record<string, unknown>) => unknown)({
      providerId: options.providerId ?? process.env.PROSPECTOR_PROVIDER ?? "deepseek",
      modelId: options.modelId ?? process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.PROSPECTOR_API_KEY,
      baseUrl: options.baseUrl ?? process.env.PROSPECTOR_BASE_URL ?? "https://api.deepseek.com",
      systemPrompt,
      tools: [...tools, ...browserTools, ...researchTools, complete],
      maxIterations: options.maxIterations ?? 40,
      hooks: { beforeModel, beforeTool },
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
    this.currentToolEvents = []; // nova missão → nova trilha de evidência da run
    const unsub = this.agent.subscribe((event: AgentRuntimeEvent) => {
      events.push(event);
      // Registra só o início das tools (ordem real), usado pelo Depth Guard.
      const ev = event as Partial<AgentRuntimeEvent> & WorkEventLike;
      if (ev?.type === "tool-started" && (ev.toolName || ev.toolCall?.toolName)) {
        this.currentToolEvents.push({ type: ev.type, toolName: ev.toolName, toolCall: ev.toolCall });
      }
    });
    const shouldContinue = opts?.continueSession === true && this.conversationStarted;
    // Nova missão → reset do guard (retentativas de finish por missão).
    if (!shouldContinue) {
      this.finishSkips = 0;
      this.finishBlocked = false;
      this.pendingScreenshotPath = null;
    }
    // Snapshot do início desta execução (para detectar "disse que alterou mas nada mudou").
    this.runStartFiles = readWorkspace(this.options.workspaceRoot);
    this.currentInstruction = instruction;
    try {
      // Estado "antes" real (para touched correto em continuações).
      const stateBefore = shouldContinue || this.conversationStarted ? readWorkspace(this.options.workspaceRoot) : this.beforeFiles;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await (shouldContinue ? this.agent.continue(instruction) : this.agent.run(instruction))) as { messages?: unknown[] };
      this.conversationStarted = true;
      const files = readWorkspace(this.options.workspaceRoot);
      const touched = Object.keys(files).filter((p) => stateBefore[p] !== files[p]);
      const reply = extractLastAssistantText(result?.messages ?? []) || "Concluído.";
      const activity = ProspectorSiteAgent.operationalEvents(events as unknown as never[]);
      return {
        ok: true, reply, files, touched, iterations: 0, events, activity,
        finishSkips: this.finishSkips, finishBlocked: this.finishBlocked,
      };
    } catch (e) {
      const files = readWorkspace(this.options.workspaceRoot);
      return {
        ok: false, reply: "", files, touched: [], iterations: 0, events,
        error: e instanceof Error ? e.message : String(e),
        finishSkips: this.finishSkips, finishBlocked: this.finishBlocked,
      };
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
    this.pendingScreenshotPath = null;
  }

  /** Capacidade de visão resolvida (provider/modelo). */
  get visionCapability(): VisionConfig {
    return this.vision;
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
