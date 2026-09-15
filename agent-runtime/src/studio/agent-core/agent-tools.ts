// Adapter das ferramentas REAIS do workspace para o Coder C1.
//
// Reutiliza `buildSiteTools` (mesmos guards de path/segredo, allowlist de
// comando, timeout e limites de saída) — não duplica segurança. Aqui apenas
// expomos um schema JSON estável para o modelo e delegamos a execução.

import { buildSiteTools, type ToolEnv } from "../../tools.js";
import { designSkillsKnowledge, DESIGN_SKILL_TOPICS } from "./design-skills.js";
import { runVisualVerification, prepareServeDirForRoot, noteVisualResult, visualState, VISUAL_MAX_CYCLES } from "./visual-verify.js";
import { buildReactProject } from "../build.js";
import type { AgentToolSchema } from "./model.js";

export interface CoderTool {
  schema: AgentToolSchema;
  execute(args: Record<string, unknown>): Promise<string>;
}

interface UnderlyingTool {
  name: string;
  description?: string;
  execute: (input: never) => Promise<string>;
}

const STR = { type: "string" } as const;
const STR_OPT = { type: "string" } as const;

/** Schemas expostos ao modelo (contratos explícitos e estáveis). */
const SCHEMAS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  read_file: { description: "Lê um arquivo de texto do projeto (path relativo).", parameters: { type: "object", properties: { path: STR }, required: ["path"] } },
  write_file: { description: "Cria/sobrescreve um arquivo com o conteúdo completo.", parameters: { type: "object", properties: { path: STR, content: STR }, required: ["path", "content"] } },
  edit_file: { description: "Substitui um trecho EXATO e ÚNICO do arquivo (edição cirúrgica).", parameters: { type: "object", properties: { path: STR, find: STR, replace: STR, occurrence: { type: "integer" } }, required: ["path", "find", "replace"] } },
  create_file: { description: "Cria um arquivo NOVO (recusa se já existir).", parameters: { type: "object", properties: { path: STR, content: STR_OPT }, required: ["path"] } },
  delete_file: { description: "Remove um arquivo do projeto.", parameters: { type: "object", properties: { path: STR }, required: ["path"] } },
  rename_file: { description: "Renomeia/move um arquivo (from → to).", parameters: { type: "object", properties: { from: STR, to: STR }, required: ["from", "to"] } },
  move_file: { description: "Move um arquivo (from → to).", parameters: { type: "object", properties: { from: STR, to: STR }, required: ["from", "to"] } },
  list_files: { description: "Lista a árvore de arquivos do projeto.", parameters: { type: "object", properties: { path: STR_OPT }, required: [] } },
  list_dir: { description: "Lista o conteúdo imediato de um diretório.", parameters: { type: "object", properties: { path: STR_OPT }, required: [] } },
  glob_search: { description: "Busca arquivos por padrão glob (ex.: **/*.tsx).", parameters: { type: "object", properties: { pattern: STR, path: STR_OPT }, required: ["pattern"] } },
  grep_search: { description: "Busca texto/regex no conteúdo dos arquivos.", parameters: { type: "object", properties: { pattern: STR, path: STR_OPT, glob: STR_OPT, maxResults: { type: "integer" } }, required: ["pattern"] } },
  file_search: { description: "Encontra arquivos pelo nome/caminho.", parameters: { type: "object", properties: { query: STR, maxResults: { type: "integer" } }, required: ["query"] } },
  run_command: { description: "Executa comando controlado do projeto: action=install|ci|run (npm run <script>).", parameters: { type: "object", properties: { action: { type: "string", enum: ["install", "ci", "run"] }, script: STR_OPT, timeoutMs: { type: "integer" } }, required: ["action"] } },
};

// Ferramentas de workspace + "design_skills" (conhecimento instalado, não é
// operação de workspace; implementada abaixo).
export const CODER_TOOL_NAMES: string[] = [...Object.keys(SCHEMAS), "design_skills", "visual_verify"];

export function buildCoderTools(env: ToolEnv): { list: CoderTool[]; byName: Map<string, CoderTool> } {
  const built = buildSiteTools(env) as unknown as UnderlyingTool[];
  const byName = new Map<string, CoderTool>();
  const list: CoderTool[] = [];

  for (const name of CODER_TOOL_NAMES) {
    const underlying = built.find((t) => t.name === name);
    if (!underlying) continue;
    const meta = SCHEMAS[name];
    const tool: CoderTool = {
      schema: { name, description: meta.description, parameters: meta.parameters },
      execute: (args) => underlying.execute(args as never),
    };
    byName.set(name, tool);
    list.push(tool);
  }

  // Ferramenta de CONHECIMENTO INSTALADO (não é operação de workspace): o guia de
  // design premium fica disponível para consulta sob demanda. Não entra no prompt
  // e só consome tokens se (e quando) o agente decidir consultar.
  const designTool: CoderTool = {
    schema: {
      name: "design_skills",
      description: "Consulta o guia INSTALADO de design premium (direção de arte, paleta/tipografia, CRO/UX, copy, componentes, motion, mobile, performance, mídia, mapas). Use ao criar ou reformular o visual, quando precisar da técnica. Sem `topic` devolve o guia completo; com `topic`, só a seção.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", enum: DESIGN_SKILL_TOPICS, description: "Tópico específico (opcional)." },
        },
        required: [],
      },
    },
    execute: async (args) => designSkillsKnowledge(typeof args.topic === "string" ? args.topic : null),
  };
  byName.set("design_skills", designTool);
  list.push(designTool);

  // VISUAL VERIFIER: OBSERVA o site REAL no Chromium (desktop/tablet/mobile) e
  // RELATA PASS/FAIL. Nunca edita arquivos — quem corrige é o DeepSeek.
  const visualTool: CoderTool = {
    schema: {
      name: "visual_verify",
      description: "Verificação VISUAL do site real no Chromium (desktop 1366, tablet 768, mobile 390): renderiza, checa erros de console/imagens quebradas/overflow, coleta cores efetivamente renderizadas e diz se o pedido foi cumprido (PASS/FAIL) — inclusive se sobrou a identidade ANTIGA. Use depois de alterar o visual e antes de concluir. Não edita arquivos.",
      parameters: { type: "object", properties: { objective: { type: "string", description: "O que deveria ter mudado (opcional; usa o pedido do usuário)." } }, required: [] },
    },
    execute: async (args) => {
      const root = env.workspaceRoot;
      const objective = (typeof args.objective === "string" && args.objective.trim())
        ? args.objective.trim()
        : (env as { instruction?: string }).instruction ?? "";
      const st = visualState(root);
      if (st.fails >= VISUAL_MAX_CYCLES) {
        return `VISUAL VERIFICATION: FAIL\n\nLimite de ${VISUAL_MAX_CYCLES} ciclos de correção atingido.\nRequired action:\nPare de tentar e informe ao usuário o que ainda está incorreto (não declare concluído).`;
      }
      let temp: string | undefined;
      try {
        const serve = await prepareServeDirForRoot(root, buildReactProject);
        temp = serve.temp;
        const result = await runVisualVerification({ serveDir: serve.dir, objective });
        noteVisualResult(root, result.verdict, result.report);
        return result.report;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return `VISUAL VERIFICATION: FAIL\n\nNão foi possível verificar visualmente: ${msg}\nRequired action:\nCorrija o build/erro acima e rode visual_verify de novo. Não conclua.`;
      } finally {
        if (temp) { try { const { rmSync } = await import("node:fs"); rmSync(temp, { recursive: true, force: true }); } catch { /* noop */ } }
      }
    },
  };
  byName.set("visual_verify", visualTool);
  list.push(visualTool);

  return { list, byName };
}
