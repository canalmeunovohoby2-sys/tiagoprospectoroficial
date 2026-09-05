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
- `POST /run` — roda/continua o agente de um projeto. `projectId` identifica a sessão: se já existe um Agent vivo, a nova mensagem usa `agent.continue()` (contexto preservado). `fresh:true` reinicia a sessão.
- `DELETE /session` `{projectId}` — encerra a sessão.

O app (`SiteProjectPage`) usa o agente como motor principal do chat quando há workspace; `invokeProspectorAgent()` fala com este runtime se `VITE_AGENT_RUNTIME_URL` estiver definida, senão faz fallback para a edge `agent-execute`.

## Segurança

- Cada projeto tem um diretório isolado (`sha256(projectId)`), criado em `tmp` ou em `PROSPECTOR_WORKSPACES`.
- Path sanitization: impede `..`, absoluto e `.env*`.
- O agente nunca lê secrets; a chave fica no Supabase (`ai-proxy`) ou em env local do runtime.
- Sem execução arbitrária de shell no runtime (tools são de arquivo scoped + contexto).

## Evidência funcional

`scripts/e2e-hero-badge.ts` roda o Cline Agent de verdade contra um site estático e verifica que ele **editou o arquivo real** (`index.html` ganhou `.hero-badge` + "Atendimento Premium"), com eventos `tool-started`/`tool-finished`.
