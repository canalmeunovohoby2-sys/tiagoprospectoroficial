// Mensagem de commit (C4) — determinística e útil, sem mensagens genéricas.
//
// Deriva de: resumo (agent/summary) → instrução do usuário → arquivos alterados.
// Nunca devolve "update"/"changes"/"AI changes"/"modified files".

const GENERIC = new Set([
  "update", "updates", "changes", "change", "ai changes", "modified files", "modifications",
  "alterações", "alteracoes", "alteração", "alteracao", "alterações no projeto", "novo commit",
  "commit", "wip", "misc", "outros", "ajustes", "ajustes gerais",
]);

function clean(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function isGeneric(message: string): boolean {
  const m = message.toLowerCase().replace(/[.!:]+$/, "").trim();
  return !m || m.length < 4 || GENERIC.has(m);
}

function truncate(message: string, max = 72): string {
  const m = message.replace(/\s+/g, " ").trim();
  if (m.length <= max) return m;
  return `${m.slice(0, max - 1).trimEnd()}…`;
}

function pickPrimaryFile(files: string[]): string | null {
  const candidates = files.filter((f) => /\.(tsx|jsx|ts|js|css|scss|html|md|json)$/i.test(f) && !f.includes("node_modules"));
  if (candidates.length === 0) return null;
  const rank = (f: string): number => {
    if (/(^|\/)App\.[jt]sx?$/i.test(f)) return 0;
    if (/(^|\/)main\.[jt]sx?$/i.test(f)) return 1;
    if (/\.(tsx|jsx)$/i.test(f)) return 2;
    if (/\.css$/i.test(f)) return 3;
    return 4;
  };
  return candidates.sort((a, b) => (rank(a) === rank(b) ? a.localeCompare(b) : rank(a) - rank(b)))[0];
}

function humanizeFile(file: string): string {
  const base = file.split("/").pop() ?? file;
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  if (/^index$/i.test(noExt)) return "styles";
  const words = noExt
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : "project";
}

function pickVerb(instruction: string): string {
  const t = instruction.toLowerCase();
  if (/\b(remov|delet|exclu|tira|retir)/.test(t)) return "Remove";
  if (/\b(adicion|inclu|insir|crie|criar|nova|novo|acrescent)/.test(t)) return "Add";
  if (/\b(estil|cor\b|color|fonte|font|bot[ãa]o|button|background|fundo|borda|border)/.test(t)) return "Update";
  if (/\b(corrig|fix|arrum|conserta|bug|erro)/.test(t)) return "Fix";
  if (/\b(contato|telefone|whatsapp|endere[çc]o|email)/.test(t)) return "Update";
  return "Update";
}

export interface CommitMessageInput {
  summary?: string;
  instruction?: string;
  files: string[];
}

/** Gera uma mensagem de commit útil e curta. */
export function deriveCommitMessage(input: CommitMessageInput): string {
  const summary = clean(input.summary);
  if (summary && !isGeneric(summary)) return truncate(summary);

  const instruction = clean(input.instruction);
  if (instruction && !isGeneric(instruction) && instruction.length <= 72) {
    return truncate(instruction.charAt(0).toUpperCase() + instruction.slice(1));
  }

  const primary = pickPrimaryFile(input.files ?? []);
  const target = primary ? humanizeFile(primary) : "project";
  return truncate(`${pickVerb(instruction)} ${target}`);
}
