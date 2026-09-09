// Browser tools (5.20) — inspeção real do site renderizado, devolvida ao Agent
// Loop como tool result. Usa um BrowserSession único por agente.
import { z } from "zod";
import { createTool } from "@cline/sdk";
import { BrowserSession, type BrowserInspection } from "./browser-session.js";
import { visualReviewWithGemini, formatVisualReview, type VisualReviewResult } from "./vision-gemini.js";
import {
  type Box, type MeasuredElement, type ViewportInfo, distanceBelow, distanceRight,
  overlapsX, overlapsY, overlapArea, contains, horizontalAlignment, proportionWidth, proportionHeight,
} from "./geometry.js";
import { buildVisualEvidence, summarizeStructuredEvidence, type VisualEvidence } from "./visual-evidence.js";
import type { VisualAnalysisResult } from "./visual-analysis.js";

export const DESKTOP_VIEWPORT = { width: 1366, height: 768 };
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

export interface BrowserToolOptions {
  context?: string;
  projectId?: string;
  /** Analisador provider-agnostic injetado (usa o provider/modelo do usuário). */
  visualAnalyze?: (ev: VisualEvidence, prompt: string) => Promise<VisualAnalysisResult>;
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

  // Rotula um elemento medido (identificação compacta).
  const labelOf = (el: MeasuredElement, i: number) => {
    const name = el.id || el.classes || el.tag;
    return `#${i + 1} [${el.selector}] (${el.tag}${name ? " · " + name : ""})`;
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

  // MEDIÇÃO GEOMÉTRICA ESTRUTURADA do renderizado (6.0).
  // Retorna bounding boxes, posição (relativa ao viewport), estilos computados
  // úteis, viewport e RELAÇÕES entre elementos (distância, alinhamento, overlap,
  // contenção, proporção). Só aceita SELECTORES (nunca JS livre do modelo).
  const measure = createTool({
    name: "browser_measure",
    description:
      "Mede a GEOMETRIA REAL do site renderizado (bounding box, posição, dimensões, espaçamento, alinhamento, sobreposição, proporção, viewport). " +
      "Recebe um ou mais seletores CSS (ex.: '.hero h1' ou ['.hero', '.hero .cta']). Retorna dados estruturados por elemento + relações entre eles. " +
      "Use quando a tarefa envolver posicionamento, espaçamento, tamanho, alinhamento, responsividade ou composição visual. Depois de editar, meça de novo para confirmar o efeito.",
    inputSchema: z.object({
      selectors: z.union([z.string(), z.array(z.string())]).optional().describe("um seletor CSS ou lista de seletores para medir"),
    }),
    async execute(input) {
      const s = session();
      const raw = Array.isArray(input.selectors) ? input.selectors : (input.selectors ? [input.selectors] : ["body", "header", "main", "footer"]);
      if (!raw.length) return "browser_measure: informe ao menos um seletor.";
      const data = await s.measure(raw);
      const vp = data.viewport;
      const els = data.elements;
      const found = els.filter((e) => !e.notFound && !e.error);
      const lines: string[] = [];
      lines.push(`GEOMETRIA DO RENDERIZADO`);
      lines.push(`Viewport: ${vp.width} × ${vp.height}${vp.deviceScaleFactor ? ` (deviceScaleFactor ${vp.deviceScaleFactor})` : ""}`);
      if (els.length === 0) {
        lines.push("(nenhum elemento encontrado)");
        return lines.join("\n");
      }
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (el.notFound) { lines.push(`\nELEMENTO ${i + 1} [${el.selector}]: NÃO ENCONTRADO`); continue; }
        if (el.error) { lines.push(`\nELEMENTO ${i + 1} [${el.selector}]: ERRO ${el.error}`); continue; }
        const b: Box = el.box;
        lines.push(`\nELEMENTO ${labelOf(el, i)}`);
        lines.push(`  box: x=${b.x} y=${b.y} width=${b.width} height=${b.height} right=${b.right} bottom=${b.bottom}`);
        for (const p of ["fontSize", "fontWeight", "lineHeight", "textAlign", "display", "position", "margin", "padding", "gap", "width", "maxWidth", "height", "minHeight"] as const) {
          if (el.style?.[p]) lines.push(`  ${p}: ${el.style[p]}`);
        }
        if (el.text) lines.push(`  text: "${el.text}"`);
      }
      // Relações entre os elementos encontrados (consecutivos), na ordem pedida.
      const ids: Array<{ idx: number; label: string; box: Box }> = [];
      let foundCounter = 0;
      els.forEach((el, i) => {
        if (!el.notFound && !el.error) { ids.push({ idx: i, label: labelOf(el, foundCounter++), box: el.box as Box }); }
      });
      const rels: string[] = [];
      for (let i = 0; i + 1 < ids.length; i++) {
        const a = ids[i], b = ids[i + 1];
        const below = distanceBelow(a.box, b.box);
        const right = distanceRight(a.box, b.box);
        if (Math.abs(below) < 100000) rels.push(`${b.label} está ${below < 0 ? `sobreposto/abaixo de ${a.label} por ${Math.abs(below)}px` : `${below}px abaixo de ${a.label}`}`);
        if (Math.abs(right) < 100000) rels.push(`${b.label} está ${right < 0 ? `sobreposto/à esquerda de ${a.label} por ${Math.abs(right)}px` : `${right}px à direita de ${a.label}`}`);
        const align = horizontalAlignment(a.box, b.box);
        if (align) rels.push(`${b.label} e ${a.label}: alinhamento ${align}`);
        const ovX = overlapsX(a.box, b.box), ovY = overlapsY(a.box, b.box);
        if (ovX && ovY) rels.push(`${b.label} e ${a.label}: sobreposição de ${overlapArea(a.box, b.box)}px²`);
        else if (ovX) rels.push(`${b.label} e ${a.label}: mesma faixa horizontal`);
        else if (ovY) rels.push(`${b.label} e ${a.label}: mesma faixa vertical`);
        if (contains(a.box, b.box)) rels.push(`${b.label} está CONTIDO em ${a.label}`);
        else if (contains(b.box, a.box)) rels.push(`${a.label} está CONTIDO em ${b.label}`);
      }
      if (rels.length) lines.push("\nRELAÇÕES", ...rels.map((r) => "- " + r));
      const props: string[] = [];
      for (const id of ids) {
        const pw = proportionWidth(id.box, vp), ph = proportionHeight(id.box, vp);
        props.push(`${id.label} ocupa ${(pw * 100).toFixed(1)}% da largura do viewport${ph ? `, ${(ph * 100).toFixed(1)}% da altura` : ""}`);
      }
      if (props.length) lines.push("\nPROPORÇÃO", ...props.map((p) => "- " + p));
      return lines.join("\n");
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

  // ANÁLISE VISUAL PROVIDER-AGNOSTIC (6.0): captura evidência real (screenshot +
  // geometria browser_measure + viewport + console) e a envia ao provider/modelo
  // CONFIGURADO pelo usuário quando houver suporte multimodal; senão devolve
  // evidência estruturada. Nunca usa Gemini como fallback e nunca afirma análise
  // por imagem que não tenha ocorrido.
  const analyze = createTool({
    name: "visual_analyze",
    description:
      "Captura EVIDÊNCIA VISUAL real da página (screenshot + geometria via browser_measure + viewport + console errors) e analisa com o PROVIDER/MODELO configurado pelo usuário quando houver suporte multimodal; senão devolve evidência estruturada (geometria/DOM/viewport). " +
      "Use para avaliar composição, tipografia, layout, CTA, imagens ou responsividade com evidência do renderizado. NUNCA afirma análise visual por imagem quando ela não ocorreu, e NUNCA usa Gemini como fallback.",
    inputSchema: z.object({
      prompt: z.string().describe("o que a análise deve avaliar para ESTE projeto (ex.: composição, tipografia, CTA, imagens, responsividade)"),
      selectors: z.union([z.string(), z.array(z.string())]).optional().describe("seletores para medir geometria (default: body/header/main/footer)"),
    }),
    async execute(input) {
      const s = session();
      const sels = Array.isArray(input.selectors) ? input.selectors : (input.selectors ? [input.selectors] : ["body", "header", "main", "footer"]);
      const shotPath = await capture(`vis-${Date.now()}`);
      let dataUrl = "";
      try {
        const fs = await import("node:fs");
        const buf = fs.readFileSync(shotPath);
        dataUrl = buf.toString("base64");
      } catch { /* sem screenshot real → não inventa */ }
      const insp = await s.inspectCurrent();
      const gem = await s.measure(sels);
      const evidence = buildVisualEvidence({
        screenshot: dataUrl ? { data: dataUrl, mimeType: "image/png" } : undefined,
        viewport: { width: insp.viewport.width, height: insp.viewport.height, deviceScaleFactor: gem.viewport.deviceScaleFactor ?? 1 },
        geometry: gem,
        dom: { title: insp.title, headings: insp.headings.length, links: insp.links, documentWidth: insp.documentWidth, overflow: insp.horizontalOverflow, overflowPixels: insp.overflowPixels },
        consoleErrors: insp.consoleErrors,
      });
      const analyzer = options?.visualAnalyze;
      if (!analyzer) {
        return `MODO structured (sem analisador configurado)\n` + summarizeStructuredEvidence(evidence);
      }
      const r = await analyzer(evidence, String(input.prompt ?? ""));
      const head = r.mode === "multimodal"
        ? `ANÁLISE VISUAL (multimodal) — ${r.performed ? "REALIZADA" : "NÃO CONCLUÍDA"}${r.error ? "\nobs: " + r.error : ""}`
        : `ANÁLISE (structured) — SEM análise visual por imagem${r.error ? "\nobs: " + r.error : ""}`;
      return head + "\n" + r.analysis;
    },
  });

  const evalTool = createTool({
    name: "browser_eval",
    description:
      "Executa JavaScript no contexto da página ABERTA (mesma origem do site). Use para REPRODUZIR interações e investigar bugs de verdade: " +
      "simular clique em um botão (document.querySelector('...').click()), abrir/fechar menu ou modal, ler/adicionar classes do body ou de elementos, " +
      "ler computed styles (display/visibility/opacity/position/z-index/overflow), comparar o estado da página ANTES e DEPOIS de um clique " +
      "(ex.: verificar se a tela ficou preta/apareceu um overlay) e navegar por hash/link. Retorna o resultado da expressão (ou erro).",
    inputSchema: z.object({
      expression: z.string().describe("expressão/trecho JavaScript a executar (ex.: document.querySelector('.menu-btn').click(); document.body.className)"),
    }),
    async execute(input) {
      const s = session();
      const r = await s.evaluate(input.expression);
      if (!r.ok) return `browser_eval ERRO: ${r.error ?? "falha ao avaliar"}`;
      const v = r.value;
      if (v === undefined) return "browser_eval OK (undefined)";
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return `browser_eval OK: ${v}`;
      try {
        const txt = JSON.stringify(v, null, 2) ?? String(v);
        return `browser_eval OK: ${txt.slice(0, 4000)}`;
      } catch {
        return `browser_eval OK: ${String(v)}`;
      }
    },
  });

  return [open, inspect, consoleTool, links, screenshot, setViewport, measure, reload, evalTool, visualReview, analyze];
}

export type { BrowserInspection };
