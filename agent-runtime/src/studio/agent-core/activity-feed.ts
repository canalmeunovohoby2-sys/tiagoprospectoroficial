// ATIVIDADE REAL do agente → o que o card do chat mostra NAQUELE momento.
//
// O card não pode ter texto pronto: cada evento real do runtime (ferramenta
// chamada pelo modelo / frase do próprio modelo) vira uma linha com a AÇÃO e o
// ARQUIVO exatos. Puro e testável (usado pelo /run React).

export interface ActivityLine {
  phase: "thinking" | "analyzing" | "reading" | "writing" | "editing" | "testing" | "verifying" | "researching";
  detail: string;
}

export interface InteractionLike {
  type?: string;
  agent_name?: string;
  message_type?: string;
  tool_name?: string;
  tool_arguments?: unknown;
  content?: unknown;
}

function fileOf(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  for (const k of ["path", "from", "to", "file"]) {
    if (typeof a[k] === "string" && a[k]) return a[k] as string;
  }
  return "";
}

function short(text: unknown, max = 120): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Traduz UM evento de interação em uma linha de atividade (ou null se não houver
 * nada útil a mostrar). Nunca expõe nomes de ferramentas — só ação + arquivo.
 */
export function activityForEvent(ev: InteractionLike): ActivityLine | null {
  if (!ev || ev.type !== "agent_interaction") return null;
  const agent = String(ev.agent_name ?? "Coder");
  const mt = String(ev.message_type ?? "");

  if (mt === "thought") {
    if (agent === "Planner") return { phase: "thinking", detail: "Planejando a solução…" };
    const own = short(ev.content);            // a PRÓPRIA frase do agente neste passo
    return own ? { phase: "thinking", detail: own } : null;
  }
  if (mt !== "tool_call") return null;

  const tool = String(ev.tool_name ?? "");
  const file = fileOf(ev.tool_arguments);
  const loc = file ? `\`${file}\`` : "";
  switch (tool) {
    case "write_file":
    case "create_file": return { phase: "writing", detail: loc || "criando arquivo" };
    case "edit_file": return { phase: "editing", detail: loc || "editando arquivo" };
    case "delete_file": return { phase: "editing", detail: loc ? `removendo ${loc}` : "removendo arquivo" };
    case "rename_file":
    case "move_file": return { phase: "editing", detail: loc ? `movendo ${loc}` : "movendo arquivo" };
    case "read_file": return { phase: "reading", detail: loc || "lendo arquivo" };
    case "grep_search": return { phase: "analyzing", detail: "Buscando no código…" };
    case "glob_search":
    case "file_search": return { phase: "analyzing", detail: "Procurando arquivos…" };
    case "list_files":
    case "list_dir": return { phase: "analyzing", detail: "Analisando os arquivos do projeto…" };
    case "run_command": return { phase: "testing", detail: "Executando/validando o projeto…" };
    case "design_skills": return { phase: "thinking", detail: "Consultando o guia de design…" };
    case "visual_verify": return { phase: "verifying", detail: "Verificando o site no navegador (desktop/tablet/mobile)…" };
    default: return tool ? { phase: "analyzing", detail: "Executando ação no projeto…" } : null;
  }
}
