import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { AlertTriangle, Check, ExternalLink, FileDiff, GitBranch, History, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  invokeStudioGit,
  type StudioGitCommit,
  type StudioGitDiff,
  type StudioGitDiffFile,
  type StudioGitLog,
  type StudioGitShow,
  type StudioGitStatus,
} from "@/lib/studio/gitApi";
import { buildUnifiedDiff, diffSummary } from "@/lib/studio/gitFiles";
import { languageForPath } from "@/lib/studio/fileTree";
import type { StudioFileMap } from "@/lib/studio/types";

export interface StudioGitRestoreMeta {
  hash: string;
  short: string;
  message: string;
}

export interface StudioHistoryDialogProps {
  open: boolean;
  projectId: string;
  userId?: string;
  /** Estado ATUAL do editor (fonte única da Fase 3). */
  files: StudioFileMap;
  /** Há alterações persistidas não commitadas? (serão snapshot antes do restore) */
  dirty: boolean;
  /** Motivo para BLOQUEAR o restore (ex.: buffer do editor não salvo). */
  blockedReason?: string;
  busy?: boolean;
  onClose: () => void;
  onRestore: (files: StudioFileMap, meta: StudioGitRestoreMeta) => Promise<void> | void;
  onOpenInternalVersions?: () => void;
  /** Abre o arquivo no Monaco (respeita o editor atual). */
  onOpenFile?: (file: string, line?: number) => void;
}

const WORKTREE = "worktree";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

/**
 * Histórico Git REAL do projeto (Fase 6): log, diff entre estados e time travel.
 * O estado restaurado volta pelo `onRestore` (o container persiste em
 * generated_code/versão e sincroniza Monaco/Explorer/Preview).
 */
export function StudioHistoryDialog({
  open,
  projectId,
  userId,
  files,
  dirty,
  blockedReason,
  busy = false,
  onClose,
  onRestore,
  onOpenInternalVersions,
  onOpenFile,
}: StudioHistoryDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StudioGitStatus | null>(null);
  const [commits, setCommits] = useState<StudioGitCommit[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string>(WORKTREE);

  const [diffFiles, setDiffFiles] = useState<StudioGitDiffFile[]>([]);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const filesRef = useRef(files);
  filesRef.current = files;
  const selectedHashRef = useRef(selectedHash);
  selectedHashRef.current = selectedHash;

  const editorTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "vs-dark" : "light";

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [st, lg] = await Promise.all([
      invokeStudioGit<StudioGitStatus>({ action: "status", projectId, userId, files: filesRef.current }),
      invokeStudioGit<StudioGitLog>({ action: "log", projectId, userId, files: filesRef.current, limit: 80 }),
    ]);
    setStatus(st.ok ? st : null);
    if (!lg.ok) {
      setCommits([]);
      setError(lg.error ?? "Não foi possível carregar o histórico Git.");
    } else {
      setCommits(lg.commits);
      if (lg.commits[0] && !selectedHashRef.current) setSelectedHash(lg.commits[0].hash);
    }
    setLoading(false);
  }, [projectId, userId]);

  const loadDiff = useCallback(async () => {
    if (!selectedHash) return;
    setDiffError(null);
    const diff = await invokeStudioGit<StudioGitDiff>({
      action: "diff",
      projectId,
      userId,
      files: filesRef.current,
      from: selectedHash,
      to: compareTo === WORKTREE ? undefined : compareTo,
    });
    if (!diff.ok) {
      setDiffFiles([]);
      setSelectedFile(null);
      setDiffError(diff.error ?? "Não foi possível carregar o diff.");
      return;
    }
    setDiffFiles(diff.files);
    setSelectedFile(diff.files[0]?.path ?? null);
  }, [projectId, userId, selectedHash, compareTo]);

  const loadFileContents = useCallback(async () => {
    if (!selectedHash || !selectedFile) {
      setOriginal("");
      setModified("");
      return;
    }
    setFileLoading(true);
    setFileError(null);
    const orig = await invokeStudioGit<StudioGitShow>({ action: "show", projectId, userId, files: filesRef.current, hash: selectedHash, path: selectedFile });
    let mod = "";
    if (compareTo === WORKTREE) {
      mod = filesRef.current[selectedFile] ?? "";
    } else {
      const m = await invokeStudioGit<StudioGitShow>({ action: "show", projectId, userId, files: filesRef.current, hash: compareTo, path: selectedFile });
      if (!m.ok) setFileError(m.error ?? "Arquivo não encontrado no estado comparado.");
      mod = m.ok ? m.content : "";
    }
    if (!orig.ok) setFileError(orig.error ?? "Arquivo não encontrado no commit selecionado.");
    setOriginal(orig.ok ? orig.content : "");
    setModified(mod);
    setFileLoading(false);
  }, [projectId, userId, selectedHash, selectedFile, compareTo]);

  useEffect(() => {
    if (!open) return;
    setConfirmRestore(false);
    setNote(null);
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  useEffect(() => {
    if (!open || !selectedHash) return;
    void loadDiff();
  }, [open, selectedHash, compareTo, loadDiff]);

  useEffect(() => {
    if (!open) return;
    void loadFileContents();
  }, [open, selectedFile, loadFileContents]);

  const patch = useMemo(
    () => (selectedFile ? buildUnifiedDiff(original, modified, selectedFile) : null),
    [original, modified, selectedFile],
  );

  if (!open) return null;

  const selectedCommit = commits.find((c) => c.hash === selectedHash) ?? null;
  const repoUnavailable = !loading && (!!error || (status && !status.repo));

  const handleCommit = async () => {
    const message = commitMsg.trim();
    if (!message || committing) return;
    setCommitting(true);
    const res = await invokeStudioGit<{ ok: boolean; committed: boolean; short?: string; reason?: string; error?: string }>({
      action: "commit",
      projectId,
      userId,
      files: filesRef.current,
      message,
    });
    setCommitting(false);
    if (!res.ok) {
      setNote({ ok: false, text: res.error ?? "Falha ao criar checkpoint." });
      return;
    }
    if (!res.committed) {
      setNote({ ok: false, text: res.reason ?? "Sem alterações para commit." });
      return;
    }
    setCommitMsg("");
    setNote({ ok: true, text: `Checkpoint ${res.short ?? ""} criado.` });
    await loadHistory();
  };

  const handleRestore = async () => {
    if (!selectedCommit || restoring || blockedReason) return;
    setRestoring(true);
    const res = await invokeStudioGit<{ ok: boolean; files: StudioFileMap; error?: string }>({
      action: "restore",
      projectId,
      userId,
      files: filesRef.current,
      hash: selectedCommit.hash,
    });
    setRestoring(false);
    setConfirmRestore(false);
    if (!res.ok) {
      setNote({ ok: false, text: res.error ?? "Falha ao restaurar o estado." });
      return;
    }
    await onRestore(res.files, { hash: selectedCommit.hash, short: selectedCommit.short, message: selectedCommit.message });
    setNote({ ok: true, text: `Projeto restaurado para ${selectedCommit.short}.` });
    await loadHistory();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-[86vh] w-full max-w-[1200px] overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Coluna do histórico */}
        <div className="flex w-[300px] shrink-0 flex-col border-r">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Histórico Git
            </p>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar histórico">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="font-medium">{status?.branch ?? "—"}</span>
            {status && (
              status.clean
                ? <span className="ml-auto inline-flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> sem alterações</span>
                : <span className="ml-auto text-amber-600">{status.entries.length} não commitada(s)</span>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 [scrollbar-width:thin]">
            {loading && <p className="flex justify-center px-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></p>}
            {!loading && repoUnavailable && (
              <div className="space-y-2 px-2 py-3 text-[11px] text-muted-foreground">
                <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {error ?? "Git indisponível neste projeto."}</p>
                {onOpenInternalVersions && (
                  <Button size="sm" variant="outline" className="h-7 w-full" onClick={onOpenInternalVersions}>Ver versões internas</Button>
                )}
              </div>
            )}
            {!loading && !repoUnavailable && commits.length === 0 && (
              <p className="px-3 py-6 text-xs text-muted-foreground">Nenhum checkpoint ainda. Crie um abaixo para iniciar o histórico.</p>
            )}
            {commits.map((c) => (
              <button
                key={c.hash}
                onClick={() => { setSelectedHash(c.hash); setConfirmRestore(false); }}
                className={`w-full rounded-xl border p-2.5 text-left transition-colors ${selectedHash === c.hash ? "border-primary/50 bg-primary/8" : "border-border/70 hover:border-primary/30"}`}
              >
                <p className="truncate text-xs font-semibold">{c.message}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">{c.short} · {formatDate(c.date)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">{c.files.length} arquivo(s){c.author ? ` · ${c.author}` : ""}</p>
              </button>
            ))}
          </div>

          <div className="shrink-0 space-y-1.5 border-t p-3">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCommit(); }}
              placeholder="Mensagem do checkpoint…"
              className="h-8 w-full rounded-md border border-border/70 bg-background px-2 text-[12px] outline-none focus:border-primary/50"
            />
            <Button size="sm" className="h-8 w-full" disabled={committing || !commitMsg.trim()} onClick={() => void handleCommit()}>
              {committing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Criar checkpoint
            </Button>
            {note && (
              <p className={`text-[10.5px] ${note.ok ? "text-emerald-600" : "text-amber-600"}`}>{note.text}</p>
            )}
            {onOpenInternalVersions && (
              <button onClick={onOpenInternalVersions} className="w-full text-[10.5px] text-muted-foreground underline-offset-2 hover:underline">
                Ver versões internas (autosave)
              </button>
            )}
          </div>
        </div>

        {/* Diff + restore */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedCommit?.message ?? "Selecione um checkpoint"}</p>
              {selectedCommit && <p className="text-[11px] text-muted-foreground">{selectedCommit.short} · {formatDate(selectedCommit.date)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Comparar com
                <select
                  value={compareTo}
                  onChange={(e) => setCompareTo(e.target.value)}
                  className="h-7 rounded-md border border-border/70 bg-background px-1.5 text-[11px]"
                >
                  <option value={WORKTREE}>Estado atual (não commitado)</option>
                  {commits.filter((c) => c.hash !== selectedHash).map((c) => (
                    <option key={c.hash} value={c.hash}>{c.short} · {c.message.slice(0, 40)}</option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="outline" disabled={!selectedCommit || restoring || busy || !!blockedReason} onClick={() => setConfirmRestore(true)} title={blockedReason ?? (dirty ? "As alterações atuais serão salvas como snapshot antes de restaurar" : "Restaurar este estado")}>
                {restoring ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />} Restaurar
              </Button>
            </div>
          </div>

          {blockedReason && (
            <p className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-[11px] text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> {blockedReason}
            </p>
          )}
          {dirty && !blockedReason && (
            <p className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-1.5 text-[11px] text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Há alterações não commitadas — elas serão salvas como <strong>snapshot</strong> antes de restaurar.
            </p>
          )}

          {confirmRestore && selectedCommit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/5 px-4 py-2 text-[11.5px]">
              <span>
                Restaurar o projeto para <strong>{selectedCommit.short}</strong> ({selectedCommit.message})? Isso substitui os arquivos reais e cria um novo commit.
                {dirty && " Suas alterações não commitadas serão salvas antes."}
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" className="h-7" disabled={restoring} onClick={() => void handleRestore()}>
                  {restoring ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Confirmar restauração
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmRestore(false)}>Cancelar</Button>
              </span>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {/* Lista de arquivos do diff */}
            <div className="flex w-[230px] shrink-0 flex-col border-r">
              <p className="shrink-0 border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Arquivos ({diffFiles.length})
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                {diffError && <p className="px-2 py-2 text-[10.5px] text-amber-600">{diffError}</p>}
                {!diffError && diffFiles.length === 0 && <p className="px-2 py-3 text-[10.5px] text-muted-foreground">Sem diferenças entre os estados.</p>}
                {diffFiles.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFile(f.path)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] ${selectedFile === f.path ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                  >
                    <FileDiff className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate" title={f.path}>{f.path}</span>
                    <span className="shrink-0 text-[10px] text-emerald-600">+{f.additions}</span>
                    <span className="shrink-0 text-[10px] text-red-500">−{f.deletions}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor de diff */}
            <div className="relative min-w-0 flex-1 bg-background">
              {fileLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-xs text-muted-foreground">
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> carregando diff…
                </div>
              )}
              {fileError && <p className="border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[10.5px] text-amber-600">{fileError}</p>}
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between border-b px-3 py-1 text-[10.5px] text-muted-foreground">
                    <span className="truncate">{selectedFile}</span>
                    <span className="flex items-center gap-2">
                      <span>{patch ? diffSummary(patch.additions, patch.deletions) : "sem alterações"}</span>
                      {onOpenFile && (
                        <button type="button" onClick={() => onOpenFile(selectedFile)} className="inline-flex items-center gap-1 hover:text-foreground" title="Abrir no editor">
                          <ExternalLink className="h-3 w-3" /> abrir
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="h-[calc(100%-26px)]">
                    <DiffEditor
                      height="100%"
                      language={languageForPath(selectedFile)}
                      original={original}
                      modified={modified}
                      theme={editorTheme}
                      options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, fontSize: 12 }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Selecione um arquivo para comparar antes/depois.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
