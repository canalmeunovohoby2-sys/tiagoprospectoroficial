# Agent Engine (Etapa 4) — preparação isolada

> **`agent-runtime/**` não foi alterado.** Este diretório contém apenas o kit de
> implantação do **mesmo** runtime fora do Railway. Railway segue oficial.

## O que é

`Agent Engine` = o mesmo motor atual (Node 22 + `@cline/sdk` + Chromium/Playwright +
filesystem + subprocessos + git + streaming NDJSON + build/capture/artifacts),
executado como container em outro host.

## Imagem e build (2 passos — não altera o Dockerfile do runtime)

O Dockerfile do runtime **não instala `git`** (o Railway funciona porque lá o build é Nixpacks). Por isso existe `deploy/agent-engine/Dockerfile`: uma camada de 4 linhas que só adiciona `git` à **mesma** imagem.

```bash
# 1) imagem base (usa o Dockerfile atual do runtime, sem tocar nele)
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-runtime-base:latest agent-runtime/

# 2) camada de deploy (git + DEPLOY_VERSION)
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-engine:latest \
  --substitutions=_BASE=REGION-docker.pkg.dev/PROJECT_ID/prospector/agent-runtime-base:latest deploy/agent-engine/
```

Alternativa local (PC): `docker build -t agent-engine-base agent-runtime/ && docker build --build-arg _BASE=agent-engine-base -t agent-engine deploy/agent-engine/`.

## Serviço

```bash
gcloud run services replace deploy/agent-engine/agent-engine.service.yaml --region REGION
gcloud run services describe prospector-agent-engine --region REGION --format='value(status.url)'
```

## Infraestrutura (confirmada na auditoria)

| Item | Configuração |
|---|---|
| Imagem | base do runtime (Node 22, Chromium/Playwright + deps, ffmpeg-static, `@napi-rs/canvas`, jspdf/jszip) + **git** |
| Porta | **8787** (`PORT`/`HOST` já respeitados pelo server) |
| CPU / RAM | **2 vCPU / 2 GiB** (Chromium + build + npm) |
| Timeout | **600 s** (run do agente tem deadline interno de 240 s) |
| Concorrência | 80 na instância **única** (`maxScale=1`, `minScale=0`, `cpu-throttling=false`, startup CPU boost) |
| Sessões/locks/revisions | **estado em memória** → 1 instância obrigatória nesta fase |
| Filesystem | `/tmp` para workspaces/capturas/artefatos (`PROSPECTOR_*`) |
| Subprocessos | `npm install`, `npm run build`, `git` — permitidos no container |

## Endpoints preservados (nomes e contratos atuais)

`/health` · `/run` (NDJSON) · `/build` · `/git` · `/validate` · `/capture` · `/artifacts/*` · `/agent-config` · `/visual-edit` · `/session` (legado) · `/generate` (legado)

## Variáveis necessárias (somente nomes)

**Obrigatórias:** `HOST`, `SUPABASE_URL`, `SUPABASE_FUNCTIONS_URL` (ou `PROSPECTOR_BASE_URL`), `SUPABASE_ANON_KEY`, `RUNTIME_GATEWAY_SECRET`, `AGENT_TICKET_SECRET` (**mesmo valor da edge `agent-ticket`** — compatibilidade confirmada pelo código).
**Recomendadas:** `AGENT_RUN_TIMEOUT_MS`, `PROSPECTOR_WORKSPACES`, `PROSPECTOR_SHOTS`, `PROSPECTOR_ARTIFACTS_DIR`, `DEPLOY_VERSION`.
**Opcionais:** `GENERATE_*`, `AGENT_MAX_ITERATIONS`, `TAVILY_API_KEY(_01..08)`, `PROSPECTOR_MOCKUP_MASTER`, `SITE_BASES*`, `PROSPECTOR_VISION_MODEL`, `PROSPECTOR_MODEL/PROVIDER` (o runtime normal usa a IA do usuário via edge).
**Não requisito:** `RAILWAY_GIT_COMMIT_SHA`.

## Validação após subir (sem cutover)

```bash
BASE=https://<url-agent-engine>
curl -sS $BASE/health                                  # 200 (version = agent-engine)
curl -sS -X OPTIONS $BASE/run -i | head -1             # 204
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $BASE/run   -d '{}'  # 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $BASE/build -d '{}'  # 401
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/nao-existe             # 404
curl -N -X POST $BASE/run -H 'content-type: application/json' \
  -d '{"projectId":"smoke","projectKind":"react","instruction":"oi"}'  # NDJSON progressivo (start/activity/complete)
```

Depois, com JWT real: conversa (`result_state=conversation`), edição real (`workspace_rev`, evidence), `/build`, `/capture`, `/git` (commit/status/log) e Chromium (1366/1280/390). **Não executar nada que altere projeto comercial real.**

## Rollback

`AGENT_RUNTIME_URL`, `runtime-config` e Railway **não são tocados** nesta etapa. Quando um dia houver cutover, reverter o secret devolve o tráfego ao Railway **sem deploy**.
