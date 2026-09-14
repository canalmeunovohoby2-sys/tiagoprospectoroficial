// Camada de serviço do WebContainer (C0).
//
// O WebContainer é tratado como PROJEÇÃO dos arquivos do projeto:
//   runtime workspace → files_ready → file store → syncFiles() → Vite/HMR
//
// Responsabilidades: boot (singleton), mount inicial, instalar deps (1x),
// iniciar o dev server (1x), detectar a URL/porta via `server-ready`, escrever/
// atualizar arquivos por DIFF, desmontar, e evitar boots/dev-servers duplicados
// e race conditions.
//
// A API real (`@webcontainer/api`) é carregada por dynamic import dentro do
// adapter padrão, o que permite injetar um adapter falso nos testes (Node/jsdom
// não executam WebContainer real).

export interface WCFileSystem {
  writeFile(path: string, content: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  readFile(path: string, encoding: string): Promise<string>;
  /** Cria diretório. `writeFile` NÃO cria pastas-pai — necessário antes de escrever. */
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface WCProcess {
  output?: ReadableStream<unknown> | null;
  exit: Promise<number>;
  kill?: () => void;
}

export interface WCInstance {
  mount(tree: unknown): Promise<void>;
  spawn(command: string, args: string[]): Promise<WCProcess>;
  on(event: "server-ready", listener: (port: number, url: string) => void): void | (() => void);
  fs: WCFileSystem;
  teardown(): Promise<void>;
}

export interface WebContainerAdapter {
  boot(): Promise<WCInstance>;
}

const defaultAdapter: WebContainerAdapter = {
  async boot() {
    const mod = await import("@webcontainer/api");
    return mod.WebContainer.boot() as unknown as WCInstance;
  },
};

export interface WebContainerServiceOptions {
  installTimeoutMs?: number;
  serverTimeoutMs?: number;
  /** Pula `npm install` (usado em testes ou quando o cache já existe). */
  skipInstall?: boolean;
}

export type ServiceLog = (message: string) => void;

export interface WebContainerService {
  ensureBooted(onLog?: ServiceLog): Promise<WCInstance>;
  /** Boot + mount + install (1x) + dev server. Idempotente e à prova de corrida. */
  load(files: Record<string, string>, onLog?: ServiceLog, projectId?: string): Promise<string>;
  /** Sincroniza um snapshot por diff (add/update/remove) — HMR cuida do resto. */
  syncFiles(files: Record<string, string>, onLog?: ServiceLog): Promise<{ updated: number; removed: number }>;
  isReady(): boolean;
  getUrl(): string | null;
  /** projectId do projeto atualmente montado (isolamento entre projetos). */
  getProjectId(): string | null;
  getInstance(): WCInstance | null;
  teardown(): Promise<void>;
}

/** Converte `{ "src/App.tsx": "..." }` na árvore de arquivos do WebContainer. */
export function toFileSystemTree(files: Record<string, string>): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const [path, content] of Object.entries(files ?? {})) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let current = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts[i];
      const existing = current[dir] as { directory?: Record<string, unknown> } | undefined;
      if (!existing || !existing.directory) current[dir] = { directory: {} };
      current = (current[dir] as { directory: Record<string, unknown> }).directory;
    }
    current[parts[parts.length - 1]] = { file: { contents: content ?? "" } };
  }
  return tree;
}

export function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").replace(/\[[\d]+[GK]/g, "").trim();
}

function pipeOutput(proc: WCProcess, onLog?: ServiceLog): void {
  if (!proc?.output) return;
  try {
    void proc.output
      .pipeTo(new WritableStream({ write(chunk) { const clean = stripAnsi(String(chunk)); if (clean) onLog?.(clean); } }))
      .catch(() => { /* stream encerrado */ });
  } catch {
    /* stream indisponível */
  }
}

/**
 * Garante o diretório-pai antes de escrever. O `fs.writeFile` do WebContainer
 * cria o ARQUIVO, mas não as PASTAS novas (ex.: `src/components/`), então um
 * arquivo gerado pelo agente num diretório novo falharia com ENOENT e abortaria
 * o sync — deixando o preview preso no template.
 */
async function ensureParentDir(container: WCInstance, path: string): Promise<void> {
  const normalized = String(path ?? "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return;
  const dir = normalized.slice(0, idx);
  if (!dir || dir === "." || !container.fs.mkdir) return;
  try { await container.fs.mkdir(dir, { recursive: true }); } catch { /* já existe */ }
}

export function createWebContainerService(
  adapter: WebContainerAdapter = defaultAdapter,
  options: WebContainerServiceOptions = {},
): WebContainerService {
  const installTimeoutMs = options.installTimeoutMs ?? 240_000;
  const serverTimeoutMs = options.serverTimeoutMs ?? 60_000;

  let instance: WCInstance | null = null;
  let bootPromise: Promise<WCInstance> | null = null;
  let loadPromise: Promise<string> | null = null;
  let mountedProjectId: string | null = null;
  let devUrl: string | null = null;
  let depsInstalled = false;
  let devProcess: WCProcess | null = null;
  const cache = new Map<string, string>();

  async function ensureBooted(onLog?: ServiceLog): Promise<WCInstance> {
    if (instance) return instance;
    if (!bootPromise) {
      onLog?.("[WebContainer] inicializando…");
      bootPromise = adapter
        .boot()
        .then((i) => { instance = i; return i; })
        .catch((e) => { bootPromise = null; throw e; });
    }
    return bootPromise;
  }

  async function runNpmInstall(container: WCInstance, onLog?: ServiceLog): Promise<void> {
    onLog?.("[WebContainer] instalando dependências (npm install)…");
    const proc = await container.spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--progress=false", "--loglevel=error"]);
    pipeOutput(proc, onLog);
    const code = await Promise.race([
      proc.exit,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error("npm install timeout")), installTimeoutMs)),
    ]);
    if (code !== 0) throw new Error(`npm install falhou (exit ${code})`);
    depsInstalled = true;
    onLog?.("[WebContainer] dependências instaladas.");
  }

  function waitForServer(container: WCInstance, onLog?: ServiceLog): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`dev server não ficou pronto em ${Math.round(serverTimeoutMs / 1000)}s`));
      }, serverTimeoutMs);
      const handler = (port: number, url: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        devUrl = url;
        onLog?.(`[WebContainer] dev server pronto em ${url} (porta ${port})`);
        resolve(url);
      };
      try {
        container.on("server-ready", handler);
      } catch (e) {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error("falha ao escutar server-ready"));
      }
    });
  }

  async function startDevServer(container: WCInstance, onLog?: ServiceLog): Promise<string> {
    if (devUrl) return devUrl;
    if (devProcess) return waitForServer(container, onLog);
    const ready = waitForServer(container, onLog);
    onLog?.("[WebContainer] iniciando Vite (npm run dev)…");
    devProcess = await container.spawn("npm", ["run", "dev"]);
    pipeOutput(devProcess, onLog);
    return ready;
  }

  async function load(files: Record<string, string>, onLog?: ServiceLog, projectId?: string): Promise<string> {
    const pid = String(projectId ?? mountedProjectId ?? "default");
    // ISOLAMENTO: um projeto diferente NUNCA reutiliza a instância anterior.
    if (loadPromise && mountedProjectId !== pid) {
      await teardown();
    }
    if (loadPromise) return loadPromise;
    mountedProjectId = pid;
    loadPromise = (async () => {
      try {
        const container = await ensureBooted(onLog);
        onLog?.(`[WebContainer] montando ${Object.keys(files).length} arquivo(s)…`);
        await container.mount(toFileSystemTree(files));
        cache.clear();
        for (const [p, c] of Object.entries(files)) cache.set(p, c);
        if (!depsInstalled && !options.skipInstall) await runNpmInstall(container, onLog);
        return await startDevServer(container, onLog);
      } catch (e) {
        loadPromise = null;
        throw e;
      }
    })();
    return loadPromise;
  }

  async function syncFiles(files: Record<string, string>, onLog?: ServiceLog): Promise<{ updated: number; removed: number }> {
    const container = instance;
    if (!container) return { updated: 0, removed: 0 };
    const incoming = new Set(Object.keys(files));
    const toUpdate: Array<[string, string]> = [];
    for (const [p, c] of Object.entries(files)) {
      if (cache.get(p) !== c) toUpdate.push([p, c]);
    }
    const toRemove: string[] = [];
    for (const cached of cache.keys()) if (!incoming.has(cached)) toRemove.push(cached);

    for (const p of toRemove) {
      try { await container.fs.rm(p, { force: true }); } catch { /* ignora */ }
      cache.delete(p);
    }
    // Escritas sequenciais: reduz corrida de HMR (mesmo cuidado do DaveLovable).
    for (const [p, c] of toUpdate) {
      await ensureParentDir(container, p);
      await container.fs.writeFile(p, c);
      cache.set(p, c);
    }
    if (toUpdate.length || toRemove.length) {
      onLog?.(`[WebContainer] sync: ${toUpdate.length} atualizado(s), ${toRemove.length} removido(s).`);
    }
    return { updated: toUpdate.length, removed: toRemove.length };
  }

  async function teardown(): Promise<void> {
    try { devProcess?.kill?.(); } catch { /* noop */ }
    devProcess = null;
    devUrl = null;
    depsInstalled = false;
    cache.clear();
    mountedProjectId = null;
    const current = instance;
    instance = null;
    bootPromise = null;
    loadPromise = null;
    if (current) { try { await current.teardown(); } catch { /* noop */ } }
  }

  return {
    ensureBooted,
    load,
    syncFiles,
    isReady: () => !!devUrl,
    getUrl: () => devUrl,
    getProjectId: () => mountedProjectId,
    getInstance: () => instance,
    teardown,
  };
}
