// Agent Work Activity (5.29) — transforma os EVENTOS REAIS do agente (fases +
// arquivos) numa timeline limpa, natural e curta para exibir no chat.
// Nunca inventa: se não houver eventos/arquivos, não há timeline. Cada linha é
// derivada de uma ação real (tool chamada / arquivo tocado). Não expõe
// chain-of-thought — apenas o que foi realmente executado.

export interface RawWorkActivity {
  phase: string;
  detail: string;
}

export interface WorkLine {
  icon: string;
  label: string;
}

function fileOf(detail: string): string | null {
  const m = /`([^`]+)`|(["'])([^"']+\.(?:html|css|js|json|png|svg))\2/.exec(detail);
  return m ? (m[1] ?? m[3]) : null;
}

// Converte uma atividade real em uma linha humana (somente as que são
// relevantes/legíveis). Retorna null para ruído que não agrega ao usuário.
function toWorkLine(a: RawWorkActivity): WorkLine | null {
  const phase = a.phase ?? "";
  const detail = String(a.detail ?? "").trim();
  const file = fileOf(detail);
  switch (phase) {
    case "analyzing":
      return detail ? { icon: "🔎", label: "Analisando projeto" } : null;
    case "reading":
      return file ? { icon: "📄", label: `Lendo arquivo \`${file}\`` } : detail ? { icon: "📄", label: detail } : null;
    case "editing":
    case "writing":
    case "deleting":
      return file ? { icon: "🛠️", label: `Editando \`${file}\`` } : detail ? { icon: "🛠️", label: detail } : null;
    case "researching":
      return { icon: "🌐", label: detail || "Pesquisando na web" };
    case "verifying":
      if (/visual_review|gemini|vis[aã]o/i.test(detail)) return { icon: "👁️", label: "Análise visual (Gemini)" };
      if (/navegador|browser|site/i.test(detail)) return { icon: "🌐", label: detail || "Abrindo/verificando site no navegador" };
      return null;
    case "testing":
      return { icon: "🧪", label: detail || "Executando testes/validações" };
    case "fixing":
      return file ? { icon: "🔧", label: `Corrigindo \`${file}\`` } : detail ? { icon: "🔧", label: detail } : null;
    case "done":
      return { icon: "✅", label: detail || "Concluído" };
    default:
      return null;
  }
}

// Monta a timeline (máx. `maxLines`, sem duplicar linhas consecutivas).
export function buildWorkTimeline(activity?: RawWorkActivity[] | null, changedFiles?: string[] | null, maxLines = 9): string {
  const list: WorkLine[] = [];
  const raw = (activity ?? []).filter((a) => a && typeof a.phase === "string" && typeof a.detail === "string");
  for (const a of raw) {
    const line = toWorkLine(a);
    if (!line) continue;
    const last = list[list.length - 1];
    if (last && last.icon === line.icon && last.label === line.label) continue; // mesma etapa repetida
    if (list.length >= maxLines) break;
    list.push(line);
  }

  const lines = list.map((l) => `${l.icon} ${l.label}`);
  const files = (changedFiles ?? []).filter(Boolean);
  if (files.length > 0) {
    const shown = files.slice(0, 6).map((f) => `\`${f}\``).join(", ");
    const extra = files.length > 6 ? ` e mais ${files.length - 6}` : "";
    lines.push(`📁 Arquivos alterados: ${shown}${extra}`);
  }

  if (lines.length === 0) return "";
  return `\n\n**Trabalho do agente**\n${lines.join("\n")}`;
}

/**
 * Última atividade LEGÍVEL do agente (para o indicador "o que o agente está
 * fazendo" no rodapé do chat, enquanto executa). Nunca expõe nomes de ferramentas.
 */
export function latestWorkLine(activity?: RawWorkActivity[] | null): WorkLine | null {
  const list = (activity ?? []).filter((a) => a && typeof a.phase === "string" && typeof a.detail === "string");
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const line = toWorkLine(list[i]);
    if (line) return line;
  }
  return null;
}

const LIVE_ICONS: Record<string, string> = {
  analyzing: "🔎", editing: "🛠️", researching: "🌐", testing: "🧪", fixing: "🔧", done: "✅", reviewing: "🔎",
};

function liveIcon(phase: string, detail: string): string {
  if (phase === "verifying") return /visual_review|gemini|análise visual|analise visual/i.test(detail) ? "👁️" : "🌐";
  return LIVE_ICONS[phase] ?? "⚙️";
}

function fileRef(detail: string): string | null {
  const m = /`([^`]+)`/.exec(detail ?? "");
  return m ? m[1] : null;
}

/**
 * Rótulo humano da atividade ATUAL (emoji + ação + arquivo) — MESMO texto usado
 * no chat legado, agora também no Studio.
 */
export function liveActivityLabel(phase: string, detail: string): string {
  const file = fileRef(detail);
  const loc = file ? `\`${file}\`` : null;
  switch (phase) {
    case "thinking": return "💭 Analisando a alteração…";
    case "analyzing": return loc ? `📂 Abrindo ${loc}` : "🔎 Analisando o projeto";
    case "reading": return loc ? `📂 Abrindo ${loc}` : "📂 Lendo arquivos";
    case "editing": return loc ? `✏️ Modificando ${loc}` : "🛠️ Editando arquivos";
    case "writing": return loc ? `✏️ Escrevendo ${loc}` : "🛠️ Criando arquivos";
    case "researching": return "🌐 Pesquisando na web";
    case "reviewing": return "🔍 Revisando o resultado";
    case "testing": return "🧪 Testando a alteração";
    case "verifying":
      return /visual_review|gemini|análise visual|analise visual/i.test(detail) ? "👁️ Verificando visualmente"
        : /navegador|browser/i.test(detail) ? "🌐 Verificando no navegador" : "🔍 Verificando o resultado";
    case "fixing": return loc ? `🔧 Corrigindo ${loc}` : "🔧 Corrigindo problema";
    case "done": return "✅ Finalizando";
    default: return detail ? `${liveIcon(phase, detail)} ${detail}` : "⚙️ Trabalhando";
  }
}

/** Rótulo da ÚLTIMA atividade ao vivo (para o card "Executando agora"). */
export function latestLiveLabel(activity?: RawWorkActivity[] | null): string | null {
  const list = (activity ?? []).filter((a) => a && typeof a.phase === "string" && typeof a.detail === "string");
  if (!list.length) return null;
  const last = list[list.length - 1];
  return liveActivityLabel(last.phase, last.detail);
}
