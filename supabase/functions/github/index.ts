// GitHub por projeto (5.36) — OAuth + repos + sync, server-side.
// Tokens só na tabela github_connections (service role). Nenhuma resposta HTTP
// contém token; nenhum log registra segredo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildSafeProjectTree, findConflicts, GITIGNORE, type SyncFile } from "../_shared/github-sync.ts";

const GITHUB = "https://api.github.com";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
function env(k: string): string { return Deno.env.get(k) ?? ""; }

async function gh(headers: Record<string, string>, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB}${path}`, { ...init, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...headers, ...(init.headers ?? {}) } });
}
async function ghJson<T>(token: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; message?: string }> {
  const res = await gh({ Authorization: `Bearer ${token}` }, path, init);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: data as T | null, message: (data as { message?: string } | null)?.message };
}
function randomState(): string {
  const bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newClient() {
  const url = env("SUPABASE_URL"); const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase não configurado");
  return createClient(url, key);
}
async function userFrom(auth: string) {
  const token = auth.replace(/^Bearer\s+/i, "");
  const admin = newClient();
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u?.user) return null;
  return u.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = newClient();
    const auth = req.headers.get("Authorization") ?? "";
    const queryAction = new URL(req.url).searchParams.get("action") ?? "";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const action = queryAction || String(body.action ?? "");

    // ── OAuth START ──
    if (action === "oauth_start") {
      const uid = await userFrom(auth); if (!uid) return json({ error: "autenticação inválida" }, 401);
      const clientId = env("GITHUB_CLIENT_ID"); if (!clientId) return json({ error: "GitHub OAuth não configurado (GITHUB_CLIENT_ID ausente)" }, 500);
      const random = randomState();
      // Origem oficial do app viajando DENTRO do state (sem migration; não é segredo).
      const appRaw = String((body.appOrigin ?? "") || env("PUBLIC_SITE_URL") || "").trim().replace(/\/$/, "");
      const originKey = /^https?:\/\//i.test(appRaw) ? btoa(appRaw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";
      const state = originKey ? `${random}__${originKey}` : random;
      await admin.from("github_oauth_states").insert({ state, user_id: uid }).select().single().then((r) => { if (r.error) throw r.error; });
      const siteUrl = (env("PUBLIC_SITE_URL") || env("SUPABASE_URL") || "").replace(/\/$/, "");
      const redirectUri = `${siteUrl}/functions/v1/github?action=oauth_callback`;
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", clientId); url.searchParams.set("scope", "repo read:user user:email"); url.searchParams.set("state", state); url.searchParams.set("redirect_uri", redirectUri);
      return json({ authorizeUrl: url.toString() });
    }

    // ── OAUTH CALLBACK ──
    if (action === "oauth_callback") {
      // O GitHub redireciona via GET com parâmetros na URL:
      //   /functions/v1/github?action=oauth_callback&code=...&state=...
      const url = new URL(req.url);
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const oauthError = url.searchParams.get("error");
      if (oauthError) return json({ error: `Autorização negada no GitHub (${oauthError}).`, denied: true }, 400);
      if (!code || !state) return json({ error: "state/code ausentes na URL do callback" }, 400);
      const { data: st } = await admin.from("github_oauth_states").select("user_id").eq("state", state).single();
      if (!st) return json({ error: "state inválido ou reutilizado" }, 400);
      await admin.from("github_oauth_states").delete().eq("state", state);
      // Origem oficial do app, se viajou no state (nunca é segredo).
      const sep = state.lastIndexOf("__");
      let appOrigin = (env("PUBLIC_SITE_URL") || env("PROSPECTOR_APP_URL") || "").replace(/\/$/, "");
      if (!appOrigin && sep > 0) {
        try {
          const raw = atob(state.slice(sep + 2).replace(/-/g, "+").replace(/_/g, "/"));
          if (/^https?:\/\//i.test(raw)) appOrigin = raw;
        } catch { /* state sem origem → sem postMessage */ }
      }
      const clientId = env("GITHUB_CLIENT_ID"); const secret = env("GITHUB_CLIENT_SECRET");
      if (!clientId || !secret) return json({ error: "GitHub OAuth não configurado" }, 500);
      const siteUrl = (env("PUBLIC_SITE_URL") || env("SUPABASE_URL") || "").replace(/\/$/, "");
      const tok = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: secret, code, redirect_uri: `${siteUrl}/functions/v1/github?action=oauth_callback` }) }).then((r) => r.json());
      const accessToken = (tok as { access_token?: string }).access_token;
      if (!accessToken) return json({ error: "Falha ao trocar o code pelo token" }, 400);
      const ident = await ghJson<{ login: string; id: number }>(accessToken, "/user");
      if (!ident.ok || !ident.data) return json({ error: "Não foi possível obter identidade GitHub" }, 400);
      await admin.from("github_connections").upsert({ user_id: st.user_id, github_login: ident.data.login, access_token: accessToken, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      const html = `<html><body><script>
(function(){
  var origin = ${JSON.stringify(appOrigin || "")};
  try { if (origin && window.opener) window.opener.postMessage({ type: "github_oauth_success" }, origin); } catch (e) {}
  try { window.close(); } catch (e) {}
  setTimeout(function(){ document.body.innerHTML = "<p style='font-family:sans-serif'>Conta GitHub conectada. Pode fechar esta aba.</p>"; }, 400);
})();
</script><p style="font-family:sans-serif">Conta GitHub conectada. Pode fechar esta aba.</p></body></html>`;
      return new Response(html, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html" } });
    }

    // ── Resto das ações exige conexão ativa ──
    const uid = await userFrom(auth); if (!uid) return json({ error: "autenticação inválida" }, 401);
    const { data: conn } = await admin.from("github_connections").select("access_token,github_login").eq("user_id", uid).maybeSingle();
    if (!conn) return json({ status: "not_connected" });
    const token = conn.access_token as string;

    // ── STATUS / ACCOUNT ──
    if (action === "status") return json({ status: "connected", login: conn.github_login });

    // ── LINK STATUS (metadados seguros do vínculo do projeto) ──
    if (action === "link_status") {
      const projectId = String(body.projectId ?? "");
      if (!projectId) return json({ error: "projectId obrigatório" }, 400);
      const { data: link } = await admin.from("site_project_github").select("owner,repo,branch,synced_commit,synced_at,status").eq("site_project_id", projectId).eq("user_id", uid).maybeSingle();
      return json({ link: link ?? null });
    }

    // ── LIST REPOS ──
    if (action === "list_repos") {
      const r = await ghJson<Array<{ id: number; name: string; full_name: string; private: boolean; default_branch: string; owner: { login: string } }>>(token, "/user/repos?per_page=100&sort=updated");
      if (!r.ok) return json({ error: "Falha ao listar repositórios" }, 500);
      const repos = (r.data ?? []).map((x) => ({ id: x.id, name: x.name, owner: x.owner.login, private: x.private, defaultBranch: x.default_branch, fullName: x.full_name }));
      return json({ repos });
    }

    // ── CREATE REPO ──
    if (action === "create_repo") {
      const name = String(body.name ?? "").trim(); if (!name) return json({ error: "nome do repositório obrigatório" }, 400);
      const r = await ghJson<{ id: number; name: string; default_branch: string; owner: { login: string }; private: boolean }>(token, "/user/repos", { method: "POST", body: JSON.stringify({ name, description: String(body.description ?? "").slice(0, 200), private: body.private !== false, auto_init: true }) });
      if (!r.ok || !r.data) return json({ error: r.message ?? "Falha ao criar repositório" }, 500);
      return json({ repo: { id: r.data.id, owner: r.data.owner.login, name: r.data.name, private: r.data.private, defaultBranch: r.data.default_branch } });
    }

    // ── LINK (vincular projeto → repo) ──
    if (action === "link") {
      const projectId = String(body.projectId ?? ""); const owner = String(body.owner ?? ""); const repo = String(body.repo ?? ""); const branch = String(body.branch ?? "main");
      if (!projectId || !owner || !repo) return json({ error: "projectId/owner/repo obrigatórios" }, 400);
      const { data: proj } = await admin.from("site_projects").select("id,user_id").eq("id", projectId).maybeSingle();
      if (!proj || proj.user_id !== uid) return json({ error: "projeto não encontrado" }, 404);
      // valida posse do repo pelo owner conectado
      if (owner !== conn.github_login) return json({ error: "repositório não pertence à conta conectada" }, 403);
      const existing = await ghJson<{ id: number; name: string }>(token, `/repos/${owner}/${repo}`);
      if (!existing.ok) return json({ error: "não foi possível validar o repositório" }, 500);
      const { error: linkErr } = await admin.from("site_project_github").upsert({ site_project_id: projectId, user_id: uid, owner, repo, repo_id: Number(existing.data?.id ?? 0), branch, status: "linked", synced_files: {}, updated_at: new Date().toISOString() }, { onConflict: "site_project_id" });
      if (linkErr) return json({ error: linkErr.message }, 500);
      return json({ status: "linked", owner, repo, branch });
    }

    // ── SYNC (primeiro envio + incremental) ──
    if (action === "sync") {
      const projectId = String(body.projectId ?? "");
      const { data: link } = await admin.from("site_project_github").select("*").eq("site_project_id", projectId).maybeSingle();
      if (!link || link.user_id !== uid) return json({ error: "vínculo não encontrado" }, 404);
      const { data: proj } = await admin.from("site_projects").select("generated_code").eq("id", projectId).maybeSingle();
      if (!proj) return json({ error: "projeto não encontrado" }, 404);
      const generated = (proj.generated_code && typeof proj.generated_code === "object" ? proj.generated_code : {}) as Record<string, string>;
      const tree = buildSafeProjectTree(generated);
      if (!tree.ok) return json({ status: "error", conflict: true, blocked: tree.blocked, message: "Segredo detectado — commit bloqueado antes de qualquer envio." }, 400);

      // arquivos já sincronizados: pega shas remotos atuais para detectar conflito
      const currentRemote: Record<string, { sha?: string }> = {};
      for (const f of tree.files) {
        const r = await ghJson<{ sha?: string }>(token, `/repos/${link.owner}/${link.repo}/contents/${encodeURIComponent(f.path).replace(/%2F/g, "/")}?ref=${link.branch}`);
        if (r.ok && r.data?.sha) currentRemote[f.path] = { sha: r.data.sha };
      }
      const syncedMap = (link.synced_files ?? {}) as Record<string, { sha?: string }>;
      const conflicts = findConflicts(tree.files, syncedMap, currentRemote);
      if (conflicts.length > 0) {
        await admin.from("site_project_github").update({ status: "conflict", error: `conflito em: ${conflicts.join(", ")}`, updated_at: new Date().toISOString() }).eq("site_project_id", projectId);
        return json({ status: "conflict", conflicts, message: "Arquivos alterados fora do Prospector — sincronização bloqueada." }, 409);
      }

      const files: SyncFile[] = [...tree.files, { path: ".gitignore", content: GITIGNORE }];
      let commitSha: string | null = null;
      const newSync: Record<string, { sha?: string; updated_at?: string }> = { ...syncedMap };
      for (const f of files) {
        const prev = syncedMap[f.path];
        const b64 = btoa(f.content);
        const payload = { message: `Prospector: ${f.path}`, content: b64, branch: link.branch, sha: prev?.sha ?? undefined };
        const put = await ghJson<{ content?: { sha?: string }; commit?: { sha?: string } }>(token, `/repos/${link.owner}/${link.repo}/contents/${encodeURIComponent(f.path).replace(/%2F/g, "/")}`, { method: "PUT", body: JSON.stringify(payload) });
        if (!put.ok) return json({ status: "error", error: `Falha ao enviar ${f.path}: ${put.message ?? "erro"}` }, 502);
        if (put.data?.content?.sha) newSync[f.path] = { sha: put.data.content.sha, updated_at: new Date().toISOString() };
        commitSha = put.data?.commit?.sha ?? commitSha;
      }
      await admin.from("site_project_github").update({ status: "synced", synced_commit: commitSha, synced_files: newSync, synced_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq("site_project_id", projectId);
      return json({ status: "synced", commit: commitSha, files: files.length });
    }

    // ── DISCONNECT (remove conexão, NÃO apaga repositório/commits) ──
    if (action === "disconnect") {
      await admin.from("github_connections").delete().eq("user_id", uid);
      return json({ status: "not_connected" });
    }

    return json({ error: `ação desconhecida: ${action}` }, 400);
  } catch (e) {
    console.error("[github] error", e instanceof Error ? e.message : String(e)); // sem tokens
    return json({ error: "erro interno" }, 500);
  }
});
