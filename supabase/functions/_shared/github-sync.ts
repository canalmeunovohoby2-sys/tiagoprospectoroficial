// GitHub por projeto — módulo PURO de preparação/segurança (5.36), compartilhado
// entre edge (Deno) e testes (Node). Não contém chamadas de rede nem tokens.
// Garante: conteúdo real do projeto → árvore de arquivos segura → .gitignore.

export interface SyncFile { path: string; content: string; encoding?: "utf-8" | "base64" }

const NEVER_ALLOWED = [
  "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE", "DEEPSEEK_API_KEY", "OPENAI_API_KEY",
  "GEMINI_API_KEY", "NVIDIA_API_KEY", "TAVILY_API_KEY", "FIRECRAWL_API_KEY",
  "GH_TOKEN", "GITHUB_TOKEN", "GITHUB_CLIENT_SECRET", "ANON_KEY", "PRIVATE KEY",
  "-----BEGIN",
];
const IGNORED_FILES = /(^|\/)(\.env(\.|$)|\.env\.local|.*\.pem$|node_modules|\.git\/|\.DS_Store|\.gitignore$)/i;
const ALLOWED_EXT = /\.(html|css|js|json|txt|md|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|eot|map|xml|yml|yaml|toml|csv)$/i;

function isSecretContent(content: string): { blocked: boolean; secret?: string } {
  if (!content) return { blocked: false };
  const hit = NEVER_ALLOWED.find((token) => content.includes(token));
  if (hit) return { blocked: true, secret: hit };
  const envLike = /(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9-]{24,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/;
  const m = content.match(envLike);
  if (m) return { blocked: true, secret: m[1].slice(0, 8) + "…" };
  return { blocked: false };
}

/** Monta a árvore segura do projeto (sem segredos/temporários). Retorna arquivos
 * prontos para o GitHub + motivo de bloqueio, se houver segredo em arquivo real. */
export function buildSafeProjectTree(files: Record<string, string>): { ok: boolean; files: SyncFile[]; blocked?: { path: string; secret: string } } {
  const out: SyncFile[] = [];
  for (const [path, content] of Object.entries(files ?? {})) {
    if (IGNORED_FILES.test(path)) continue;
    if (!ALLOWED_EXT.test(path)) continue;
    const check = isSecretContent(content);
    if (check.blocked) {
      return { ok: false, files: [], blocked: { path, secret: check.secret ?? "segredo detectado" } };
    }
    out.push({ path, content });
  }
  return { ok: true, files: out };
}

/** Detecta conflito real: para cada arquivo local que já foi sincronizado, o
 * sha remoto ATUAL (vindo da API) deve ser igual ao sha da última sincronização.
 * Se mudou por fora → conflito (bloqueia o push em vez de sobrescrever). */
export function findConflicts(
  local: SyncFile[],
  lastSync: Record<string, { sha?: string } | undefined>,
  currentRemote: Record<string, { sha?: string } | undefined>,
): string[] {
  const conflicts: string[] = [];
  const known = lastSync ?? {};
  const remote = currentRemote ?? {};
  for (const f of local) {
    const prev = known[f.path];
    if (!prev?.sha) continue; // arquivo novo ou nunca sincronizado
    const now = remote[f.path];
    if (!now?.sha) continue; // foi apagado fora → tratado como conflito também
    if (now.sha !== prev.sha) conflicts.push(f.path);
  }
  return conflicts;
}

export const GITIGNORE = `# Prospector — arquivos que nunca devem subir
.env
.env.*
*.pem
node_modules/
.DS_Store
`;
