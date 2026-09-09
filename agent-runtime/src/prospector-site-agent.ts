// ProspectorSiteAgent — wrapper do Cline Agent SDK focado no workspace de um
// Site Project do TiagoProspector. É o "motor de agente": analisa, lê, cria e
// edita os arquivos reais do site; eventos de progresso são expostos para a UI.
import { Agent, createTool } from "@cline/agents";
import type { AgentRuntimeEvent } from "@cline/agents";
import { z } from "zod";
import { buildSiteTools, type BusinessContext } from "./tools.js";
import { buildBrowserTools } from "./browser-tools.js";
import { BrowserSession } from "./browser-session.js";
import { readWorkspace, type FileMap } from "./workspace.js";
import { resolveVisionCapability, imageToDataUrl, type VisionConfig } from "./vision.js";
import { decideFinishBlock, isBugReport, replyAsksForCode, MAX_VISUAL_ITERATIONS_DEFAULT } from "./completion-guard.js";
import { analyzeVisualEvidence } from "./visual-analysis.js";
import { hasImageReferenceChange, requestsImageSwap } from "./regression-guard.js";
import { buildEditSystemPrompt, buildGenerateSystemPrompt } from "./agent-identity.js";
import { computeWorkEvidence, type WorkEventLike } from "./work-evidence.js";
import { researchEnabled, runSearchQuery, type ResearchOutcome, type ResearchTraceItem } from "./research.js";

// Detector de tarefa CIRÚRGICA (uma alteração pontual — cor, texto, botão, logo,
// imagem, título, seção pequena). Para essas tarefas NÃO se reexecuta análise
// ampla nem o fluxo de geração — o agente faz o mínimo de passos (read→edit→verify).
export function isSurgicalEditTask(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  if (/^(o\s+que|como|qual|quando|onde|por\s+que|pode|poderia|voc[eê]\s+acha|diga|explique|resuma|liste|analis|audit)/i.test(text)) return false;
  if (/premium|profissional|sofisticad|primeiro\s+mundo|alto\s+n[ií]vel|melhore\s+o\s+(site|mobile|design)|redesenha|transforma\s+o|redesign\s+completo|reconstru|do\s+zero/i.test(text)) return false;
  return /(troque?|troca|altere?|muda|mude|corrija?|conserta|adicione?|inclua?|coloque|remova?|apague|deixe|arrume|tire)\b/i.test(text);
}

const SURGICAL_HINT = `

[TAREFA CIRÚRGICA — modo rápido, obrigatório]
Esta é uma alteração PONTUAL. Execute no MÍNIMO de passos possível:
1) Se precisar localizar, faça NO MÁXIMO um read_file apenas do arquivo/trecho-alvo (src/site.css, o <img> do logo no index.html etc.).
2) Aplique a mudança exata com UM edit_file (nunca reescreva o arquivo inteiro).
3) Confira com um read_file do trecho alterado e finalize.
NESTA TAREFA É PROIBIDO: list_files, get_site_context, browser_* , visual_review, reescrever arquivos completos, tocar em outras seções/arquivos, reanalisar o projeto ou refazer o que já está pronto.`;

const BUG_HINT = `

[INVESTIGAÇÃO DE DEFEITO/BUG — obrigatório]
O projeto JÁ está no workspace: você tem acesso a TODOS os arquivos (HTML/CSS/JS/JSON/assets) e ao navegador. NUNCA peça o código ao usuário ("envie o código", "preciso do html/css/js", "não tenho acesso").
Fluxo obrigatório para o bug reportado:
1) Reproduza o problema de verdade no navegador ANTES de mexer: browser_open → inspecione o estado inicial (browser_inspect/browser_console) → use browser_eval para executar a MESMA ação do usuário (ex.: document.querySelector(...).click()) e compare o estado DEPOIS (classes no <body>, computed styles de display/visibility/opacity/position/z-index/overflow, overlays/elementos cobrindo a página, erros no console, mudanças de URL/hash).
2) Leia os arquivos envolvidos (JS/event handlers, CSS, HTML) e IDENTIFIQUE a CAUSA RAIZ. Não adivinhe: não altere z-index/transform/opacity por tentativa sem evidência do que causou o sintoma (ex.: tela preta ao clicar costuma ser overlay/modal/menu com tela escura que não fecha, camada transparente cobrindo a página, erro JS que trava o handler, âncora/hash mal resolvida, classe aplicada no clique).
3) Aplique a CORREÇÃO MÍNIMA que elimina a causa (prefira edit_file pontual).
4) Reabra/recarregue (browser_reload) e REPRODUZA o mesmo passo de novo (browser_eval) para confirmar que o problema sumiu e nada mais quebrou (console limpo).
5) Só finalize (finish_task) depois dessa confirmação real. Se o problema persistir, continue investigando — não pergunte ao usuário por código.`;

export interface AgentRunTiming {
  totalMs: number;
  turnCount: number;                       // nº de chamadas ao modelo (turnos)
  toolMs: number;                          // soma do tempo dentro de tools
  modelMs: number;                         // tempo estimado do modelo (total - tools)
  tools: Record<string, { count: number; ms: number }>;
}

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
  /** Telemetria segura da pesquisa web REALMENTE executada nesta missão. */
  researchTrace?: ResearchTraceItem[];
  /** Diagnóstico de performance real desta execução (tempo por tool/modelo). */
  timing?: AgentRunTiming;
  /** Transcript completo (messages do Cline Agent) para persistência de conversa. */
  conversationMessages?: unknown[];
}

export interface ProspectorAgentOptions {
  workspaceRoot: string;
  business: BusinessContext;
  projectId?: string;
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
  /** habilita a tool web_search (quando há chave de pesquisa configurada). */
  enableResearch?: boolean;
  /** pesquisa web de referência executada antes da missão (só quando disponível). */
  research?: ResearchOutcome | null;
  /** Mensagens iniciais para restaurar contexto de conversa anterior (persistente). */
  initialMessages?: unknown[];
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
  /** Retentativas da barreira anti-reescrita destrutiva (write_file encolhedor). */
  private writeSkips = 0;
  /** Ciclos visuais (correção por renderização/medição) já realizados — limite anti-loop. */
  private visualCycles = 0;
  private runStartFiles: Record<string, string> | null = null;
  private currentInstruction = "";
  /** Sequência de tool-started da run atual — evidência real para o Depth Guard. */
  private currentToolEvents: WorkEventLike[] = [];
  /** Pesquisas web REALMENTE executadas nesta missão (prova de não-simulação). */
  private researchTrace: ResearchTraceItem[] = [];

  constructor(options: ProspectorAgentOptions) {
    this.options = options;
    const tools = buildSiteTools({ workspaceRoot: options.workspaceRoot, business: options.business, projectId: options.projectId, mode: options.mode });

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
        // Analisador PROVIDER-AGNOSTIC (FASE 4): usa o provider/modelo do USUÁRIO.
        // NUNCA usa Gemini como fallback; nunca afirma análise visual que não ocorreu.
        visualAnalyze: (ev, prompt) => analyzeVisualEvidence({
          prompt,
          evidence: ev,
          provider: options.providerId,
          model: options.modelId,
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
        }),
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
        execute: async (input: { query: string }) => {
          const r = await runSearchQuery(input.query);
          // Prova real de execução (sem expor secrets/conteúdo sensível).
          this.researchTrace.push({ query: input.query.slice(0, 200), ok: r.ok, resultsCount: r.results.length, source: "tavily" });
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
    // (5.30) BARREIRA ANTI-REESCRITA: em EDIÇÃO, um write_file que reduziria
    // drasticamente um arquivo existente é bloqueado — EDITAR ≠ RECONSTRUIR.
    const REBUILD_RE = /reconstru|reescrev[ae]|refa[çc]a|do zero|rewrite/i;
    const beforeTool = async (ctx: { tool?: { name?: string } | undefined; toolCall?: { name?: string } | undefined; toolName?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any = (ctx as { toolCall?: { input?: unknown } }).toolCall?.input ?? (ctx as { input?: unknown }).input ?? {};
      const name = ctx?.tool?.name ?? (ctx as { toolCall?: { toolName?: string } }).toolCall?.toolName ?? ctx?.toolName ?? "";
      if (name === "write_file" && options.mode !== "generate" && !REBUILD_RE.test(this.currentInstruction) && this.writeSkips < 4) {
        const path = typeof input?.path === "string" ? input.path : "";
        const content = typeof input?.content === "string" ? input.content : "";
        const clean = path.replace(/^\/+/, "").replace(/\.\//, "");
        const current = readWorkspace(options.workspaceRoot)[clean];
        if (current !== undefined && content.length < current.length * 0.55) {
          this.writeSkips += 1;
          return {
            skip: true,
            reason: `"write_file" reduziria ${clean} de ${current.length} para ${content.length} caracteres (remoção de mais de 45% num ARQUIVO EXISTENTE). EDITAR ≠ RECONSTRUIR: prefira "edit_file" (alteração localizada, preservando o resto) ou devolva o arquivo COMPLETO preservando todo o conteúdo existente que não faz parte do pedido.`,
          };
        }
      }
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
        visualIterations: this.visualCycles,
        maxVisualIterations: MAX_VISUAL_ITERATIONS_DEFAULT,
      });
      if (decision.block) {
        this.finishSkips += 1;
        if (decision.kind === "visual") this.visualCycles += 1;
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
      initialMessages: options.initialMessages,
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
          case "web_search":
            out.push({ phase: "researching", detail: `Pesquisando na web: ${String(input?.query ?? "").slice(0, 140)}` });
            break;
          case "visual_review":
            out.push({ phase: "verifying", detail: "Análise visual (Gemini)" });
            break;
          case "browser_open":
          case "browser_reload":
          case "browser_inspect":
            out.push({ phase: "verifying", detail: "Abrindo/verificando o site no navegador" });
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
    // RECUPERAÇÃO do Cline: se a sessão ficou presa numa run anterior (ex.: o
    // cliente desistiu após timeout e o engine continua "already running"),
    // abortamos a tarefa em voo ANTES de rodar — sem isso a próxima execução
    // do mesmo zAgent reutilizado falha com "Agent runtime is already running".
    try { (this.agent as { abort?: (reason?: unknown) => void }).abort?.("re-exec"); } catch { /* noop */ }
    const tStart = Date.now();
    const timing: AgentRunTiming = { totalMs: 0, turnCount: 0, toolMs: 0, modelMs: 0, tools: {} };
    let toolStart: { name: string; at: number } | null = null;
    const unsub = this.agent.subscribe((event: AgentRuntimeEvent) => {
      events.push(event);
      // Registra só o início das tools (ordem real), usado pelo Depth Guard.
      const ev = event as Partial<AgentRuntimeEvent> & WorkEventLike;
      const name = ev.toolName ?? ev.toolCall?.toolName ?? "";
      if (ev?.type === "tool-started" && name) {
        this.currentToolEvents.push({ type: ev.type, toolName: ev.toolName, toolCall: ev.toolCall });
        timing.tools[name] ??= { count: 0, ms: 0 };
        timing.tools[name].count += 1;
        toolStart = { name, at: Date.now() };
      } else if (ev?.type === "tool-finished") {
        if (toolStart) {
          timing.tools[toolStart.name].ms += Date.now() - toolStart.at;
          toolStart = null;
        }
      } else if (ev?.type === "turn-finished") {
        timing.turnCount += 1;
      }
    });
    const shouldContinue = opts?.continueSession === true && this.conversationStarted;
    // Nova missão → reset do guard (retentativas de finish por missão).
    if (!shouldContinue) {
      this.finishSkips = 0;
      this.finishBlocked = false;
      this.writeSkips = 0;
      this.researchTrace = [];
      this.pendingScreenshotPath = null;
    }
    // Snapshot do início desta execução (para detectar "disse que alterou mas nada mudou").
    this.runStartFiles = readWorkspace(this.options.workspaceRoot);
    this.currentInstruction = instruction;
    // DEFEITO/BUG → investigação completa (nunca modo rápido, nunca pedir código).
    // Tarefas cirúrgicas (edição pontual) ganham modo rápido: nunca reexecutar o
    // fluxo amplo de análise/geração para trocar cor/texto/logo/imagem/botão.
    let prompt: string;
    if (this.options.mode === "edit" && isBugReport(instruction)) {
      prompt = `${instruction}\n${BUG_HINT}`;
    } else if (this.options.mode === "edit" && isSurgicalEditTask(instruction)) {
      prompt = `${instruction}\n${SURGICAL_HINT}`;
    } else {
      prompt = instruction;
    }
    try {
      // Estado "antes" real (para touched correto em continuações).
      const stateBefore = shouldContinue || this.conversationStarted ? readWorkspace(this.options.workspaceRoot) : this.beforeFiles;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await (shouldContinue ? this.agent.continue(prompt) : this.agent.run(prompt))) as { messages?: unknown[] };
      this.conversationStarted = true;
      const files = readWorkspace(this.options.workspaceRoot);
      const touched = Object.keys(files).filter((p) => stateBefore[p] !== files[p]);
      const reply = extractLastAssistantText(result?.messages ?? []) || "Concluído.";
      const activity = ProspectorSiteAgent.operationalEvents(events as unknown as never[]);
      this.finalizeTiming(timing, tStart);
      return {
        ok: true,
        reply: this.honestReply(reply, files, touched),
        files, touched, iterations: 0, events, activity, timing,
        finishSkips: this.finishSkips, finishBlocked: this.finishBlocked,
        researchTrace: this.researchTrace.slice(),
        conversationMessages: result?.messages ?? [],
      };
    } catch (e) {
      const files = readWorkspace(this.options.workspaceRoot);
      this.finalizeTiming(timing, tStart);
      return {
        ok: false, reply: "", files, touched: [], iterations: 0, events, timing,
        error: e instanceof Error ? e.message : String(e),
        finishSkips: this.finishSkips, finishBlocked: this.finishBlocked,
        researchTrace: this.researchTrace.slice(),
        conversationMessages: [],
      };
    } finally {
      unsub();
      if (this.browserSession) {
        await this.browserSession.close().catch(() => {});
        this.browserSession = null;
      }
    }
  }

  private finalizeTiming(timing: AgentRunTiming, tStart: number): void {
    timing.totalMs = Date.now() - tStart;
    timing.toolMs = Object.values(timing.tools).reduce((acc, t) => acc + t.ms, 0);
    timing.modelMs = Math.max(0, timing.totalMs - timing.toolMs);
  }

  // Reinicia a conversa (nova tarefa sem contexto anterior) — usado ao trocar
  // de projeto/instrução totalmente nova.
  resetSession(): void {
    this.conversationStarted = false;
    this.beforeFiles = {};
    this.pendingScreenshotPath = null;
  }

  /**
   * Reduz a "mentira" do agente em modo EDIÇÃO: se a resposta final afirma que
   * alterou algo mas NENHUM arquivo mudou — ou prometeu trocar imagem/foto sem
   * que nenhuma referência de imagem no código tenha mudado —, a resposta é
   * substituída por uma mensagem curta e honesta pedindo nova tentativa.
   */
  private honestReply(reply: string, files: FileMap, touched: string[]): string {
    if (this.options.mode === "edit") {
      // NUNCA pedir o código/arquivos ao usuário: o projeto está no workspace.
      if (replyAsksForCode(reply) && Object.keys(files ?? {}).length > 0) {
        return "Os arquivos do projeto já estão disponíveis no workspace — vou investigá-los diretamente, sem precisar que você envie o código. Reproduzo o problema no navegador, identifico a causa e aplico a correção mínima.";
      }
      const claimsChange = /(corrigi|consert[ei]|troquei|alterei|modifiquei|atualizei|adicionei|reconstru[ií]|removi|mudei|implementei|apliquei|arrumei|resolvi|coloquei)/i.test(reply);
      if (touched.length === 0 && claimsChange) {
        return "⚠ Não consegui aplicar essa alteração: nenhum arquivo do site foi modificado nesta tentativa. Descreva de outro jeito (ex.: nome exato da foto/seção) que eu tento de novo.";
      }
      if (requestsImageSwap(this.currentInstruction) && !hasImageReferenceChange(this.runStartFiles ?? {}, files) && /(troquei|alterei|corrigi|coloquei|aplicada)/i.test(reply)) {
        return "⚠ Não consegui trocar a imagem solicitada: nenhuma referência de imagem no código foi alterada nesta tentativa. Confirme o arquivo/foto exatos que eu aplico de verdade.";
      }
    }
    return reply;
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
