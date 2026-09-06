// Browser tools (5.20) — inspeção real do site renderizado, devolvida ao Agent
// Loop como tool result. Usa um BrowserSession único por agente.
import { z } from "zod";
import { createTool } from "@cline/sdk";
import { BrowserSession, type BrowserInspection } from "./browser-session.js";
import { visualReviewWithGemini, formatVisualReview, type VisualReviewResult } from "./vision-gemini.js";

export const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

export interface BrowserToolOptions {
  context?: string;
  projectId?: string;
}

export function buildBrowserTools(
  getSession: () => BrowserSession | null,
  onScreenshot?: (path: string) => void,
  options?: BrowserToolOptions,
) {
  const session = (): BrowserSession => {
    const s = getSession();
    if (!s) throw new Error("BrowserSession não disponível neste contexto.");
    return s;
  };

  // Captura screenshot + retorna caminho; usado pela tool visual_review.
  const capture = async (name: string): Promise<string> => {
    const s = session();
    const file = await s.screenshot(name);
    if (onScreenshot) { try { onScreenshot(file); } catch { /* noop */ } }
    return file;
  };

  const open = createTool({
    name: "browser_open",
    description:
      "Abre o site do workspace no navegador controlado (servidor local seguro). " +
      "Use antes de browser_inspect/browser_console/browser_links/browser_screenshot para validar o site renderizado.",
    inputSchema: z.object({
      path: z.string().optional().describe("caminho no site (default /). Ex.: '' ou '/index.html'"),
      viewport: z.enum(["desktop", "mobile"]).optional().describe("viewport (default desktop 1366x768)"),
    }),
    async execute(input) {
      const s = session();
      const vp = input.viewport === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
      const insp = await s.open(input.path ?? "", vp);
      return s.formatInspection(insp);
    },
  });

  const inspect = createTool({
    name: "browser_inspect",
    description:
      "Inspeciona o DOM renderizado e métricas de layout (overflow, headings, links, imagens quebradas, anchors quebrados). Resultado estruturado e pequeno.",
    inputSchema: z.object({}),
    async execute() {
      const s = session();
      const insp = await s.inspectCurrent();
      return s.formatInspection(insp);
    },
  });

  const consoleTool = createTool({
    name: "browser_console",
    description: "Retorna erros e warnings do console do navegador (JavaScript) e requests que falharam.",
    inputSchema: z.object({}),
    async execute() {
      const s = session();
      const insp = await s.inspectCurrent();
      const errs = insp.consoleErrors;
      const warns = insp.consoleWarnings;
      const failed = insp.failedRequests;
      if (!errs.length && !warns.length && !failed.length) return "Console limpo: nenhum erro ou warning JavaScript.";
      const lines = ["CONSOLE / REQUESTS:"];
      for (const e of errs) lines.push(`[error] ${e}`);
      for (const w of warns) lines.push(`[warning] ${w}`);
      for (const f of failed) lines.push(`[request-failed] ${f}`);
      return lines.join("\n");
    },
  });

  const links = createTool({
    name: "browser_links",
    description: "Verifica links e anchors do site renderizado: anchors apontando para IDs inexistentes e imagens que não carregaram.",
    inputSchema: z.object({}),
    async execute() {
      const s = session();
      const insp = await s.inspectCurrent();
      const lines: string[] = [];
      if (insp.brokenAnchors.length) lines.push(`Anchors quebrados (${insp.brokenAnchors.length}):`, ...insp.brokenAnchors.map((b) => `- ${b} não existe no DOM`));
      else lines.push("Anchors internos OK (nenhum quebrado).");
      if (insp.images.length) lines.push(`Imagens com erro (${insp.images.length}):`, ...insp.images.map((i) => `- ${i.src.slice(0, 120)}`));
      else lines.push("Imagens OK (nenhuma falhou ao carregar).");
      if (insp.failedRequests.length) lines.push("Requests que falharam:", ...insp.failedRequests.map((r) => `- ${r.slice(0, 140)}`));
      return lines.join("\n");
    },
  });

  const screenshot = createTool({
    name: "browser_screenshot",
    description:
      "Captura screenshot da página atual (desktop ou o viewport ativo) e retorna o caminho. Para análise visual real use visual_review (que envia o screenshot ao Gemini).",
    inputSchema: z.object({ name: z.string().optional().describe("nome do arquivo") }),
    async execute(input) {
      const file = await capture(input.name || "site");
      return `Screenshot salvo em ${file}`;
    },
  });

  const visualReview = createTool({
    name: "visual_review",
    description:
      "ENVIA o screenshot da página atual para o Gemini (analisador visual especializado) e retorna um DIAGNÓSTICO estruturado de problemas visuais reais (composição, hierarquia, contraste, imagens, espaçamento, primeira dobra). Use DEPOIS de abrir o site e antes de finalizar uma geração/redesign, ou após uma correção para confirmar melhora. DeepSeek continua decidindo e editando; esta tool é só o 'olho'.",
    inputSchema: z.object({
      viewport: z.enum(["desktop", "mobile"]).optional().describe("captura neste viewport (default: o atual)"),
      purpose: z.string().optional().describe("objetivo da análise (ex.: 'geração inicial QA', 'confirmar correção do hero')"),
    }),
    async execute(input) {
      const s = session();
      if (input.viewport) {
        const vp = input.viewport === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
        await s.setViewport(vp.width, vp.height);
      }
      const name = `qa-${input.viewport ?? "atual"}-${Date.now()}`;
      const file = await capture(name);
      const insp = await s.inspectCurrent();
      const ctx = `${options?.context ?? ""} Viewport capturado: ${insp.viewport.width}x${insp.viewport.height}.`;
      const result: VisualReviewResult = await visualReviewWithGemini({
        screenshotPath: file,
        viewport: insp.viewport,
        context: ctx,
        purpose: input.purpose ?? "avaliar qualidade visual do site",
        projectId: options?.projectId,
      });
      return formatVisualReview(result);
    },
  });

  const setViewport = createTool({
    name: "browser_set_viewport",
    description: "Altera o viewport (desktop 1366x768 ou mobile 390x844). Use para testar mobile depois de abrir desktop.",
    inputSchema: z.object({ viewport: z.enum(["desktop", "mobile"]) }),
    async execute(input) {
      const s = session();
      const vp = input.viewport === "mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;
      await s.setViewport(vp.width, vp.height);
      const insp = await s.inspectCurrent();
      return s.formatInspection(insp);
    },
  });

  const reload = createTool({
    name: "browser_reload",
    description: "Recarrega a página após edições de código e retorna a inspeção atualizada (revalidação).",
    inputSchema: z.object({}),
    async execute() {
      const s = session();
      const insp = await s.reload();
      return s.formatInspection(insp);
    },
  });

  return [open, inspect, consoleTool, links, screenshot, setViewport, reload, visualReview];
}

export type { BrowserInspection };
