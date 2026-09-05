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

# opção A — usando o ai-proxy do Supabase (secret fica no servidor):
$env:PROSPECTOR_BASE_URL="https://<ref>.supabase.co/functions/v1/ai-proxy"
$env:PROSPECTOR_API_KEY="<sb_publishable key>"
npx tsx scripts/e2e-hero-badge.ts

# opção B — chave local direta:
$env:DEEPSEEK_API_KEY="sk-..."
npx tsx scripts/e2e-hero-badge.ts

# servidor HTTP (para o app chamar via VITE_AGENT_RUNTIME_URL):
npx tsx src/server.ts
```

O app (`SiteProjectPage`) usa `invokeProspectorAgent()`: se `VITE_AGENT_RUNTIME_URL` estiver definida, fala com este runtime; senão, faz fallback para a edge function `agent-execute` (mesmo contrato, sem runtime Node).

## Segurança

- Cada projeto tem um diretório isolado (`sha256(projectId)`), criado em `tmp` ou em `PROSPECTOR_WORKSPACES`.
- Path sanitization: impede `..`, absoluto e `.env*`.
- O agente nunca lê secrets; a chave fica no Supabase (`ai-proxy`) ou em env local do runtime.
- Sem execução arbitrária de shell no runtime (tools são de arquivo scoped + contexto).

## Evidência funcional

`scripts/e2e-hero-badge.ts` roda o Cline Agent de verdade contra um site estático e verifica que ele **editou o arquivo real** (`index.html` ganhou `.hero-badge` + "Atendimento Premium"), com eventos `tool-started`/`tool-finished`.
