import { useCallback, useEffect, useState } from "react";
import { Github, Loader2, RefreshCw, Plug, Unplug, ExternalLink, Plus, FolderPlus, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Repo { id: number; name: string; owner: string; fullName?: string; private?: boolean; defaultBranch?: string }
interface LinkState { owner: string; repo: string; branch: string; synced_commit?: string | null; synced_at?: string | null; status?: string }
type Status = { connected?: boolean; login?: string; repo?: Repo | null; link?: LinkState | null; error?: string } | null;

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("github", { body: { action, ...body } });
  if (error) throw new Error(error.message || "Erro no GitHub");
  return data as Record<string, unknown>;
}

export function GitHubProjectButton({ projectId, userId }: { projectId: string; userId?: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = (await call("status")) as { connected?: boolean; login?: string };
      let link: LinkState | null = null;
      if (projectId) {
        const r = (await call("link_status", { projectId })) as { link?: LinkState | null };
        link = r.link ?? null;
      }
      setStatus({ ...s, link });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro");
    }
  }, [projectId]);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data && (ev.data as { type?: string }).type === "github_oauth_success") {
        setNotice("Conta GitHub conectada.");
        setBusy(false);
        void refresh();
      }
    };
    const onFocus = () => {
      // Fallback: quando o usuário volta do popup, atualiza o status da conexão.
      if (open) setTimeout(() => void refresh(), 600);
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [open, refresh]);

  async function connect() {
    setBusy(true); setNotice(null);
    try {
      const r = (await call("oauth_start", { appOrigin: window.location.origin.replace(/\/$/, "") })) as { authorizeUrl?: string };
      if (!r.authorizeUrl) throw new Error("OAuth não configurado no servidor");
      const w = window.open(r.authorizeUrl, "_blank", "width=640,height=720");
      if (!w) throw new Error("Bloqueio de pop-up — permita pop-ups");
      const poll = setInterval(async () => {
        const s = (await call("status")) as { connected?: boolean };
        if (s.connected) { clearInterval(poll); w.close(); setNotice("Conta GitHub conectada."); await refresh(); setBusy(false); }
      }, 3000);
      setTimeout(() => { clearInterval(poll); setBusy(false); }, 120000);
    } catch (e) { setBusy(false); setNotice(e instanceof Error ? e.message : "Falha"); }
  }

  async function listRepos() {
    setBusy(true); setNotice(null);
    try { const r = (await call("list_repos")) as { repos?: Repo[] }; setRepos(r.repos ?? []); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function createRepo() {
    setBusy(true); setNotice(null);
    try {
      const r = (await call("create_repo", { name: repoName.trim(), private: isPrivate })) as { repo?: Repo };
      if (!r.repo) throw new Error("Falha ao criar");
      const l = (await call("link", { projectId, owner: r.repo.owner, repo: r.repo.name, branch: r.repo.defaultBranch ?? "main" })) as { status?: string };
      setNotice(l.status === "linked" ? "Repositório criado e vinculado." : "Repositório criado.");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function selectRepo(owner: string, name: string, branch?: string) {
    setBusy(true); setNotice(null);
    try { await call("link", { projectId, owner, repo: name, branch: branch ?? "main" }); setNotice("Projeto vinculado."); await refresh(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setNotice(null);
    try {
      const r = await call("sync", { projectId });
      setNotice((r as { status?: string }).status === "synced" ? "Projeto sincronizado com o GitHub." : `Status: ${String((r as { status?: string }).status ?? "?")}`);
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try { await call("disconnect"); setNotice("Conexão GitHub removida. O repositório não foi apagado."); setStatus(null); setRepos([]); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  const connected = status?.connected;
  const link = status?.link;
  const repoLink = link ? `https://github.com/${link.owner}/${link.repo}` : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Github className="h-3.5 w-3.5 mr-1" /> GitHub</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Github className="h-4 w-4" /> GitHub do projeto</DialogTitle>
          <DialogDescription>Vincule este projeto a um repositório e sincronize quando quiser. Nada é enviado automaticamente.</DialogDescription>
        </DialogHeader>

        {notice && <p className={`rounded-md border px-3 py-2 text-xs ${notice.includes("bloqueado") || notice.includes("Erro") || notice.includes("Falha") ? "border-amber-500/40 bg-amber-500/5 text-amber-600" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"}`}>{notice}</p>}

        {!connected ? (
          <Button onClick={connect} disabled={busy} className="w-full"><Plug className="h-4 w-4 mr-2" /> Conectar GitHub</Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> {status?.login}</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy} title="Desconectar"><Unplug className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy}><RefreshCw className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            {!link ? (
              <>
                <div className="flex items-end gap-2">
                  <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="nome do repositório (ex.: site-barbearia)" className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                  <Button size="sm" onClick={createRepo} disabled={busy || !repoName.trim()}><Plus className="h-3.5 w-3.5 mr-1" /> Criar</Button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Repositório privado</label>
                <Button size="sm" variant="outline" onClick={listRepos} disabled={busy}><FolderPlus className="h-3.5 w-3.5 mr-1" /> Selecionar repositório existente</Button>
                {repos.length > 0 && (
                  <ul className="max-h-40 overflow-auto rounded-md border border-border divide-y divide-border text-sm">
                    {repos.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => void selectRepo(r.owner, r.name, r.defaultBranch)} className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-muted">
                          <span className="truncate">{r.fullName ?? `${r.owner}/${r.name}`}</span>
                          <span className="text-[10px] text-muted-foreground">{r.private ? "privado" : "público"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{link.owner}/{link.repo}</span>
                  {repoLink && <a href={repoLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary"><ExternalLink className="h-3 w-3" /> abrir</a>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">branch: {link.branch}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {link.synced_at ? `Último commit: ${String(link.synced_commit ?? "").slice(0, 7) || "—"} · ${new Date(link.synced_at).toLocaleString("pt-BR")}` : "Ainda não sincronizado"}
                </p>
                {link.status === "conflict" && <p className="mt-1 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Conflito detectado — sincronização bloqueada.</p>}
                <Button size="sm" onClick={sync} disabled={busy} className="mt-2 w-full"><Loader2 className={busy ? "h-3.5 w-3.5 animate-spin mr-1" : "h-3.5 w-3.5 mr-1"} /> Sincronizar agora</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
