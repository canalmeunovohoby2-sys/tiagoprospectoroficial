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
