# MIGRAÇÃO CLOUD — FASE 1 (preparação, sem tocar no Railway)

> Artefato de preparação. Nada aqui foi aplicado; o Railway e o frontend de produção continuam intactos.
> Nenhum secret é escrito neste documento — apenas NOMES de variáveis.

## 1. Comparação de plataformas (pesquisa set/2026)

Requisitos do `agent-runtime`: Node persistente, Docker, HTTP público com **streaming NDJSON**, execuções de **até ~4 min**, filesystem (workspaces), **Playwright/Chromium**, **FFmpeg**, `git`, `npm`, secrets, HTTPS, health check, deploy por GitHub, custo ~zero.

| Plataforma | Node | Docker | Chromium | Python | Streaming | Free tier | Cold start | Custo estimado | Risco |
|---|---|---|---|---|---|---|---|---|---|
| **Google Cloud Run** | ✅ | ✅ | ✅ (imagem própria) | ✅ | ✅ (resposta longa) | 2 mi req + 360k GB-s/mês (região US) | Sim (scale-to-zero) | ~US$ 0 no uso pessoal; exige cartão | Médio (billing/quota) |
| **Render** | ✅ | ✅ | ⚠️ só com imagem própria + RAM | ✅ | ✅ | Web Service free (512 MB, **dorme** após 15 min) | Sim (~30-60 s) | US$ 0–7/mês | Médio (sleep + 512 MB justo p/ Chromium) |
| **Fly.io** | ✅ | ✅ | ✅ | ✅ | ✅ | Créditos/allowance limitados; cartão obrigatório | Sim (machines) | ~US$ 2–5/mês p/ 512 MB–1 GB | Médio-alto (limites de free tier mudam) |
| **Northflank** | ✅ | ✅ | ✅ | ✅ | ✅ | Sandbox free (2 serviços, 1 DB) | Sim | US$ 0 → US$ 2,70/mês | Baixo-médio (free limitado) |
| **Hugging Face Spaces (Docker)** | ✅ | ✅ | ✅ (Playwright funciona) | ✅ | ⚠️ (timeouts de proxy) | 2 vCPU/16 GB grátis, **público** | Sim | US$ 0 | Alto p/ runtime privado (Space é público por padrão) |
| **Koyeb** | ✅ | ✅ | ✅ | ✅ | ✅ | Free tier restrito (0,1 vCPU/512 MB) | Sim | Free → US$ 29/mês (salto alto) | Médio |
| **Railway (atual)** | ✅ | ✅ | ✅ | ✅ | ✅ | — | Não | US$ 5+/mês | **Manter como fallback** |
| **PC do usuário + túnel** | ✅ | ⚠️ (sem Docker aqui) | ✅ (já instalado) | ✅ | ✅ | Ilimitado no PC | Não | **US$ 0** (+ domínio opcional) | Baixo (requer o PC ligado) |

**Recomendação primária (custo zero):** **PC do usuário (runtime local) + túnel HTTPS** (Cloudflare Tunnel `cloudflared`, inclui modo gratuito sem conta com URL `*.trycloudflare.com`).
**Recomendação alternativa gerenciada:** **Google Cloud Run** (free tier cobre o uso pessoal; Docker já pronto; Chromium/FFmpeg via imagem; streaming ok) e **Northflank/Render** como plano B.

## 2. Arquitetura proposta

```text
Vercel (frontend — NÃO alterar nesta fase)
   │
   ├── Supabase (DB/Auth/Edge Functions: search-places, get-search-status, place-photo,
   │              runtime-config, agent-ticket, runtime-ai-config, conversation-save)
   ├── APIs externas (Geoapify, Google Places/Fotos, OSM, DeepSeek/Gemini, Tavily)
   └── Agent Runtime CLOUD (novo)  ──► fallback: Railway (inalterado)
          ├── agent-runtime (Node + Playwright/Chromium + FFmpeg + git/npm)
          └── (Fase 2) mapscraper-service + gmapsphotos-service (Docker/Python)
```

Motivo (do inventário real): o runtime precisa de processo persistente, Chromium, FFmpeg, filesystem e streaming — **não** cabe em Vercel Serverless. Scrapers ficam para a Fase 2 (Docker/Python, podem ir para o mesmo host ou outro).

## 3. Variáveis do novo runtime

**Obrigatórias:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_FUNCTIONS_URL` (ou `PROSPECTOR_BASE_URL` contendo `/functions/v1`), `PORT` (definir 8787 se a plataforma não injetar), `HOST=0.0.0.0`.
**Secrets (nunca no front):** `RUNTIME_GATEWAY_SECRET`, `AGENT_TICKET_SECRET` (somente se o modo ticket HMAC for usado; em Cloud Run com front remoto **é necessário**, pois o front assina o ticket pela edge `agent-ticket`), `DEEPSEEK_API_KEY`/demais chaves de provider **não** são necessárias no runtime (a IA é resolvida pela edge `runtime-ai-config` com a chave do usuário), `TAVILY_API_KEY(_01..08)` se pesquisa web for usada.
**Opcionais/ajuste:** `AGENT_RUN_TIMEOUT_MS` (padrão 240000), `AGENT_MAX_ITERATIONS`, `GENERATE_*`, `PROSPECTOR_WORKSPACES`, `PROSPECTOR_SHOTS`, `PROSPECTOR_ARTIFACTS_DIR` (apontar para volume/pasta persistente se possível).
**Específicas do Railway (remover da equação):** `RAILWAY_GIT_COMMIT_SHA` — **não é requisito** (há fallback `DEPLOY_VERSION`/`GIT_SHA`/`"dev"` no `/health`).
**Não copiar:** nenhum valor de secret para código, doc ou frontend.

## 4. Health check esperado

`GET /health` → `{ ok, version, provider, runtime, auth, mode, sessions }` (`agent-runtime/src/server.ts`). A versão deve vir de `DEPLOY_VERSION` (ex.: `2026.09-fase1`) para não depender de variável do Railway.

## 5. Passo a passo por plataforma

### A) PC + túnel (custo zero, recomendado)
1. `cd agent-runtime && npm ci` (instala Playwright/Chromium) → `npm run local` (sobe em `127.0.0.1:8787`, auth JWT, sem secrets de gateway).
2. Expor HTTPS: instalar `cloudflared` → `cloudflared tunnel --url http://127.0.0.1:8787` (modo gratuito; gera `https://<algo>.trycloudflare.com`).
3. Guardar a URL e cadastrá-la como `AGENT_RUNTIME_URL` (Supabase secret da edge `runtime-config`) **somente quando autorizado**.
4. Manter o PC ligado durante o uso (é o "servidor").

### B) Google Cloud Run
1. `gcloud builds submit --tag gcr.io/<projeto>/agent-runtime agent-runtime/` (usa o `Dockerfile` existente).
2. `gcloud run deploy agent-runtime --image … --port 8787 --timeout 300 --memory 2Gi --cpu 2 --min-instances 0 --allow-unauthenticated=false` (auth via ticket/JWT permanece na aplicação).
3. Secrets no Secret Manager; injetar como env. `--timeout 300` cobre a run de 4 min; sessões/locks são em memória → **1 instância** (`--max-instances 1`) para preservar continuidade.

### C) Render / Northflank / Fly
- Criar “Web Service / Docker service” apontando para `agent-runtime/Dockerfile`, porta 8787, health `/health`, 1 instância, secrets pelas envs da plataforma. Render free dorme (cold start); Northflank tem sandbox always-on; Fly exige cartão.

## 6. Segurança (inalterada)
Auth atualmente preservada (ticket HMAC ou JWT + ownership). HTTPS em todas as opções. CORS do runtime é `*` (comportamento atual) — **não piorar**: qualquer migração mantém a mesma autenticação. Nenhum secret novo em repositório.

## 7. Rollback
O frontend continua apontando para o Railway. Para voltar, basta **não trocar** `AGENT_RUNTIME_URL`/`VITE_AGENT_RUNTIME_URL`; se trocado para teste, reverter a variável na edge `runtime-config` (sem tocar no serviço Railway).

## 8. Fase 2 (scrapers)
`mapscraper-service` e `gmapsphotos-service` precisam de **imagem Docker com Chrome/xvfb**; opções: mesmo host do runtime (PC com Docker, ou Cloud Run/Northflank com 1–2 GB). A troca é só de variável: `MAP_SCRAPER_URL`/`GMAPS_SCRAPER_URL` para a nova URL (mantendo as do Railway como fallback até validar).

## 9. Pendência desta fase
A criação do serviço gerenciado **exige credencial da plataforma** (nenhuma existe nesta máquina: Railway/Render/Fly/Cloud Run/HF/Koyeb/Vercel ausentes). Sem credencial, esta fase entregou: comparação, arquitetura, matriz de variáveis, kit de deploy e **verificação real do runtime/Chromium/FFmpeg** localmente (evidências no relatório da fase).
