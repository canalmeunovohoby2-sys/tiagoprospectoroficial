import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { buildFileTree, baseName } from "@/lib/studio/fileTree";
import type { StudioFileMap, StudioFileNode } from "@/lib/studio/types";

export interface StudioFileExplorerProps {
  files: StudioFileMap;
  selectedPath: string | null;
  dirtyPaths: string[];
  onSelect: (path: string) => void;
  onCreate: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
}

export function StudioFileExplorer({ files, selectedPath, dirtyPaths, onSelect, onCreate, onRename, onDelete }: StudioFileExplorerProps) {
  const paths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b, "pt-BR")), [files]);
  const tree = useMemo(() => buildFileTree(paths), [paths]);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const [creating, setCreating] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const dirty = useMemo(() => new Set(dirtyPaths), [dirtyPaths]);

  // Abre os diretórios de topo na primeira carga (o workspace é prefixado pelo
  // slug do projeto, senão a árvore apareceria totalmente recolhida).
  useEffect(() => {
    if (paths.length === 0) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const p of paths) {
        const idx = p.indexOf("/");
        if (idx > 0) next.add(p.slice(0, idx));
      }
      return next;
    });
  }, [paths]);

  // Garante que os diretórios-pai do arquivo ativo estejam abertos.
  useEffect(() => {
    if (!selectedPath) return;
    const parts = selectedPath.split("/");
    const dirs: string[] = [];
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirs.push(acc);
    }
    if (dirs.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const d of dirs) next.add(d);
      return next;
    });
  }, [selectedPath]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const commitCreate = () => {
    const value = draft.trim();
    if (value) onCreate(value);
    setCreating(null);
    setDraft("");
  };

  const commitRename = (oldPath: string) => {
    const value = draft.trim();
    if (value && value !== oldPath) onRename(oldPath, value);
    setRenaming(null);
    setDraft("");
  };

  const matches = query.trim()
    ? paths.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase()))
    : null;

  const renderFileRow = (path: string, depth: number) => {
    const isRenaming = renaming === path;
    const active = selectedPath === path;
    return (
      <div
        key={path}
        className={`group flex items-center gap-1 rounded-md pr-1 text-[12px] ${active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {isRenaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitRename(path)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(path);
              if (e.key === "Escape") { setRenaming(null); setDraft(""); }
            }}
            className="my-0.5 min-w-0 flex-1 rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[11px] outline-none"
          />
        ) : (
          <>
            <button type="button" onClick={() => onSelect(path)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left" title={path}>
              <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{baseName(path)}</span>
              {dirty.has(path) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="não salvo" />}
            </button>
            <button type="button" onClick={() => { setRenaming(path); setDraft(path); }} className="hidden shrink-0 text-muted-foreground hover:text-foreground group-hover:block" title="Renomear" aria-label={`Renomear ${path}`}>
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => onDelete(path)} className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block" title="Excluir" aria-label={`Excluir ${path}`}>
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  const renderNode = (node: StudioFileNode, depth: number): React.ReactNode => {
    if (!node.isDir) return renderFileRow(node.path, depth);
    const open = expanded.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => toggleDir(node.path)}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-1 text-left text-[12px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/70" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2.5 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Arquivos</p>
        <button
          type="button"
          onClick={() => { setCreating(""); setDraft(""); }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title="Novo arquivo"
          aria-label="Novo arquivo"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="shrink-0 px-2.5 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar arquivo…"
            className="w-full rounded-md border border-border/70 bg-background py-1.5 pl-7 pr-7 text-[12px] outline-none focus:border-primary/50"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {creating !== null && (
        <div className="shrink-0 px-2.5 pb-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") { setCreating(null); setDraft(""); }
            }}
            placeholder="caminho/arquivo.html"
            className="w-full rounded-md border border-primary/50 bg-background px-2 py-1 text-[11px] outline-none"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:thin]">
        {paths.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">Nenhum arquivo ainda. Gere o site para criar o workspace.</p>
        ) : matches ? (
          matches.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">Nenhum arquivo corresponde à busca.</p>
          ) : (
            matches.map((p) => renderFileRow(p, 0))
          )
        ) : (
          tree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
