// runtime-migration-probe — PROVA TÉCNICA ISOLADA (Fase Supabase).
//
// Objetivo: medir, no Edge Runtime REAL, o que é seguro migrar do agent-runtime,
// SEM tocar em produção. O frontend NÃO chama esta função.
//
// O que ela prova (e reporta em JSON, nunca expondo secrets):
//   1. execução/observabilidade: versão do Deno, tempo de handler, CPU aproximada;
//   2. autenticação: exige JWT do usuário (401 sem token);
//   3. Supabase: leitura com RLS aplicada (site_projects do próprio usuário);
//   4. escrita: SOMENTE opt-in (?write=1) e apenas se existir a tabela runtime_probe;
//   5. secrets: presença (booleans) das variáveis relevantes — nunca valores;
//   6. Edge → Railway: GET /health do runtime atual (chamada leve, sem risco);
//   7. streaming: NDJSON em chunks (?stream=1) para medir viabilidade de stream;
//   8. limites: alvo de CPU (~2s) medido com um laço controlado (?cpu=ms).
//
// NÃO faz: Chromium/Playwright, subprocess, workspace em disco, build, git, /run.
// Esses continuam no runtime externo (Edge não suporta memória/CPU/processos p/ isso).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Mede CPU real com um laço curto (default 250ms) — serve para comparar com o limite de 2s. */
function cpuBurn(ms: number): number {
  const t0 = performance.now();
  let x = 0;
  while (performance.now() - t0 < ms) x += Math.sqrt(x + 1);
  return Math.round((performance.now() - t0) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = performance.now();
  const url = new URL(req.url);
  const withWrite = url.searchParams.get("write") === "1";
  const withStream = url.searchParams.get("stream") === "1";
  const cpuMs = Math.min(Math.max(Number(url.searchParams.get("cpu") ?? 250) || 250, 50), 1500);

  // ---- 2) AUTENTICAÇÃO (JWT do usuário; nunca aceitar anônimo) ------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ ok: false, error: "autenticação necessária (Bearer JWT)" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const admin = supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } }) : null;
  if (!admin) return json({ ok: false, error: "SUPABASE_URL/anon ausentes no ambiente da function" }, 500);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ ok: false, error: "JWT inválido" }, 401);
  const uid = userData.user.id;

  // ---- 7) STREAMING (NDJSON em chunks) -----------------------------------------
  if (withStream) {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        for (let i = 1; i <= 5; i += 1) {
          controller.enqueue(enc.encode(JSON.stringify({ type: "tick", i, at_ms: Math.round(performance.now() - started) }) + "\n"));
          await new Promise((r) => setTimeout(r, 200));
        }
        controller.enqueue(enc.encode(JSON.stringify({ type: "complete", total_ms: Math.round(performance.now() - started) }) + "\n"));
        controller.close();
      },
    });
    return new Response(body, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
  }

  // ---- 3) SUPABASE READ (RLS do próprio usuário) --------------------------------
  let supabaseRead: Record<string, unknown> = { ok: false };
  try {
    const { data, error, count } = await admin.from("site_projects").select("id", { count: "exact" }).limit(1);
    supabaseRead = error ? { ok: false, error: error.message } : { ok: true, rows: count ?? (data?.length ?? 0) };
  } catch (e) {
    supabaseRead = { ok: false, error: String(e).slice(0, 200) };
  }

  // ---- 4) WRITE opt-in (só se a tabela de prova existir) ------------------------
  let writeProbe: Record<string, unknown> = { skipped: true, reason: "use ?write=1" };
  if (withWrite) {
    try {
      const { error } = await admin.from("runtime_probe").insert({ user_id: uid, note: "runtime-migration-probe" });
      writeProbe = error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) {
      writeProbe = { ok: false, error: String(e).slice(0, 200) };
    }
  }

  // ---- 5) SECRETS: apenas PRESENÇA ---------------------------------------------
  const envPresent = {
    SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    RUNTIME_GATEWAY_SECRET: !!Deno.env.get("RUNTIME_GATEWAY_SECRET"),
    AGENT_TICKET_SECRET: !!Deno.env.get("AGENT_TICKET_SECRET"),
    AGENT_RUNTIME_URL: !!Deno.env.get("AGENT_RUNTIME_URL"),
  };

  // ---- 6) EDGE → RUNTIME EXTERNO (somente /health) ------------------------------
  let runtimeHealth: Record<string, unknown> = { skipped: true, reason: "AGENT_RUNTIME_URL ausente" };
  const runtimeUrl = Deno.env.get("AGENT_RUNTIME_URL");
  if (runtimeUrl) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${runtimeUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(8000) });
      const body = await res.json().catch(() => null);
      runtimeHealth = { ok: res.ok, status: res.status, ms: Math.round(performance.now() - t0), version: body?.version ?? null, runtime: body?.runtime ?? null };
    } catch (e) {
      runtimeHealth = { ok: false, error: String(e).slice(0, 200), ms: Math.round(performance.now() - t0) };
    }
  }

  // ---- 1 e 8) EXECUÇÃO E LIMITES -----------------------------------------------
  const cpuSpent = cpuBurn(cpuMs);
  return json({
    ok: true,
    probe: "runtime-migration-probe",
    deno: Deno.version.deno,
    uid_prefix: uid.slice(0, 8),
    handler_ms: Math.round(performance.now() - started),
    cpu_probe_ms: cpuSpent,
    cpu_limit_doc_ms: 2000,
    memory_limit_doc_mb: 256,
    wall_clock_limit_doc_s: { free: 150, paid: 400 },
    env_present: envPresent,
    supabase_read: supabaseRead,
    write_probe: writeProbe,
    edge_to_runtime: runtimeHealth,
    unsupported_here: ["chromium/playwright", "subprocess", "workspace em disco", "build", "git", "/run pesado", "/video"],
  });
});
