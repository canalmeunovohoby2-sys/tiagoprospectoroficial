# Prospector Agent Runtime

Runtime Node isolado que hospeda o **Cline Agent SDK** (`@cline/agents`, `@cline/sdk`) como motor do agente de código dos Site Projects do TiagoProspector.

O Prospector continua sendo o produto (React + Supabase). Este pacote é o "cérebro agêntico" que trabalha DENTRO dos arquivos reais de cada site.

## Arquitetura

```text
React/Vite (SiteChat / SiteProjectPage)
   │  HTTP
   ▼
Prospector Agent Runtime (Node, este pacote)
   ├── ProspectorSiteAgent  → Cline Agent (Agent do @cline/agents)
   ├── Tools (list/read/write/edit/delete/get_site_context) — scoped ao workspace
   ├── Workspace (diretório real isolado por projectId)
   └── AI (provider deepseek via ai-proxy do Supabase OU chave local)
        ▼
   Arquivos reais do site → LiveProjectPreview (iframe sandbox)
```

## Como rodar

```bash
cd agent-runtime
npm install
cp .env.example .env   # preencha PROSPECTOR_BASE_URL/PROSPECTOR_API_KEY (ai-proxy) ou DEEPSEEK_API_KEY

# servidor HTTP (o app chama via VITE_AGENT_RUNTIME_URL):
node --env-file=.env --import tsx src/server.ts

# E2E / sessão / compreensão (requer o servidor rodando na 8787):
npx tsx scripts/e2e-hero-badge.ts
npx tsx scripts/test-session.ts
npx tsx scripts/test-understanding.ts
```

Endpoints:
- `GET /health` — status do runtime e nº de sessões ativas.
- `POST /generate` — **missão de geração inicial** (Cline cria o site do zero no workspace, com auto-revisão e correção; depois a sessão é reutilizada para edição no mesmo `projectId`). `{ projectId, context, briefing? }`.
- `POST /run` — roda/continua o agente de um projeto. `projectId` identifica a sessão: se já existe um Agent vivo, a nova mensagem usa `agent.continue()` (contexto preservado). `fresh:true` reinicia a sessão.
- `DELETE /session` `{projectId}` — encerra a sessão.

O app (`SiteProjectPage`) usa o agente como motor principal do chat quando há workspace; `invokeProspectorAgent()` fala com este runtime se `VITE_AGENT_RUNTIME_URL` estiver definida, senão faz fallback para a edge `agent-execute`.

## Segurança

- Cada projeto tem um diretório isolado (`sha256(projectId)`), criado em `tmp` ou em `PROSPECTOR_WORKSPACES`.
- Path sanitization: impede `..`, absoluto e `.env*`.
- O agente nunca lê secrets; a chave fica no Supabase (`ai-proxy`) ou em env local do runtime.
- Sem execução arbitrária de shell no runtime (tools são de arquivo scoped + contexto).

## Browser QA (FASE 5.20)

O runtime integra **Playwright/Chromium** como ferramentas do próprio Cline Agent:

- `browser_open` — abre o site do workspace num servidor local seguro (só o root do projeto; `.env`/traversal bloqueados).
- `browser_inspect` — DOM renderizado + métricas (título, headings, overflow horizontal, anchors quebrados, imagens com erro).
- `browser_console` — erros/warnings de JavaScript e requests que falharam.
- `browser_links` — anchors quebrados e imagens que não carregam.
- `browser_screenshot` — captura screenshot em `PROSPECTOR_SHOTS` ou tmp.
- `browser_set_viewport` / `browser_reload` — testa mobile/desktop e revalida após correções.

Instalação (uma vez): `cd agent-runtime && npx playwright install chromium`.
Requisito de runtime p/ produção: Node + Chromium no host do agent-runtime.

Teste de prova (detectar → corrigir → revalidar):
`node --env-file=.env --import tsx scripts/e2e-browser-qa.ts`


