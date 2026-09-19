# FASE 1.1 — agent-runtime no Cloud Run (paralelo ao Railway, sem cutover)

> Nada aqui foi aplicado: **sem `gcloud`/credencial** nesta máquina, o serviço não pôde ser criado.
> Railway **intacto** e frontend **ainda apontando para o Railway**.

## Escopo confirmado (call-sites reais no código)

| Endpoint | Caller real | Classificação | Migrar? |
|---|---|---|---|
| `/run` | `siteProjectsApi.ts:509` | **USADO** (chat/edição) | ✅ sim |
| `/build` | `studio/buildApi.ts:31` ← `handleBuild` (publicar) | **USADO** | ✅ sim |
| `/git` | `studio/gitApi.ts:104` ← autosave/checkpoints/restore | **USADO** | ✅ sim |
| `/capture` | `siteProjectsApi.ts:366` ← `handlePdf` (Proposta PDF) | **USADO** | ✅ sim |
| `/agent-config` | `AIProviderStatus.tsx:73` | **USADO** | ✅ sim |
| `/artifacts/*` | `brandPdfView.ts:61`, `mockupView.ts:118/124` (PDF/ZIP/mockups) | **USADO** | ✅ sim |
| `/health` | monitoramento/diagnóstico | **USADO** | ✅ sim |
| `/validate` | **sem caller no front** (exposto; testável por script) | SEM CALLER | ❗ manter, não é requisito de migração |
| `/session` | **sem caller no front** | **LEGACY** | ❌ não migrar (não remover) |
| `/video` | `siteProjectsApi.ts:422` ← menu “Vídeo (MP4)” | **FORA DO PRODUTO** (decisão do dono) | ❌ **não migrar / não testar / não configurar FFmpeg** |
| `/generate` | legado (static) | LEGACY | ❌ não migrar agora |

## Requisitos Cloud Run × necessidades do runtime (validado na doc oficial)

| Requisito | Cloud Run | Fonte |
|---|---|---|
| Docker/containers | ✅ | docs overview |
| HTTPS público | ✅ | padrão do serviço |
| Streaming NDJSON | ✅ (resposta HTTP streaming com timeout por request) | request-timeout |
| Timeout p/ `/run` (4 min) | ✅ default 5 min, **máx 60 min** (`--timeout 600`) | request-timeout (atualizado 2026-09-04) |
| Filesystem temporário | ✅ **apenas `/tmp`** (memória) → `PROSPECTOR_WORKSPACES/…=/tmp/...` | container runtime |
| Playwright/Chromium | ✅ binários próprios são suportados (imagem já traz Chromium + `--no-sandbox`) | container contract |
| Memória/CPU | ✅ (`--cpu 2 --memory 2Gi`) | docs |
| Secrets | ✅ Secret Manager (`--set-secrets` / `secretRef`) | docs |
| Env vars | ✅ | docs |
| Deploy por GitHub/container | ✅ (Artifact Registry/Cloud Build) | docs |
| Concorrência | ✅ (padrão 80) | docs |
| min/max instances | ✅ (0..N) | docs |
| Sessões/locks em memória | ⚠️ **por instância** → usar **max-instances=1** (mesmo processo mantém locks/sessões coerentes) | scaling |

Nenhum requisito crítico é incompatível → seguir é seguro (quando houver credencial).

## Deploy (quando houver `gcloud` autenticado)

```bash
# 1) imagem (usa o Dockerfile existente do agent-runtime)
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-runtime:latest agent-runtime/

# 2) secrets (uma vez) — NUNCA no Git
gcloud secrets create prospector-runtime-secrets --replication-policy=automatic
printf '%s' "$SUPABASE_ANON_KEY"          | gcloud secrets versions add prospector-runtime-secrets --data-file=-
printf '%s' "$RUNTIME_GATEWAY_SECRET"     | gcloud secrets versions add prospector-runtime-secrets --data-file=-
printf '%s' "$AGENT_TICKET_SECRET"        | gcloud secrets versions add prospector-runtime-secrets --data-file=-

# 3) serviço (manifesto versionável, sem secrets)
gcloud run services replace deploy/cloudrun/agent-runtime.service.yaml --region REGION
gcloud run services describe prospector-agent-runtime --region REGION --format='value(status.url)'
```

Notas: 1 instância (estado em memória), timeout 600 s, `/tmp` para workspaces/artefatos, `DEPLOY_VERSION=cloudrun-fase1` (não depende de `RAILWAY_GIT_COMMIT_SHA`). O Dockerfile **permanece como está** (ffmpeg-static continua apenas como dependência existente; nenhuma configuração nova de FFmpeg).

## Testes obrigatórios após criar o serviço (nesta ordem)

```bash
BASE=https://<url-cloud>
curl -sS $BASE/health                                  # 200 + não menciona Railway
curl -sS -X OPTIONS $BASE/run -i | head -1             # 204
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $BASE/run    -H 'content-type: application/json' -d '{}'   # 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $BASE/build  -H 'content-type: application/json' -d '{}'   # 401
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/nao-existe                                                    # 404
```
Depois (com JWT + ticket reais): `/run` conversa (`result_state=conversation`, `tools:[]`), `/run` edição (`Troque o título principal para "Nossa Empresa".` → arquivo alterado, `workspace_rev` novo, evidence, `result_state`), `/build`, `/capture`, `/git` (commit/status/log) e **streaming** (NDJSON progressivo, conexão aberta até o fim).

## Rollback

Nada a desfazer: o frontend e a edge `runtime-config` **não foram tocados**. Se um teste falhar, o Cloud Run fica isolado e o Railway continua oficial.
