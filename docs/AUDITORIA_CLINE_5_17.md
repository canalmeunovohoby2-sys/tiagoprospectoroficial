# Auditoria — Cline Agent dentro do TiagoProspector (FASE 5.17)

> Diagnóstico, sem correção de arquitetura. Evidências coletadas em execução real
> (Cline SDK `@cline/sdk@0.0.82`, provider deepseek, via `ai-proxy` do Supabase).

---

## A. Fluxo atual (mapeado)

```text
SiteChat (src/components/sites/editor/SiteChat.tsx)
  → SiteProjectPage.runCodeEdit (src/pages/SiteProjectPage.tsx:505)
  → invokeProspectorAgent (src/lib/siteProjectsApi.ts)
  → [opção] HTTP http://agent-runtime:8787/run  (agent-runtime/src/server.ts)
        → ProspectorSiteAgent.runTask (agent-runtime/src/prospector-site-agent.ts:86)
        → Agent (do @cline/agents) .run(instruction)   ← LOOP DO CLINE
            → provider deepseek via baseUrl = ai-proxy
              (supabase/functions/ai-proxy → api.deepseek.com)
            → tool calls: list/read/write/edit/delete/get_site_context/finish_task
            → tool results voltam ao loop (state.messages)
        → readWorkspace() devolve arquivos alterados
  → SiteProjectPage: updateProjectSpec + setDraftFiles → LiveProjectPreview
  → fallback (sem VITE_AGENT_RUNTIME_URL): edge function agent-execute (Deno)
```

## B. Arquivos auditados

| Arquivo | Papel no fluxo |
|---|---|
| `src/components/sites/editor/SiteChat.tsx` | Interface de chat (usa `edit-site`/spec, não o agente) |
| `src/pages/SiteProjectPage.tsx` | `runCodeEdit` + painel "Agente de código (Cline)" + preview |
| `src/lib/siteProjectsApi.ts` | `invokeProspectorAgent` (runtime→fallback edge) |
| `agent-runtime/src/prospector-site-agent.ts` | Wrapper `ProspectorSiteAgent` |
| `agent-runtime/src/tools.ts` | 6 tools scoped (list/read/write/edit/delete/get_site_context) |
| `agent-runtime/src/workspace.ts` | Workspace em disco por projectId |
| `agent-runtime/src/server.ts` | HTTP `/run` |
| `agent-runtime/node_modules/@cline/agents/dist/index.js` | Source do Agent Loop |
| `supabase/functions/ai-proxy/index.ts` | Proxy OpenAI-compat → DeepSeek |
| `agent-runtime/scripts/audit-harness.ts` / `audit-run.ts` | Testes controlados desta auditoria |

## C. Agent Loop — está REALMENTE rodando?

**SIM — com evidência de código.**

A source do `@cline/agents` (`index.js`) mostra:
- `generateAssistantMessage` monta o request com `{ systemPrompt, messages: te(this.state.messages), tools: [...this.tools.values()] }` — **o histórico (inclusive tool-results) é reenviado ao modelo a cada turno** (4 ocorrências de `messages:te(this.state.messages)`).
- Após `executeToolCalls`, os resultados são mensagens `role:"tool"` empilhadas em `state.messages`; o `while` continua até `findCompletingToolMessage` (tool com `completesRun`) ou estourar `maxIterations`.
- Eventos emitidos: `run-started`, `tool-started`, `tool-finished`, `assistant-text-delta`, `turn-finished`, `run-finished` etc.

O wrapper `ProspectorSiteAgent.runTask` chama `agent.run(instruction)` uma vez e o **próprio runtime executa o loop interno** — não é `prompt → tool → resposta` single-shot. `maxIterations = 40` por padrão.

## D. Tools — registro e retorno

| Tool | Registrada | Modelo pode chamar | Resultado volta ao modelo | Funcionando (evidência) |
|---|---|---|---|---|
| `list_files` | sim | sim | sim | T1/T3 chamaram |
| `read_file` | sim | sim | sim | T2 leu index+css ANTES do edit |
| `write_file` | sim | sim | sim | (não usado nos testes — presente) |
| `edit_file` | sim | sim | sim | T2/T3 editaram com find exato do conteúdo lido |
| `delete_file` | sim | sim | sim | (presente) |
| `get_site_context` | sim | sim | sim | T3/T4 chamaram |
| `finish_task` | sim | sim (completesRun) | sim | T2/T3 finalizaram via ela |

**Evidência de que tool-results retornam:** no T2 o `edit_file` usou como `find` exatamente o trecho que o modelo só podia conhecer lendo o arquivo (`<h1 class="hero-title">Odontologia com tecnologia e cuidado</h1>`), e depois releu o arquivo para confirmar. Isso só é possível se o conteúdo do `read_file` chegou ao modelo.

## E. Contexto enviado ao modelo

O que **chega**:
- `systemPrompt` (regras de coding agent: ler antes, editar coordenado, preservar fatos).
- Ferramentas declaradas com nome+descrição+schema.
- A instrução do usuário.
- `get_site_context` devolve os dados do negócio (quando o modelo chama).
- Conteúdo dos arquivos **somente via tool calls** (o modelo precisa listar/ler). Nenhum conteúdo de arquivo é injetado no prompt automaticamente.

O que **não** chega automaticamente: nenhum arquivo. O modelo decide ler — e nas evidências ele lê.

## F. AI Proxy

**Preserva tudo.** `ai-proxy` faz `await req.text()` e reenvia o body **sem transformação** para `api.deepseek.com`, com streaming SSE reemitido byte a byte (mesmo `content-type`). Não remove tool calls, tool results, system prompt, nem simplifica para "texto". Evidência: as tool calls reais chegaram e os resultados voltaram.

## G. Frontend — está escondendo o comportamento?

**PARCIALMENTE — gargalo de visibilidade (não de execução).**
- O agente roda e altera arquivos; o `LiveProjectPreview` mostra o código novo (code-first ok).
- MAS a UI não mostra os eventos de tool: `runCodeEdit` exibe apenas `toast(res.reply)` + contagem de `touched`. A barra de progresso é genérica e por **timer** (não reflete tool calls reais). O usuário não vê "lendo index.html", "editando site.css" — só vê uma barra e o resultado.
- O painel "Agente de código (Cline)" é manual (abrir) e separado do chat principal. O `SiteChat` (área de conversa diária) ainda usa o `edit-site` por spec — **o agente de código não é a via padrão do chat**; é um recurso à parte.

## H. Testes controlados (execução real, via DeepSeek/ai-proxy)

Projeto de teste: `Clínica Sorriso Prime` (index.html + src/site.css + src/main.js + src/site.json).

**T1 — leitura, sem alterar**
Comando: "analise e diga como o hero está implementado… não altere nada".
Tools: `list_files → read_file(index.html) → read_file(site.css)`. `touched=[]`. Resposta cita classe `.hero-title`, estrutura real (`.hero-copy`, `.hero-media`). → **agente leu código de verdade.**

**T2 — edição com leitura obrigatória**
Tools: `read_file(index.html) → read_file(site.css) → edit_file(find=<h1 exato>) → read_file(index.html) → finish_task`. `touched=[index.html]`. → **leu, editou com find exato, releu para confirmar (auto-verificação).**

**T3 — multi-arquivo coordenado**
Tools: `list → get_site_context → read(html) → read(css) → read(main.js) → read(site.json) → edit(css) → edit(html) → read(html) → read(css) → finish`. `touched=[index.html, src/site.css]`. Resposta: badge adicionado, gradiente no CSS, "references no orphan classes… brand name and WhatsApp intact". → **compreende relações entre arquivos e verifica consistência.**

**T4 — memória de contexto**
T4a: identificou `.hero-title` (leu, não alterou). T4b: aplicou margem apenas em `.hero-title` no `site.css`. `touched=[src/site.css]`. → **contexto preservado (cada run recebe a instrução; memória entre runs vem do texto/workspace, não de sessão contínua do Agent).**

## I. Problema encontrado — classificação

Combinação de **G (frontend)** com grau **B-baixo (tools)** e um **achado de integração**:

- **G — Frontend esconde o comportamento**: o agente funciona como coding agent, mas a UI não mostra o trabalho (eventos/tool calls) e o chat principal não usa o agente.
- **B (leve) —** ferramentas são usadas corretamente; não há evidência de tool quebrada.
- **H (leve) —** o agente está integrado como recurso paralelo ("painel de código"), não como via padrão do chat; e cada `run` não preserva sessão contínua do Agent (conversa multi-turno real dentro do mesmo loop não persiste entre mensagens do usuário).

NÃO é problema de loop (C), nem de contexto de tools (A), nem de proxy (E). Modelo (F): hipótese secundária — `deepseek-chat` executou bem; no T3 respondeu em inglês (falha de aderência ao idioma do system prompt, menor).

## J. Causa raiz

O "parece uma IA que só mexe no visual" vem da **camada de apresentação/uso, não do motor**: (1) o chat diário segue no fluxo spec (`edit-site`) — o agente de código só roda quando o usuário abre o painel manual e usa linguagem de "mexer no código"; (2) durante a execução não há feedback de tool calls (barra de progresso é cronometrada), então o usuário não percebe que o agente está lendo/planejando/editando/verificando; (3) cada mensagem cria um `Agent` novo — sem continuidade de sessão (o Cline suporta `continue()`/`restore()`; nossa integração não usa).

## K. Severidade

- **MÉDIO** — motor correto e funcional; perde-se percepção e fluxo (parece "IA visual" por falta de evidência na UI, não por falta de agente).
- **BAIXO** — resposta em inglês ocasional (aderência de idioma) e ausência de sessão contínua multi-turno.

## L. Correção recomendada (para a próxima fase — NÃO implementada agora)

1. **Fazer o agente de código ser a via padrão do chat** (SiteChat → `invokeProspectorAgent`) com fallback automático ao spec quando não houver runtime/arquivos.
2. **Streaming de eventos reais para a UI**: expor tool calls (arquivo lido/editado) em tempo real no lugar da barra cronometrada — `SSE/WebSocket` do runtime ou polling de estados.
3. **Sessão contínua do Agent** por projeto: reutilizar `continue()`/`restore()` entre mensagens do usuário (persistir `messages`/snapshot) para memória de conversa verdadeira do agente, não só texto.
4. Ajuste fino de prompt: forçar sempre pt-BR; opcionalmente informar no prompt a lista atual de arquivos (sem conteúdo) para reduzir chamadas de `list_files`.

---

## Respostas do critério de conclusão

1. O Cline está realmente executando um Agent Loop? **SIM** (evidência de código + execução real multi-turno de tools).
2. O modelo realmente consegue ler o código? **SIM** (T1–T4 leram arquivos reais).
3. O modelo recebe os resultados das tools? **SIM** (edit com find exato só possível com conteúdo do read no contexto).
4. O agente trabalha em múltiplos arquivos? **SIM** (T3: html+css).
5. O agente continua após uma tool call? **SIM** (sequências longas T3: 11 tool calls).
6. O agente verifica suas próprias alterações? **SIM** (T2/T3 releem após editar).
7. O workspace real está disponível? **SIM** (disco isolado por projectId).
8. O AI Proxy preserva contexto? **SIM** (repasse íntegro, streaming preservado).
9. O frontend esconde comportamento? **PARCIALMENTE — SIM para eventos de tool; NÃO esconde o resultado final (preview reflete o código).**
10. Gargalo exato: **visibilidade/fluxo de UI + chat fora do agente + sessão não contínua** — o motor de coding agent existe e funciona; o produto ainda não o apresenta como tal.
