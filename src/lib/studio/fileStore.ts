// File store do projeto React no frontend (C0).
//
// É a PROJEÇÃO do workspace do runtime para o editor + WebContainer — NÃO é uma
// segunda fonte de verdade. O fluxo é determinístico:
//   runtime workspace → files_ready (snapshot completo) → store.replaceAll()
//   → Explorer/Monaco + WebContainer (diff) → Vite/HMR
// Não há escrita independente: toda mudança vem do runtime (agente/restore) ou
// do editor, e o editor persiste de volta pelo fluxo normal (autosave).

export type StudioFileMap = Record<string, string>;

export interface ProjectFilesSnapshot {
  files: StudioFileMap;
  revision: number;
}

export class ProjectFileStore {
  private files: StudioFileMap;
  private revision = 0;
  private snapshot: ProjectFilesSnapshot;
  private listeners = new Set<() => void>();

  constructor(initial: StudioFileMap = {}) {
    this.files = { ...initial };
    this.snapshot = { files: this.files, revision: 0 };
  }

  /** Snapshot estável (mesma referência até haver mudança) — para useSyncExternalStore. */
  getSnapshot = (): ProjectFilesSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: StudioFileMap): void {
    this.files = next;
    this.revision += 1;
    this.snapshot = { files: next, revision: this.revision };
    for (const l of this.listeners) l();
  }

  /** Substitui TODO o conteúdo (semântica de `files_ready`). */
  replaceAll(files: StudioFileMap): void {
    const normalized: StudioFileMap = {};
    for (const [p, c] of Object.entries(files ?? {})) {
      if (typeof c === "string" && p) normalized[p] = c;
    }
    this.commit(normalized);
  }

  /** Cria/atualiza um arquivo. */
  setFile(path: string, content: string): void {
    if (!path || typeof content !== "string") return;
    this.commit({ ...this.files, [path]: content });
  }

  /** Remove um arquivo. */
  removeFile(path: string): void {
    if (this.files[path] === undefined) return;
    const next = { ...this.files };
    delete next[path];
    this.commit(next);
  }

  get(path: string): string | undefined {
    return this.files[path];
  }

  has(path: string): boolean {
    return this.files[path] !== undefined;
  }

  getFiles(): StudioFileMap {
    return this.files;
  }

  size(): number {
    return Object.keys(this.files).length;
  }
}

export function createProjectFileStore(initial?: StudioFileMap): ProjectFileStore {
  return new ProjectFileStore(initial);
}

/**
 * Mescla um snapshot novo no store preservando chaves ausentes? NÃO: o snapshot
 * do runtime é completo, então `replaceAll` é o correto. Esta função existe para
 * deixar explícito o contrato e é usada nos testes.
 */
export function applyFilesReady(store: ProjectFileStore, files: StudioFileMap): void {
  store.replaceAll(files);
}
