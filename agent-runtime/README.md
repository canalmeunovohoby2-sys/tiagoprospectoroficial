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

## Quality Gate de Geração (consistência)

O `/generate` roda um **Quality Gate técnico pós-geração** (`src/generation-gate.ts`)
para que qualidade seja consequência do processo, não da sorte do modelo:

1. O Cline cria o site (loop com ferramentas + browser QA).
2. `assertGenerationQuality` checa objetivamente: imagens reais em segmentos visuais
   (`<img>`/background), `@media` responsivo, CTA de conversão, `<nav>`, `<footer>`
   com contato, ausência de lorem/placeholder, nome da empresa visível, e rejeita
   horários inventados quando o negócio não os forneceu.
3. Se reprovar, o agente recebe a **lista concreta de problemas** e roda uma correção
   dirigida (`continueSession`), revalidando — máximo 2 ciclos (`gate_ok`/`gate_issues`
   na resposta).

Evidência (repetibilidade): a mesma academia gerada várias vezes retorna sempre com
`<img>` reais, hero, CTA, `@media` e `gate_ok:true` — a variação fica na composição
(qualidade consistente, aparência distinta). Sem o gate, execuções podiam omitir
imagens por completo.

## Visão (5.22)

O runtime detecta a capacidade multimodal real do provider/modelo ativo (`src/vision.ts`):

- **Suporta imagem** (allowlist: gpt-4o, gemini-*, claude-3.x/4, pixtral, qwen-vl, llama-3.2 vision; ou override `PROSPECTOR_VISION=1` + `PROSPECTOR_VISION_MODEL`): o `browser_screenshot` registra a imagem e o hook `beforeModel` injeta `ImageContent` (base64) no próximo request do Agent Loop → o modelo analisa o screenshot de verdade.
- **Não suporta** (ex.: DeepSeek): o screenshot NÃO é enviado e o sistema **não finge** análise visual — o agente usa DOM/métricas/console/Quality Gate e descreve honestamente o que verificou.

Captura real → base64 validada por E2E (`scripts/e2e-screenshot-dataurl.ts`). Qualidade estrutural segue garantida pelo Quality Gate.

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


