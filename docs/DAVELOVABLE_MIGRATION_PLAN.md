# Plano de Migração — Site Studio TiagoProspector ← DaveLovable

> **Status:** FASES 1–6 concluídas atrás de feature flag — restam as fases 7 (multimodal) e 8 (limpeza/deploy).
> **Referência principal:** `https://github.com/davidmonterocrespo24/DaveLovable` @ `7f97cda` (clone local em `%TEMP%\kilo\DaveLovable`).
> **Licença de referência:** MIT — reuso direto permitido desde que avisos/licença preservados (`THIRD_PARTY_NOTICES.md`).
> **Regra:** o comportamento/UX deve ser equivalente ao DaveLovable; a infraestrutura pode diferir quando tecnicamente necessário (diferenças documentadas — ADRs §3).

---

## 1. Objetivo e princípios

Substituir a experiência de criação/edição de sites do TiagoProspector pela experiência do DaveLovable, preservando **apenas**:

1. **Identidade TiagoProspector** (logo, nome, cores, linguagem visual).
2. **IA já configurada no Prospector** (provider/modelo validado em `ai_provider_config` → `runtime-ai-config`; **não** usar Gemini do DaveLovable).
3. **Recursos comerciais existentes** (WhatsApp, Gerar vídeo, Gerar proposta, Publicar, GitHub, Baixar/Exportar), apenas reorganizados.

Tudo o mais (chat, editor, preview, seleção, orquestração, ferramentas, memória, histórico) pode ser substituído.

**Não-objetivos:** "DaveLovable-lite"; funcionalidades fake; manter a arquitetura atual por inércia.

---

## 2. Engenharia reversa (FASE 0)

### 2.1 DaveLovable — arquitetura real

**Stack frontend:** React 18 + Vite 5 (SWC), `react-resizable-panels ^2.1.9`, `@monaco-editor/react ^4.7` + `monaco-editor ^0.52`, `@webcontainer/api ^1.6.1`, TanStack Query v5, Radix/shadcn, react-markdown/remark-gfm/rehype-highlight. `vite.config.ts` define COOP/COEP (`Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`) por causa de WebContainers.

**Layout do editor (`front/src/pages/Editor.tsx`):** coluna h-screen:

```
h-screen flex-col
├─ [horizontal] chat-panel (35/20/35)  |  main-content (75)
│    └─ [horizontal] explorer (18/15/30) | (EditorTabs toolbar + [horizontal] code-editor | preview)
└─ footer status bar (h-6, âncoras WebContainer/Ln,Col)
```
Estado concentrado em `Editor.tsx` (não há Redux/Zustand); server state via React Query; ChatPanel/PreviewPanel comunicam-se com o pai por refs (`sendMessage`, `handleRefresh`, `updateStyle`, `captureAndSendScreenshot`, `applyFileUpdates`). `EditorTabs` é a toolbar superior (tabs de arquivo + toggle Code/Split/Preview + git + run + download). Painéis persistem tamanho via `autoSaveId` (localStorage).

**Monaco:** editor controlado único (sem models por arquivo); abas cosméticas; `setValue` imperativo ao trocar arquivo; save manual `PUT /projects/:id/files/:fileId`; Ctrl/Cmd+S; inteligência TS via `typescriptDefaults` + `global.d.ts` embutido + `diagnosticCodesToIgnore`.

**File explorer:** árvore real de `GET /projects/:id/files`; create (dialog) + delete + search; sem rename; re-sync do arquivo aberto quando os arquivos mudam.

**Preview / WebContainers (`services/webcontainer.ts`):** boot singleton; `GET /projects/:id/bundle` → `{files:{path:content}}`; injeta `screenshot-helper.js`/`visual-editor-helper.js`; `mount` + `npm install` + `npm run dev`; resolve em `server-ready` (timeout 15s); iframe sandbox `allow-scripts allow-same-origin ...`; `reloadProjectFiles` (diff+write) e `updateProjectFiles` (push/HMR); console via postMessage.

**Visual editor:** script injetado no iframe adiciona `.visual-editor-mode/-hover/-selected`; no clique (capture) desabilita classes, lê `id/tagName/className/innerText/attributes` e faz **elemento→fonte via React Fiber** (`__reactFiber$` → `_debugSource{fileName,lineNumber}`), gera seletor CSS e posta `visual-editor:selected`. Pai abre `VisualEditorPanel` com controles (cores, tipografia, spacing via drag, borda, raio/sombra/opacidade, `className` avançado). Alterações ao vivo via `visual-editor:update-style`; persistência via `POST /projects/:id/visual-edit` (injeção regex em JSX + git commit) e push de arquivos no container (HMR). Sem drag/resize de elementos; sem pré-carregar estilos computados.

**Chat streaming:** SSE sobre `fetch` POST `POST /api/v1/chat/:projectId/stream`, eventos `data: {type,data}\n\n` com tipos `start | agent_interaction | files_ready | git_commit | reload_preview | complete | error`; `agent_interaction = {agent_name, message_type: thought|tool_call|tool_response, content, tool_name, tool_arguments, timestamp}`; heartbeats `: keep-alive`. `handleSend` insere msg otimista, agrupa tool_call/tool_response por índice, renderiza `ToolExecutionBlock`, invalida React Query em `files_ready`, agenda reload em `reload_preview`, e difere `isStreaming=false` em 3s.

**Backend agentes (`backend/app/agents/orchestrator.py`):** AutoGen 0.7.5 `SelectorGroupChat` com **2 agentes**: **Coder** (23 tools, `AGENT_SYSTEM_PROMPT`) e **Planner** (0 tools, `PLANNING_AGENT_SYSTEM_MESSAGE`); client único (`GeminiThoughtSignatureClient`, `gemini-3-flash-preview`); contexto `BufferedChatCompletionContext(100)`; término `TextMentionTermination("TERMINATE") | MaxMessageTermination(50)`; `max_tool_iterations=3`; estado persistido em `.agent_state.json` (últimas 150 msgs), instância por projeto com eviction 20min. **Router (`selector_func`)**: último=Planner→Coder; Coder text→ `TERMINATE`(fim) / `DELEGATE_TO_PLANNER`→Planner / `SUBTASK_DONE`→Planner / senão Coder; user→ `[VISUAL EDIT]`/`[BUG FIX]`→Coder, senão Planner.

**Ferramentas (DaveLovable):** filesystem (`read_file`, `write_file`, `edit_file` c/ 3 estratégias + LLM-fix, `delete_file`), diretório/busca (`list_dir`, `glob_search`, `grep_search`, `file_search`), git (`git_status/add/commit/push/pull/log/branch/diff` — registradas mas não expostas ao agente), terminal (`run_terminal_cmd`, bloqueando npm/vite/tsc/next), dados (JSON/CSV), web/wiki, análise Python. Scaffold Vite+React+TS+Tailwind. `GET /bundle` → `{files:{path:content}}`. Git real por projeto (`init`, commit por turno, history, restore=hard reset, checkout=detached, checkout-branch). Linter pós-escrita (`write_file`/`edit_file`). Auto-commit por turno com mensagem gerada por LLM (`commit_message_service`). Multimodal: imagens (≤10MB, ≤2048²) chegam ao modelo; PDF (≤20MB) validado mas **não** enviado ao modelo (gap).

### 2.2 TiagoProspector — estado atual (alvo da substituição)

- **UI (`src/pages/SiteProjectPage.tsx`, 1223 linhas):** modo view (spec) e modo edit = grid `[420px SiteChat | LiveProjectPreview]`. Sem painéis, abas, editor de código, explorer, diff ou seleção visual. Devices: desktop/mobile. Preview = iframe `srcDoc` **sem `allow-same-origin`** (sem bridge postMessage).
- **Agente (`agent-runtime/`):** Cline Agent SDK (`ProspectorSiteAgent`), modos `generate`/`edit`, tools de arquivo (`list_files/read_file/write_file/edit_file/delete_file/rename_file/move_file/get_site_context/run_command`) + browser (`browser_open/inspect/console/links/screenshot/visual_review/set_viewport/measure/reload/visual_analyze/eval`) + deliverables (`branding/mockup/brand_pdf/brand_package/site_video/image_plan`) + `finish_task` + `web_search`. Guards: `completion-guard`, `regression-guard`, `generation-gate`, `work-evidence`, `interaction-audit`. Sem Planner dedicado, sem git tools, sem glob/grep, sem roteamento formal.
- **Streaming:** `/run` e `/generate` em **NDJSON** com `activity` (não há `agent_interaction`).
- **Persistência:** Supabase `site_projects.generated_code` (mapa arquivo→conteúdo), `site_project_versions` (snapshots spec+files), `site_chat_messages`, `agent_conversation_memory`, `project-context` (row reservada), `ai_provider_config`. Publicação: `published_code`/`get_public_site`. GitHub via edge `github`.
- **Runtime HTTP:** `/health`, `/session`, `/capture`, `/generate`, `/agent-config`, `/video`, `/artifacts/branding/*`, `/run`. Auth por ticket HMAC (`agent-ticket`) ou JWT local (ollama). Workspaces efêmeros em `%TEMP%/prospector-workspaces/<sha16>`.
- **Providers suportados:** deepseek, openai, nvidia, openrouter, gemini, ollama (validado em `runtime-ai-config`).
- **Comerciais (handlers existentes):** Gerar/Regenerar, Histórico, Publicar/Despublicar, Proposta PDF (`/capture`), ZIP (`exportWorkspaceZip`), Vídeo MP4 (`/video`), GitHub, WhatsApp.
- **Código morto/legado a remover depois:** `src/components/sites/editor/SiteEditor.tsx` (não importado), `invokeAgentExecute` + edge `agent-execute` (LEGADO), fallback `editSiteWithAI`/edge `edit-site`, `generateSiteSpec`/edge `generate-site` (fora do fluxo); duplicação `supabase/functions/_shared/*`.

---

## 3. Decisões de arquitetura (ADRs)

**ADR-1 — Preview engine: sem dependência obrigatória de WebContainers.**
Sites do Prospector são estáticos (HTML/CSS/JS) e a infra atual (runtime + static server + `prepareProjectPreview`) já cobre. WebContainers exigiria COOP/COEP em todo o front (Vercel) e `npm install` no browser, arriscando Supabase/imagens cross-origin. Adotamos **Preview Engine** em 2 camadas, com comportamento equivalente (live update + devices + click-to-edit):
- **Camada 1 (default, client-side):** `prepareProjectPreview` + iframe `srcDoc` com `allow-same-origin` + bridge `postMessage` + helper visual injetado; re-render ao salvar/editar (HMR-simulado).
- **Camada 2 (avançada, opcional atrás de flag):** Vite dev server efêmero por workspace no Agent Runtime, exposto por proxy autenticado (para projetos exportáveis Vite) — reproduz HMR real.

**ADR-2 — Elemento→código para HTML estático (sem React Fiber).**
Sites gerados são HTML, não React, logo não há `_debugSource`. Solução determinística: o **Source Map do Studio** (`src/lib/studio/sourceMap.ts`) anota elementos no HTML com `data-pfsrc="<arquivo>:<linha>"` (transform aplicado só na cópia de preview; removido em publish/export). Fallback: matcher por seletor/classe/texto (parser + índice de linhas). Cobertura documentada; precisão maior em elementos anotados.

**ADR-3 — Git/time-travel sobre snapshots + git real opcional.**
Workspace do runtime é efêmero; snapshots (`site_project_versions`) já persistem. Implementamos a **UX git** do DaveLovable (History modal, diff, restore, checkout em modo leitura, "voltar ao atual") sobre snapshots + `diff` (jsdiff); hash = id curto da versão. Git real por projeto (commit/branch/remote) permanece via integração GitHub existente e pode ser habilitado no runtime (persistência do repo no artifact store) — diferença documentada.

**ADR-4 — Orquestração Planner/Coder no runtime Node (TypeScript).**
Novo `agent-runtime/src/studio/` com máquina de estados Router→Planner/Coder espelhando o contrato do DaveLovable (`DELEGATE_TO_PLANNER`, `SUBTASK_DONE`, `TERMINATE`), usando o **provider validado do Prospector** via Cline SDK. Planner sem tools; Coder com o conjunto de tools. Guards existentes incorporados (não recriar).

**ADR-5 — Streaming: eventos estilo DaveLovable.**
Estender `/run` (NDJSON) para emitir `agent_interaction` (thought/tool_call/tool_response + `agent_name`), além de `files_ready`, `git_commit`, `reload_preview`, `complete` (mantendo `activity` para compatibilidade). O `ChatPanel` renderiza thoughts + `ToolExecutionBlock` agrupado.

**ADR-6 — Provider: o do Prospector.** Planner e Coder usam o mesmo provider/modelo validado (`runtime-ai-config`). Não usar Gemini do DaveLovable. (Evolução futura: modelo por papel.)

**ADR-7 — Identidade e licença.** Branding 100% TiagoProspector; nenhum asset/texto DaveLovable copiado. Avisos MIT em `THIRD_PARTY_NOTICES.md` para trechos reutilizados.

---

## 4. Mapa DAVELOVABLE → TIAGOPROSPECTOR

| Sistema | DaveLovable | Ação | Destino no Prospector |
|---|---|---|---|
| Layout do editor | Editor.tsx (ResizablePanelGroup aninhado, footer) | **Adaptar** | `src/components/sites/studio/StudioShell.tsx` (mesma estrutura; branding Prospector) |
| Toolbar superior | EditorTabs | **Substituir** | `StudioToolbar.tsx`: toggle Preview/Code/Visual + ações comerciais |
| Chat | ChatPanel + useChat (SSE) | **Substituir** | `StudioChatPanel.tsx` + `useStudioChat` (consome eventos do `/run`) |
| Stream de eventos | SSE `agent_interaction` | **Adaptar** | Runtime `/run` passa a emitir `agent_interaction`/`files_ready`/`git_commit`/`reload_preview`/`complete` |
| Code editor | Monaco controlado | **Adaptar** | `StudioCodeEditor.tsx` (Monaco; save → `generated_code` via Supabase) |
| Abas | EditorTabs | **Adaptar** | `StudioEditorTabs.tsx` |
| File explorer | FileExplorer (árvore real) | **Adaptar** | `StudioFileExplorer.tsx` (create/delete/rename/search) |
| Preview | WebContainers + HMR | **Substituir (ADRs 1)** | `StudioPreviewPanel.tsx` sobre `prepareProjectPreview` + bridge; devices desktop/tablet/mobile |
| Visual editor | helper injetado + Fiber | **Substituir (ADRs 2)** | `visual-editor-helper.js` + `StudioVisualEditorPanel.tsx` + `applyVisualEdit` |
| Elemento→código | React Fiber `_debugSource` | **Substituir (ADRs 2)** | `sourceMap.ts` (`data-pfsrc` + matcher) |
| Agentes | AutoGen Planner+Coder | **Reimplementar (ADRs 4)** | `agent-runtime/src/studio/planner-coder.ts` |
| Router | `selector_func` | **Reimplementar** | `router.ts` (mesmo contrato de sinais) |
| Tools FS/busca | read/write/edit/delete/list/glob/grep/file_search | **Adaptar** | Ampliar registry (tools atuais + glob/grep/list_dir) |
| Tools git | git_* | **Adaptar (ADRs 3)** | git real no runtime/artifacts + snapshots para UX |
| Terminal | run_terminal_cmd | **Reusar** | `run_command` já existe (restrito) |
| Browser | (n/a no DaveLovable) | **Preservar** | `browser-*` já existe (QA/validação) |
| Guards | (parcial: linter) | **Preservar/Integrar** | completion/regression/generation/work-evidence (não recriar) |
| Git UI | GitHistoryModal/Config | **Adaptar** | `StudioHistoryDialog.tsx` + `StudioGitConfigDialog.tsx` |
| Multimodal | imagens (PDF gap) | **Adaptar** | attachments atuais + envio de imagem ao provider |
| Memória | `.agent_state.json` + buffer | **Preservar/Integrar** | `agent_conversation_memory` + `project-context` + `conversation-window` |
| Persistência | SQLite + FS + git | **Preservar** | Supabase `site_projects`/`site_project_versions`/chat |
| Scaffold/export | Vite+React+TS+Tailwind | **Reusar** | `siteExportCore`/`siteDownload` (já existem) |
| Recursos comerciais | — | **Preservar/Reorganizar** | Toolbar do Studio |

**Remover (após fase 8):** `SiteEditor.tsx` (morto), `invokeAgentExecute`/edge `agent-execute`, fallback `editSiteWithAI`/`edit-site`, `generateSiteSpec`/`generate-site`, duplicações `_shared`.

---

## 5. Arquitetura-alvo

### 5.1 Frontend (Site Studio)
Rota `/sites/:id` renderiza `SiteProjectPage` (container de dados) → `StudioShell`. Estrutura (com `react-resizable-panels`, `autoSaveId`):
```
StudioShell (h-[calc(100vh-<header>)])
├─ [horizontal] Chat (35/20/40) | Main (65)
│    └─ [horizontal] Explorer (18/15/30) | (StudioToolbar + [horizontal] Code | Preview)
└─ StatusBar
Overlays: StudioHistoryDialog, StudioGitConfigDialog, StudioVersionsDialog (legado)
```
`StudioToolbar`: `[Code|Split|Preview]` `[Visual Edits]` · `[WhatsApp][Proposta][Vídeo][Publicar][GitHub][Exportar]` (+ Histórico/Config/Run).
Componentes em `src/components/sites/studio/`; hooks em `src/hooks/studio/`; helpers em `src/lib/studio/`.

### 5.2 Chat + streaming
`useStudioChat` faz `POST /run` (NDJSON) e mapeia eventos para `StudioMessage{ thoughts, toolCalls, toolResponses, content, agent }`. `AgentInteraction` (thought) e `ToolExecutionBlock` (pares por índice) reproduzem o DaveLovable. Reload do preview agendado em `reload_preview`; invalidação de arquivos em `files_ready`.

### 5.3 Monaco + filesystem
Files in-memory (`generated_code`) como fonte; `StudioFileExplorer` árvore real; create/delete/rename (`rename` = delete+create ou novo campo); open→tab; save (`Ctrl/Cmd+S`) → `updateGeneratedFiles(projectId, {path:content})` + `createSiteVersion`; dirty por arquivo; opcional: models por arquivo (melhora multi-aba/undo).

### 5.4 Preview + devices
`StudioPreviewPanel` usa `prepareProjectPreview(files)` (com `allow-same-origin`), injeta `visual-editor-helper.js` e o `sourceMap`; devices desktop/tablet/mobile (375/768/100%); reload e live-update (re-render ao salvar/editar visual). Console capturado por postMessage (reusa `browserLogs`/padrão existente).

### 5.5 Visual editor + elemento→código
Fluxo: `PREVIEW → CLICK → SELECTED → STYLE PANEL → EDIT → CODE UPDATED → PREVIEW UPDATED` e `CODE EDIT → PREVIEW UPDATED`.
Helper injetado: modos hover/seleção, seletor CSS, atributos, `data-pfsrc`. Painel: cores, tipografia, spacing (drag), borda, raio/sombra/opacidade, `className` avançado, "Pedir ao agente". Persistência: `applyVisualEdit(files, {selector, changes})` reescreve o elemento no HTML (DOMParser) e salva.

### 5.6 Git / histórico / time travel
`StudioHistoryDialog`: lista versões (hash curto, autor, data, resumo), diff por arquivo (jsdiff), **Restore** (volta a versão → nova versão "restore"), **View/Checkout** (modo leitura), **Voltar ao atual**. Commit por turno: após edição aplicada, criar `site_project_version` com `change_summary` (gerado como no `commit_message_service`, via provider atual). Publicação/export independentes.

### 5.7 Agente Router/Planner/Coder (runtime Node)
`agent-runtime/src/studio/`:
- `router.ts` — seleção de próximo falante (contrato §2.1).
- `planner.ts` — prompt de planejamento (sem tools), formato `PLAN:` + `[ ]/[x]` + `Next task`.
- `coder.ts` — prompt do Coder + tools; sinais `DELEGATE_TO_PLANNER`/`SUBTASK_DONE`/`TERMINATE`.
- `orchestrator.ts` — loop, contexto (janela), término (`TERMINATE`/máx. mensagens), evidência/guards.
- Integra `ProspectorSiteAgent` (Cline) como motor de execução do Coder; Planner via chamada de modelo sem tools.
Roteamento: `[VISUAL EDIT]`/`[BUG FIX]`/edição cirúrgica → Coder; demais → Planner.

### 5.8 Ferramentas (alvo)
FS: `read_file`, `write_file`, `edit_file`, `delete_file`, `rename_file`, `move_file`, `list_files`, `list_dir`, `glob_search`, `grep_search`, `file_search`. Terminal: `run_command`. Browser: `browser_*` (já existentes). Git: `git_status/add/commit/diff/log/branch/checkout/restore`. Contexto: `get_site_context`. Entregáveis: branding/mockup/pdf/package/video. Web: `web_search`. Conclusão: `finish_task`.

### 5.9 Multimodal
Attachments `{type, mime_type, data, name}`; imagens (≤10MB, ≤2048²) enviadas ao provider com visão; PDF (≤20MB) validado (enviar como imagem de página quando o provider suportar, ou documentar). Screenshots de preview para referência/QA.

### 5.10 Memória/contexto
Por projeto: `project-context` (decisões/estrutura) + `agent_conversation_memory` (transcript) + janela segura (`conversation-window`). Sem misturar projetos.

### 5.11 Ações comerciais (toolbar)
WhatsApp, Proposta (PDF), Vídeo (MP4), Publicar/Despublicar, GitHub, Baixar/Exportar ZIP, Histórico, Run. Todos os handlers atuais são preservados e realocados no `StudioToolbar`/painéis.

---

## 6. Fases de implementação

> Cada fase termina com: `tsc` 0, suíte afetada verde, build, e verificação no Chromium real quando aplicável.

### Fase 1 — Site Studio (shell/UI)
- Adicionar deps: `monaco-editor`, `@monaco-editor/react`, `react-resizable-panels`, `diff`.
- Criar `StudioShell`, `StudioToolbar`, `StudioChatPanel`, `StudioFileExplorer`, `StudioCodeEditor`, `StudioEditorTabs`, `StudioPreviewPanel`, `StudioVisualEditorPanel`, `StudioHistoryDialog`, `StudioGitConfigDialog`, `StatusBar`.
- `SiteProjectPage` vira container de dados; layout antigo (grid 420px) removido.
- **Aceite:** layout DaveLovable com branding Prospector, painéis redimensionáveis persistentes, ações comerciais na toolbar.

> **Status: ✅ concluída (2026-09).** Implementado em `src/components/sites/studio/*` + `src/lib/studio/*`.
> Ativação por feature flag: `VITE_STUDIO_UI=1` (ou `localStorage["prospector-studio-ui"]="1"`); com a flag
> desligada o layout legado continua sendo usado. Componentes são seams: `StudioChatPanel` reutiliza o
> `SiteChat` existente e `StudioHistoryDialog`/`StudioGitConfigDialog` embrulham as integrações atuais
> (versões/GitHub) — a Fase 2 e a Fase 6 substituem o interior. O preview ainda roda **sem
> `allow-same-origin`** (postura de segurança preservada); o bridge só é ligado na Fase 4/5.
> Verificado: `tsc` 0, eslint 0 erros, build Vite OK, 433 testes verdes (incl. `studio-shell*.test.*`).

### Fase 2 — Agente Router/Planner/Coder + streaming
- `agent-runtime/src/studio/*` (router/planner/coder/orchestrator).
- `/run` emite `agent_interaction`/`files_ready`/`git_commit`/`reload_preview`/`complete`.
- `useStudioChat` consome; `AgentInteraction` + `ToolExecutionBlock`.
- **Aceite:** tarefa simples → Coder; tarefa complexa → Planner→Coder com `PLAN` visível; thoughts/tools agrupados; streaming em tempo real.

> **Status: ✅ concluída (2026-09).** Implementado `agent-runtime/src/studio/{model-call,router,planner,coder,orchestrator}.ts`;
> `/run` ganhou `orchestrate` (opt-in, preserva o fluxo legado byte a byte) e passou a emitir
> `agent_interaction`/`agent_route`/`plan`/`files_ready`/`reload_preview`/`complete` no NDJSON,
> mantendo `start`/`ping`/`activity`/`result` para compatibilidade. O Coder continua sendo o
> `ProspectorSiteAgent` (Cline) com TODOS os guards existentes — o Planner é chamada de modelo sem
> ferramentas usando o provider validado (sem fallback Gemini/DeepSeek). Front: `useStudioChat`,
> `AgentInteraction`, `ToolExecutionBlock`, timeline no `StudioChatPanel` e `files_ready`/
> `reload_preview` atualizando Monaco/Preview ao vivo.
> **Desvio documentado:** o `useStudioChat` é o dono do ESTADO/leitura dos eventos (não dispara o
> POST); a execução permanece no container `SiteProjectPage` para não duplicar autosave/
> versionamento/guards. Cancelamento aborta o agente ao desconectar o cliente.
> `git_commit` NÃO é emitido nesta fase de propósito: não existe commit real até a Fase 6 (emiti-lo
> agora seria um evento sem lastro).
> Verificado: `tsc` 0 (front+runtime), eslint 0 erros, build front + `build-entry` OK,
> 438 testes front e 462/465 runtime (3 falhas preexistentes, ver abaixo).

### Fase 3 — Code + filesystem
- Monaco ↔ `generated_code`; explorer real; create/delete/rename; save/version.
- **Aceite:** abrir/editar/salvar arquivo; alteração aparece no preview; edição do agente aparece no Monaco.

> **Status: ✅ concluída (2026-09).** Runtime: ferramentas `create_file` (create-only), `list_dir`,
> `glob_search`, `grep_search`, `file_search` adicionadas às já existentes (`read_file`/`write_file`/
> `edit_file`/`delete_file`/`rename_file`/`move_file`/`list_files`/`run_command`), todas scoped por
> `safeJoin`. Proteção de segredos unificada em `workspace.ts` `isSensitivePath` (`.env*`, `.npmrc`,
> `.netrc`, `.git-credentials`, `id_rsa/ed25519/dsa/ecdsa`, `.htpasswd`) usada por `workspace.ts` e
> `tools.ts`. `run_command` já era controlado (só `npm install|ci|run <script>`; cwd=workspace; sem
> secrets; timeout; limite de saída; exit!=0=erro) — mantido.
> Front: fonte ÚNICA `mergeEffectiveFiles`/`computeDirtyPaths` (rascunhos do Monaco sobre o mapa
> persistido, sem ressuscitar arquivo removido nem dirty fantasma), `Ctrl/Cmd+S` salva o mesmo estado
> do botão (sem duplicar autosave/versão), e o agente recebe o estado ATUAL do editor via
> `onApplyWithFiles`. Coder agora recebe a ESTRUTURA (caminhos, não conteúdos) no prompt.
> **Notas:** como `generated_code` é um mapa plano `{path:content}`, diretórios são IMPLÍCITOS
> (criados por caminhos de arquivo) — não há pasta vazia persistível; e "mover" = `rename_file` para
> outro diretório. O bridge visual NÃO usa `allow-same-origin` (implementado na Fase 4 com
> postMessage + token; ver nota da Fase 4).
> Verificado: `tsc` 0 (front+runtime), eslint 0 erros no front, build front + `build-entry` OK,
> 444 testes front e 480/484 runtime (4 falhas de carga/preexistentes; ver relatório da Fase 3).

### Fase 4 — Preview
- Preview engine (ADR-1), devices desktop/tablet/mobile, live update, console, reload.
- **Aceite:** 3 viewports; edição de código reflete no preview; preview interativo.

> **Status: ✅ concluída (2026-09).** Além do engine/devices/live-update/console/reload, a Fase 4
> entregou o **bridge Preview↔Studio** e a base de **elemento→código** (a inspeção que o plano
> original alocava na Fase 5).
> **DECISÃO DE SEGURANÇA (divergência consciente do ADR-1):** o iframe **continua SEM
> `allow-same-origin`** (origem opaca), por instrução explícita desta fase. O bridge usa
> `postMessage` com `channel` + `version` + **token de sessão** (novo a cada documento) e valida
> `event.source` (a janela do iframe), origem (`"null"`/origem do app) e payload por type guard
> (`src/lib/studio/bridgeProtocol.ts`). O Preview não recebe acesso a filesystem/tools/credenciais.
> `src/lib/studio/previewHelper.ts` injeta o helper (hover/seleção/console/erros) na CÓPIA de
> preview; `src/lib/studio/sourceMap.ts` anota `data-pfsrc="arquivo:linha"` (só na cópia) e resolve
> `resolved`/`unresolved`/`unsupported` sem inventar origem (React/TSX → `unsupported`, sem Fiber).
> Seleção → `StudioVisualEditorPanel` mostra tag/seletor/atributos/rect e o arquivo:linha, com
> "Abrir no editor" (Monaco). Console capturado via bridge em painel recolhível. `applyVisualEdit`
> e os controles de estilo continuam DESLIGADOS (Fase 5).
> Verificado: `tsc` 0 (front+runtime), eslint 0, build front OK, **462/462** testes front
> (incl. `studio-bridge.test.ts` 18/18); runtime sem alterações nesta fase.

### Fase 5 — Visual editor
- Helper + bridge + `sourceMap.ts` + painel de estilos + `applyVisualEdit`.
- **Aceite:** clicar no título → selecionado; mudar cor → preview e código atualizados; selecionar → Monaco abre arquivo/linha.

> **Status: ✅ concluída (2026-09).** `src/lib/studio/visualEdit.ts` aplica edições DIRETAS e
> determinísticas no CÓDIGO REAL: texto (elemento de texto simples), estilo (merge no `style` inline
> existente → senão na REGRA CSS da classe em `.css` top-level → senão inline) e atributos
> (`href`/`src`/`alt`). Localização por `data-pfsrc`/linha ou matcher único; **ambiguidade, estrutura
> com tags filhas, origem `unresolved`/`unsupported` e escopo por breakpoint são BLOQUEADOS** e
> encaminhados ao Coder com contexto estruturado (`buildVisualAgentInstruction`). O painel
> (`StudioVisualEditorPanel`) ficou funcional: texto, cor, fundo, fonte, peso, alinhamento, padding,
> margem, borda, raio, opacidade, largura/altura, display, sombra, `object-fit`/`object-position`
> (imagem) e link; seletor de escopo Global/Mobile/Tablet; mostra a **evidência** (arquivo + modo +
> verificação). Closed-loop no `StudioShell`: aplicar → `verifyVisualEdit` no ARQUIVO final → salvar
> (filesystem/versão) → Monaco/Explorer/Preview sincronizam (mesma fonte da Fase 3) → seleção
> invalidada pelo novo token do preview. Se a verificação falhar → Coder.
> **Desvios documentados:** (a) sem round-trip por `DOMParser` (reescreveria/reformataria o arquivo
> inteiro) — usa edição localizada/ancorada; (b) edição por breakpoint vai para o Coder (preserva os
> `@media` existentes em vez de inventar); (c) **drag/resize não implementado** (o plano/DaveLovable
> não exige e o mapeamento seguro para código é ambíguo); (d) “substituir imagem” (nova fonte) vai
> para o Coder (busca/multimodal é Fase 7); (e) texto com tags filhas vai para o Coder.
> Verificado: `tsc` 0 (front+runtime), eslint 0, build front + `build-entry` OK, **481/481** testes
> front (incl. `studio-visual-edit` 15/15 e `studio-visual-panel` 4/4).

### Fase 6 — Git/histórico/time travel
- `StudioHistoryDialog` com diff/restore/checkout; commit por turno (version + resumo).
- **Aceite:** editar→commit→diff→rollback; checkout em modo leitura e volta ao atual.

> **Status: ✅ concluída (2026-09).** Git REAL no workspace do projeto.
> **Runtime:** `agent-runtime/src/studio/git.ts` (init/status/log/diff/show/commit/restore) via
> `spawn("git", …, {cwd: workspace, shell:false})`, ambiente sem segredos, `GIT_TERMINAL_PROMPT=0`,
> `--no-verify`, timeout 20s, saída limitada a 200KB, hash/caminhos validados (sem `..`, sem `.git`,
> sem segredos), `.gitignore` de segurança (nunca versiona `.env`/credenciais). Restore = time travel
> EXATO (remove arquivos que não existiam no commit, restaura e registra um novo commit). Endpoint
> autenticado `POST /git` (mesma identidade ticket/JWT do `/run`). `materializeWorkspace` passou a
> **preservar `.git`** entre execuções.
> **Front:** `src/lib/studio/gitApi.ts` (transporte) e `src/lib/studio/gitFiles.ts` (patch unificado);
> `StudioHistoryDialog` real: lista de commits (mensagem/data/autor/arquivos), “Comparar com” (estado
> atual ou outro commit), lista de arquivos com +/− e **Monaco DiffEditor** (original × modificado),
> criação de checkpoint e restauração com confirmação. `Versões internas` (autosave) continua
> acessível. Restauração bloqueada quando há alterações não salvas (`dirty` do container OU rascunhos
> do editor via `onUnsavedChange`); nunca restaura silenciosamente.
> **Sync:** restore → `persistAutosave(files)` → `generated_code` + versão → Monaco/Explorer/Preview
> (mesma fonte da Fase 3) → novo token invalida a seleção (Fase 4). Autosave com mudança real também
> cria um **checkpoint Git** best-effort (não bloqueia nem substitui `site_project_versions`).
> **Desvios documentados:** (a) Git é LOCAL (não confunde com o botão GitHub, que segue intacto);
> (b) escopo por breakpoint não afeta Git; (c) sem push/pull/fetch (sem rede/credenciais).
> Verificado: `tsc` 0 (front+runtime), eslint 0, build front + `build-entry` OK, **486/486** testes
> front e **494/497** runtime (`studio-git.test.ts` 13/13 com repositório real; 3 falhas flaky/
> preexistentes).

### Fase 7 — Multimodalidade
- Imagens/PDF/screenshot ao provider; UI de anexos no chat.
- **Aceite:** enviar referência visual e gerar/editar a partir dela.

### Fase 8 — Reintegrar comerciais + limpeza
- Toolbar final; remover código morto/legado; polir; README.
- **Aceite:** todos os botões funcionando; sem código morto.

---

## 7. Teste real (navegador/Chromium) — 15 cenários

1. Criação: "Crie um site para uma loja de roupas." → gera e renderiza.
2. Edição: "Troque a cor do botão para vermelho." → código+preview.
3. Visual: selecionar elemento e alterar estilo.
4. Código: abrir arquivo no Monaco e editar.
5. Sincronização: código→preview e preview→código.
6. Responsivo: desktop/tablet/mobile.
7. Chat: múltiplas mensagens mantendo contexto.
8. Complexidade: tarefa grande → Planner→Coder.
9. Git: alterar→commit→diff→rollback.
10. Multimodal: enviar referência visual.
11. WhatsApp.
12. Vídeo.
13. Proposta (PDF).
14. Publicação (+ link público).
15. GitHub / Exportação ZIP.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Escopo muito grande / regressão | Fases independentes, testes por fase, feature flag para o novo Studio |
| COOP/COEP (se WebContainer) | Não obrigatório (ADR-1); camada 2 atrás de flag |
| Provider sem function-calling robusto | Reutilizar o provider validado; fallback de edição sem tools; testes por provider |
| Elemento→código impreciso em HTML estático | `data-pfsrc` determinístico + matcher + documentar cobertura |
| Git real vs snapshots | ADR-3: snapshots para UX, git real opcional; diferença documentada |
| Perda de recursos comerciais | Handlers preservados; checklist de regressão comercial |
| Licença MIT | `THIRD_PARTY_NOTICES.md` + preservar avisos |

---

## 9. Checklist de entrega

1. Testes (front + runtime) verdes; 2. TypeScript 0; 3. Build front; 4. Testes do runtime; 5. Testes reais no Chromium; 6–16. cenários acima; 17. corrigir regressões; 18. commit; 19. push; 20. deploy (Vercel + Railway); 21. verificar `/health`; 22. confirmar commit/version implantado.

---

## 10. Aprovação

A implementação começa pela **Fase 1**. O agente atual só será removido após o novo Studio estar funcional (fases 2–4), evitando indisponibilidade.

---

## 11. CORREÇÃO DE DIREÇÃO — DaveLovable como núcleo (C0–C7)

Redirecionamento aprovado: a área de criação de sites deve reproduzir a **experiência e arquitetura do DaveLovable** (React/Vite + WebContainer), mantendo a infraestrutura de IA e os recursos comerciais do Prospector. Fases antigas ficam como legado `static`.

- **C0 — Foundation + Vertical Slice:** ✅ concluída. Template React/Vite/TS/Tailwind, `@webcontainer/api`, file store, `WebContainerPreview`, headers COOP/COEP (`credentialless`), `project_kind: "static" | "react"` (default `static`). Validação manual de browser pendente.
- **C1 — DaveLovable Agent Core:** ✅ concluída. Novo núcleo `agent-runtime/src/studio/agent-core/*` + `studio/team.ts`:
  - **Coder** com ferramentas reais (não é o `ProspectorSiteAgent`), loop de tool-calling próprio;
  - **Planner** separado, SEM ferramentas;
  - **Selector** sobre estado/sinais (`TERMINATE`/`DELEGATE_TO_PLANNER`/`SUBTASK_DONE` estruturados);
  - **primeira mensagem** com árvore + conteúdo relevante + pedido (com limites);
  - **estado por projeto** fora do workspace (`.agent-state.json` irmão do workspace).
  - Roteamento: `project_kind === "react"` → StudioTeam; `static` → fluxo legado intacto. O Router heurístico (`studio/router.ts`) e o `ProspectorSiteAgent` **deixaram de ser chamados** para React (permanecem no código para o fluxo static até C7).
  - Eventos compatíveis com o front atual: `agent_interaction`, `plan`, `files_ready`, `reload_preview`, `complete`, `result`, `error`.
- **C2 — Unified ChatPanel:** ✅ concluída. Para `react`, o Studio passa a usar um **ChatPanel unificado** (`UnifiedChatPanel`) com conversa + Agent Activity + tool execs + commits no MESMO fluxo (substitui a timeline separada). Markdown (react-markdown/remark-gfm), estados de execução derivados (`useStudioChat.runs`/`phase`/`currentAgent`/`currentTool`), input com Enter/Shift+Enter, anexo, **cancelamento real** (AbortController) e modo **Visual Edits** no header. `static` mantém `SiteChat` + timeline (legado). Eventos compatíveis.
- **C3 — Visual Editing real:** ✅ concluída. Seletor→código para React via `_debugSource`:
  helper injetado SOMENTE na projeção do WebContainer lê o fiber React e reporta a seleção
  (`reactVisualHelper.ts`); o funil normaliza o caminho (`reactSource.ts`) e resolve arquivo/linha
  (`resolveElementSource` prioriza `reactSource`). O painel mostra componente/arquivo/linha e "Abrir no
  editor" navega o Monaco. "Aplicar" tenta a alteração DETERMINÍSTICA server-side (`POST /visual-edit` →
  `studio/visual-edit.ts`: `style` inline em JSX, regra CSS de classe, texto simples) e, quando não é
  inequívoca (JSX complexo, sem `style` inline, breakpoint, ambíguo, sem origem), devolve
  `handoff:"coder"` → o pedido estruturado segue pelo Unified ChatPanel → StudioTeam C1 (nenhum agente
  visual paralelo, nenhum Router/`ProspectorSiteAgent`). `data-pfsrc`/helper nunca vão para
  `generated_code`/ZIP/publicação. Guards de caminho/segredo reutilizados.
- **C4 — Git UX + Time Travel (React):** ✅ concluída. Endpoint `/git` passa a exigir
  `project_kind=react`; mensagens de commit úteis via `deriveCommitMessage` (sem "update/changes/AI
  changes"); o histórico abre no Studio React **independentemente da feature flag** (o container usa
  `isReactProject`), com diff (Monaco DiffEditor) e **Abrir no editor**. Time travel restaura o
  workspace real (remove arquivos que não existiam, restaura e registra um novo commit) → front
  persiste (`persistAutosave`) → fileStore → WebContainer (HMR). **Proteção de trabalho:** buffer do
  editor não salvo **bloqueia** o restore; alterações persistidas não commitadas geram **snapshot**
  (versão + commit) antes do time travel — nada é destruído silenciosamente. Commits aparecem no
  UnifiedChatPanel (C2). `static` segue nas versões internas.
- **C5 — Publish/Export React:** ✅ concluída. Build de PRODUÇÃO real no runtime
  (`studio/build.ts`: `npm install` 1x + `npm run build` do próprio package.json, timeout, log,
  validação de `dist/index.html`), colapsado em HTML auto-contido (`collapseDistToSingleHtml`) e
  publicado pela infraestrutura existente (`published_code` + página pública, com marcador
  `prospector-react-build`). Publish/Unpublish React e Export ZIP do **código-fonte** (reutiliza
  `filterWorkspaceFiles` + remove `.prospector`/helper); `dist`/`node_modules`/`.git`/`.env`/segredos
  ficam fora do ZIP. `static` intacto. Endpoint autenticado `POST /build` (só `project_kind=react`).
- **C6 — Multimodal + Memória + Execution States:** ✅ concluída. Anexos do `/run` React são
  materializados (imagem vira **contexto visual real** no modelo — `image_url` OpenAI / `inlineData`
  Gemini; PDF/arquivo vira referência de caminho). **Memória por projeto** estruturada
  (`studio/memory.ts`: designPreferences/projectDecisions/userInstructions/importantComponents/notes),
  arquivo irmão do workspace (nunca em `files_ready`/Git/ZIP/publicação), sanitizada (rejeita
  segredos), isolada por projeto, extraída deterministicamente de preferências explícitas e injetada
  como contexto auxiliar ("o CÓDIGO REAL prevalece"). **Estados de execução** ampliados
  (`preparing/planning/coding/tool_running/validating/files_ready/committing/complete/cancelled/error`)
  derivados dos eventos reais, e **retry** no UnifiedChatPanel sem duplicar mensagens.
- **C7 — Limpeza final:** ✅ concluída. Removido apenas código **comprovadamente morto**; legado do
  Static preservado e marcado. Atualização da documentação de estado final abaixo.

---

## 12. ESTADO FINAL (pós-C7)

### React Studio (caminho principal)
```
SiteProjectPage → StudioShell → UnifiedChatPanel → StudioTeam (Coder/Planner/Tools)
→ Workspace → fileStore → WebContainer → Vite/HMR → Preview
Visual: Selection → Source Mapping (_debugSource) → Visual Edit → Coder → Workspace → WebContainer
Git: Workspace → Git → History/Diff/Time Travel
Publish: Workspace → Build → Publish      Export: Workspace → Source ZIP
```

### Static (legado compatível, inalterado)
```
SiteProjectPage (legacy grid) → SiteChat + timeline → invokeProspectorAgent/ProspectorSiteAgent
→ preview srcDoc (LiveProjectPreview/prepareProjectPreview) → versões internas (site_project_versions)
→ publishSiteProject (spec + published_code) → exportWorkspaceZip
```
`/generate` (spec/branding/mockup/vídeo) continua atendendo o Static e os recursos comerciais.

### Legacy preservado por compatibilidade (não removido)
| Item | Consumidor atual |
|---|---|
| `prospector-site-agent.ts` (Cline) | `/run` Static e caminho `orchestrate` do Static |
| `studio/router.ts` + `planner.ts`/`coder.ts`/`orchestrator.ts` (Fase 2) | apenas `orchestrate` do Static (React nunca usa) |
| `SiteChat.tsx` | UnifiedChatPanel (composer) + Static |
| `LiveProjectPreview.tsx` / `prepareProjectPreview` (srcDoc) | Static + página pública |
| `site_project_versions` (versões internas) | Static + snapshot do C4 |
| Edge `agent-execute` / `generate-site` / `edit-site` | sem chamador no front após C7; preservadas (deploy/infra) |
| `editSiteWithAI` (edge `edit-site`) | fallback legado do Static sem workspace |

### Endpoints
| Endpoint | React | Static | Legado | Removido |
|---|---|---|---|---|
| `/run` (`/run` runtime) | ✅ StudioTeam | ✅ ProspectorSiteAgent | — | não |
| `/visual-edit` | ✅ | — | — | não |
| `/git` | ✅ | — | — | não |
| `/build` | ✅ | — | — | não |
| `/generate` | — | ✅ (spec/branding/comercial) | — | não |
| edge `agent-execute` | — | — | sem chamador (preservado) | não |
| edge `generate-site` | — | (comercial/infra) | preservado | não |
| edge `edit-site` | — | ✅ fallback | preservado | não |

### Removido no C7 (comprovadamente morto)
| Item | Motivo |
|---|---|
| `src/components/sites/editor/SiteEditor.tsx` | nenhuma referência (só auto-referências) |
| `invokeAgentExecute` (+ helper `slugName`) em `siteProjectsApi.ts` | importado e nunca chamado; substituído por `invokeProspectorAgent`/`/run` |
| `generateSiteSpec` em `siteProjectsApi.ts` | sem chamadores; `/generate` usa `invokeProspectorGenerate` |
| imports dos runners `supabase/functions/_shared/agent-*` em `agentProject.ts` (+ `workspaceOf`/`agentTool`/`agentWriteFile`/`agentEditFile`) | sem consumidores; puxavam código de edge para o bundle do navegador |

### Rodada de testes (C7) — números reconciliados
- **Frontend:** 554/554 (68 arquivos).
- **Runtime alvo C1–C6:** 73/73.
- **Runtime (suíte completa):** o total de testes é **557**; o número de falhas **varia com a carga**
  (observado **8** e **10** em execuções distintas). **Não** é "falhas + preexistentes" — a falha
  preexistente está DENTRO da contagem.
  - **Preexistente (reproduzível isolada): 1** — `test/edit-preservation.browser.test.ts`.
  - **Flaky por carga/contenção (passam isoladas): o restante (7–9 conforme a rodada)** — famílias
    `browser.test.ts`, `mockup-*`, `tools.test.ts` (`run_command`).
  - Forma correta: `557 total = (549+8) ou (547+10)`; falhas da rodada = `1 preexistente + (N−1) flaky`.
- **Typecheck** front/runtime: 0. **ESLint:** 0 erros (3 warnings preexistentes). **Builds:** OK.
