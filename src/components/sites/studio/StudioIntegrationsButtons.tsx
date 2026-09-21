import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Database, ExternalLink, Loader2, Plug, Triangle, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Conexões do projeto com Vercel e Supabase — MESMA LINHA do GitHub.
// Guarda as credenciais no navegador (por projeto) e VALIDA de verdade na API
// antes de marcar como conectado. Nada é enviado para servidores nossos.

const STORE_KEY = "prospector.integrations";

interface IntegrationsState {
  vercel?: { token: string; user?: string };
  supabase?: { url: string; anonKey: string };
}

function readStore(): IntegrationsState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as IntegrationsState) : {};
  } catch {
    return {};
  }
}

function writeStore(next: IntegrationsState): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* noop */ }
}

async function validateVercel(token: string): Promise<string> {
  const res = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(res.status === 403 ? "Token da Vercel inválido." : `Vercel respondeu HTTP ${res.status}.`);
  const data = (await res.json().catch(() => ({}))) as { user?: { username?: string; email?: string } };
  return data.user?.username || data.user?.email || "conta conectada";
}

async function validateSupabase(url: string, anonKey: string): Promise<string> {
  const base = url.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) throw new Error("Informe a URL do projeto (https://xxxx.supabase.co).");
  const res = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: anonKey } });
  if (!res.ok) throw new Error(res.status === 401 ? "Chave (anon) inválida para este projeto." : `Supabase respondeu HTTP ${res.status}.`);
  return new URL(base).host;
}

export function StudioIntegrationsButtons() {
  const [state, setState] = useState<IntegrationsState>(() => readStore());
  const [vercelOpen, setVercelOpen] = useState(false);
  const [supaOpen, setSupaOpen] = useState(false);
  const [token, setToken] = useState("");
  const [supaUrl, setSupaUrl] = useState("");
  const [supaKey, setSupaKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { writeStore(state); }, [state]);

  const save = useCallback((patch: IntegrationsState) => setState((s) => ({ ...s, ...patch })), []);

  async function connectVercel() {
    setBusy(true); setNotice(null);
    try {
      const user = await validateVercel(token.trim());
      save({ vercel: { token: token.trim(), user } });
      setNotice(`Vercel conectada (${user}).`);
      setToken("");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Falha ao conectar na Vercel."); } finally { setBusy(false); }
  }

  async function connectSupabase() {
    setBusy(true); setNotice(null);
    try {
      const host = await validateSupabase(supaUrl.trim(), supaKey.trim());
      save({ supabase: { url: supaUrl.trim().replace(/\/$/, ""), anonKey: supaKey.trim() } });
      setNotice(`Supabase conectado (${host}).`);
      setSupaUrl(""); setSupaKey("");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Falha ao conectar no Supabase."); } finally { setBusy(false); }
  }

  const vercelOn = !!state.vercel;
  const supaOn = !!state.supabase;

  return (
    <>
      <Dialog open={vercelOpen} onOpenChange={setVercelOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" title="Conectar a Vercel">
            <Triangle className={`h-3.5 w-3.5 mr-1 ${vercelOn ? "text-emerald-600" : ""}`} /> Vercel
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Triangle className="h-4 w-4" /> Vercel do projeto</DialogTitle>
            <DialogDescription>Crie um token em vercel.com/account/tokens e cole aqui. Ele fica só no seu navegador e é validado na hora.</DialogDescription>
          </DialogHeader>
          {notice && <p className="rounded-md border border-border px-3 py-2 text-xs">{notice}</p>}
          {vercelOn ? (
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> {state.vercel?.user}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { save({ vercel: undefined }); setNotice("Conexão Vercel removida."); }}><Unplug className="h-3.5 w-3.5 mr-1" /> Desconectar</Button>
                <Button size="sm" variant="outline" asChild><a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir Vercel</a></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token da Vercel" className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs" />
              <Button onClick={() => void connectVercel()} disabled={busy || !token.trim()} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />} Conectar Vercel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={supaOpen} onOpenChange={setSupaOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" title="Conectar um Supabase (URL + chave anon)">
            <Database className={`h-3.5 w-3.5 mr-1 ${supaOn ? "text-emerald-600" : ""}`} /> Supabase
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Supabase do cliente</DialogTitle>
            <DialogDescription>Informe a URL do projeto e a chave anon (Settings → API). Validamos na hora e guardamos só no seu navegador.</DialogDescription>
          </DialogHeader>
          {notice && <p className="rounded-md border border-border px-3 py-2 text-xs">{notice}</p>}
          {supaOn ? (
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> {new URL(state.supabase!.url).host}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { save({ supabase: undefined }); setNotice("Conexão Supabase removida."); }}><Unplug className="h-3.5 w-3.5 mr-1" /> Desconectar</Button>
                <Button size="sm" variant="outline" asChild><a href={state.supabase?.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir painel</a></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={supaUrl} onChange={(e) => setSupaUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs" />
              <input value={supaKey} onChange={(e) => setSupaKey(e.target.value)} placeholder="Chave anon (public)" className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs" />
              <Button onClick={() => void connectSupabase()} disabled={busy || !supaUrl.trim() || !supaKey.trim()} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />} Conectar Supabase
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
