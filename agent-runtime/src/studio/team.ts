// StudioTeam (C1) — Coder-first + Planner-only, com Selector e sinais.
//
//   Usuário → StudioTeam → Selector → { Coder (tools) | Planner (sem tools) }
//
// O Planner nunca toca o workspace. O Coder opera no workspace real via tools
// (reaproveitadas do runtime) e emite `files_ready` via callback. Estado por
// projeto persistido fora do workspace.

import type { BusinessContext } from "../tools.js";
import { buildCoderTools } from "./agent-core/agent-tools.js";
import { callModelWithTools, type ModelCaller, type ModelMessage } from "./agent-core/model.js";
import { buildFirstMessage, isBootstrapProject } from "./agent-core/first-message.js";
import { runCoderTurn } from "./agent-core/coder.js";
import { runPlanner, type RunPlannerInput, type RunPlannerResult } from "./agent-core/planner.js";
import { selectNext, type LastSpeaker } from "./agent-core/selector.js";
import type { AgentSignal } from "./agent-core/signals.js";
import { loadProjectState, saveProjectState, type StudioStateMessage } from "./agent-core/project-state.js";
import { extractMemoryUpdates, loadMemory, memoryContextBlock, recordMemory, saveMemory } from "./memory.js";
import { mediaContextBlock } from "./agent-core/site-media.js";
import { buildDesignDirection, hasArtDirection, ART_DIRECTION_MARKER } from "./agent-core/design-direction.js";
import { isGlobalVisualEdit, wasProjectSwept, EDIT_SWEEP_NUDGE, namedColorTarget, colorTokens, targetApplied, paletteStillOld, colorNotAppliedNudge } from "./agent-core/edit-scope.js";

export interface StudioAttachment {
  name: string;
  path: string;
  mediaType: string;
  dataUrl: string;
}

export interface StudioTeamInput {
  instruction: string;
  projectId: string;
  workspaceRoot: string;
  business: BusinessContext;
  memory?: string[];
  conversation?: string[];
  /** Anexos materializados (imagem vira contexto visual real; PDF fica como arquivo). */
  attachments?: StudioAttachment[];
  /** Bloco textual de anexos (caminhos + orientação) para o Coder. */
  attachBlock?: string;
  ai: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  emit: (event: Record<string, unknown>) => void;
  readWorkspace: () => Record<string, string>;
  onFilesChanged?: (paths: string[]) => void;
  /** Injetável nos testes; default = provider real. */
  model?: ModelCaller;
  /** Injetável nos testes; default = Planner real (sem ferramentas). */
  planner?: (input: RunPlannerInput) => Promise<RunPlannerResult>;
  signal?: AbortSignal;
  maxRounds?: number;
  maxPlans?: number;
}

export interface StudioTeamResult {
  ok: boolean;
  reply: string;
  signal: AgentSignal | null;
  iterations: number;
  touched: string[];
  plan?: string;
  error?: string;
}

export const CODER_SYSTEM = `Você é o Coder do TiagoProspector Studio: um engenheiro que edita um projeto React + Vite + TypeScript + Tailwind REAL.
Você é o PRIMEIRO agente a receber o pedido e TEM ferramentas para trabalhar no projeto.

REGRAS DE TRABALHO:
- Antes de CADA ferramenta, escreva 1 frase curta explicando o que vai fazer e por quê.
- Se o pedido EXIGE alterar/criar o site, você OBRIGATORIAMENTE deve chamar ferramentas de edição (write_file/edit_file/create_file) para gravar os arquivos REAIS. Responder apenas com texto NÃO conclui a tarefa.
- Leia o arquivo antes de editá-lo. Use edit_file para mudanças cirúrgicas; write_file para arquivo novo/grande.
- Em EDIÇÕES, preserve APENAS o que continua coerente com o pedido (ver seção de EDIÇÕES abaixo).
- Não crie arquivos vazios nem placeholders (.gitkeep). Só código funcional.
- Use run_command (action=run, script=build) para verificar quando fizer sentido; NÃO rode dev server.
- Nunca invente sucesso: só finalize depois de alterar de verdade.

CRIAÇÃO (PRIMEIRA GERAÇÃO DE UM PROJETO NOVO) — IDENTIDADE PRÓPRIA:
- O projeto começa com um BOOTSTRAP neutro marcado "prospector-bootstrap". Ele é DESCARTÁVEL e NÃO é a identidade final. Nesta primeira geração você DEVE substituí-lo.
- Antes de escrever código, declare em 1-2 linhas a DIREÇÃO VISUAL deste negócio: (a) paleta com códigos HEX, (b) tipografia (fontes de título e corpo), (c) arquétipo de layout/composição, (d) lista de seções escolhidas para ESTE segmento.
- Depois IMPLEMENTE exatamente essa direção: reescreva "src/App.tsx" e "src/index.css", crie componentes próprios (ex.: "src/components/*") e materialize o design (variáveis de cor/tipografia). NÃO mantenha as cores/estrutura do rascunho.
- A direção deve ser ESPECÍFICA do negócio: um eletricista e um pet shop NÃO podem ter a mesma cara. Nada de reaproveitar o mesmo layout/paleta/textos para clientes diferentes.
- Diferencie de verdade (não só troque nome/cor): composição do hero, ritmo das seções, tipografia, formas, tratamentos de imagem e CTAs.

EDIÇÕES EM PROJETO EXISTENTE (pense como DEV FRONT-END SÊNIOR + UI/UX; NÃO é "patch mínimo"):
- Interprete pelo RESULTADO: o pedido define o que o site deve ficar. Você decide como chegar lá. Não procure apenas uma string para trocar.
- "Preservar" = manter o que continua coerente com o pedido. NÃO significa "mexer o mínimo". Se o pedido contradiz o estado atual, ATUALIZE tudo que for afetado.
- Liberdade total: editar/criar/remover arquivos e componentes, alterar JSX/TS/CSS/Tailwind, design tokens/variáveis, seções, ordem dos elementos, tipografia, cores, backgrounds, gradientes, bordas, sombras, hovers/focus, animações, responsividade, imagens e o sistema visual.
- MUDANÇA GLOBAL (ex.: "troque a cor/tema para X", "deixe mais escuro/sofisticado/minimalista", "site inteiro"): ANTES de editar, use grep_search para encontrar TODAS as ocorrências da identidade atual (CSS variables, classes Tailwind, hex/rgb, gradientes, botões, links, bordas, cards, header, hero, footer, overlays, hover/focus, dark/claro). Atualize primeiro o design system/tokens e depois elimine o que restou com a identidade antiga. NÃO pode ficar metade com a identidade anterior.
- Trocar a cor principal: mude variáveis/tokens + todas as superfícies e estados; nunca só o hero.
- Remover seção: remova de verdade (componente, imports, ids, links de navegação e dados usados só por ela); não basta esconder.
- Adicionar seção: componha na identidade existente (integrada ao design system), responsiva e com hierarquia — não despeje cards genéricos.
- Se for melhor reconstruir/substituir/refatorar uma seção ou componente, FAÇA. Código antigo que impede o resultado pedido não deve ser preservado.
- Preserve o que NÃO foi pedido: conteúdo válido, dados, integrações, funcionalidades e comportamentos que não conflitam com a solicitação.
- AUTOVERIFICAÇÃO antes de concluir: "se o usuário olhar o site AGORA, ele verá exatamente a mudança pedida em TODO o site?" Se não, CONTINUE trabalhando (não conclua).
- Revisão visual final: coerência de cores/contraste/hierarquia/espaçamento/tipografia/estados hover/responsividade entre TODAS as seções (header, hero, conteúdo, cards, CTA, footer). Alteração parcial NÃO é entrega.

METODOLOGIA (pense como diretor de arte, não como quem "monta uma página"):
- Você tem a ferramenta "design_skills": consulte-a ao criar/reformular o visual quando precisar da técnica (ela é o seu guia instalado — não precisa decorar tudo).
- ANÁLISE primeiro: segmento, público, posicionamento, ticket percebido, objetivo comercial, principal dúvida do cliente. Depois decida o design.
- Você recebe um BRIEFING DE DIREÇÃO DE ARTE no contexto (arquétipo, hero, grid, ritmo, tratamento de imagem, movimento, tipografia, CTA). Siga-o e refine com decisões próprias; ele existe para você NÃO repetir o mesmo "site de blocos".
- PROIBIDO como padrão: navbar → hero centralizado → 3 cards → texto+imagem → 4 cards → galeria → depoimentos → CTA. Essa ordem só vale se fizer sentido para ESTE negócio.
- HERO é a peça-chave: nada de "título enorme centralizado + 2 botões + imagem abaixo". Use composição assimétrica, imagem dominante, sobreposição, tipografia em escalas diferentes ou CTA integrado à composição.
- Composição: use o grid com intenção (assimetria, colunas de larguras diferentes, elementos fora do eixo, títulos atravessando colunas, imagens maiores que o texto). NÃO centralize tudo nem transforme tudo em card.
- Ritmo: alterne impacto, respiro, informação e chamada comercial. NÃO use o mesmo espaçamento entre todas as seções.
- Hierarquia: cada viewport deve deixar claro onde está, o que a empresa faz, por que confiar e qual ação tomar — com contraste real de escala/peso, não tudo com o mesmo peso.
- Conversão: CTAs com a linguagem do negócio (Solicitar orçamento, Agendar avaliação, Falar no WhatsApp, Ver imóveis...). Nunca repetir "Saiba mais" em tudo; o CTA principal tem destaque.
- Movimento: sutil (entrada, hover, transições). Não faça demonstração de efeitos.
- Clichês proibidos: gradientes sem motivo, glassmorphism gratuito, blobs/círculos aleatórios, ícones genéricos em excesso, emojis como design, sombras/bordas exageradas, dashboard, textos corporativos vazios.
- AUTOCRÍTICA antes de finalizar (se falhar, reestruture — não finalize): sem nome/logo ainda parece deste segmento? poderia ser confundido com outro site do sistema? o hero tem personalidade? as imagens participam da composição? há hierarquia e ritmo? há excesso de cards/seções iguais?
- Registre a direção como comentário em src/App.tsx começando com "${ART_DIRECTION_MARKER}" (arquétipo, paleta HEX, fontes, hero, grid) e implemente de verdade.

PADRÃO DE ENTREGA — SITE COMERCIAL PREMIUM (OBRIGATÓRIO):
- Isto NÃO é um protótipo nem uma landing de uma única seção. O resultado será MOSTRADO a um cliente — precisa parecer feito por um designer/desenvolvedor profissional.
- Estrutura esperada (adapte ao segmento, não precisa usar todas): Header/Nav; Hero de alto impacto; Apresentação da empresa; Serviços/Produtos; Diferenciais; Galeria (quando houver imagens); Processo/Atendimento; Depoimentos SOMENTE se houver conteúdo real; FAQ quando fizer sentido; LOCALIZAÇÃO com Google Maps (OBRIGATÓRIO); Contato; CTA (WhatsApp/telefone quando disponíveis); Footer completo.
- Na PRIMEIRA geração de um projeto novo, entregue a estrutura completa acima — não finalize com uma só seção.
- Qualidade visual: hierarquia clara, espaçamento consistente, tipografia profissional, contraste, CTAs evidentes e acabamento. Microinterações sutis quando fizer sentido.
- ANTI-"AI clichê": evite fundo azul-escuro padrão, gradientes genéricos, cards todos iguais, ícones aleatórios, vazios enormes e o MESMO layout para todo cliente. A identidade visual deve combinar com o segmento.
- Responsivo de verdade (teste mental em ~390px e ~1366px): sem overflow horizontal, texto legível e botões clicáveis.

IMAGENS (NUNCA INVENTE URL):
- Use EXATAMENTE as URLs de foto real fornecidas no contexto. Nunca invente, adivinhe ou "monte" URLs de imagem.
- Imagens ilustrativas (stock) são apoio visual: NÃO afirme que são do cliente.
- Sem nenhuma imagem disponível: NÃO use <img> quebrada nem ícones no lugar de foto — componha com cor, tipografia e superfícies (blocos sólidos, gradiente sutil, formas).
- Todo <img> DEVE ter referrerPolicy="no-referrer", alt descritivo e loading="lazy" abaixo da primeira dobra. Isso evita o bloqueio de hotlink que deixa a foto quebrada.
- Todo <img> DEVE ter onError que ESCONDE a imagem (ex.: e.currentTarget.style.display = "none") ou troca por um bloco de cor. NUNCA deixe o ícone de imagem quebrada/quadrado vazio aparecer.
- Não referencie imagens locais por caminho relativo; use as URLs http(s) do contexto.

AMBIENTE TÉCNICO (o PREVIEW e o BUILD precisam funcionar SEM novo npm install):
- NÃO adicione dependências nem importe pacotes externos (ex.: lucide-react, react-icons, framer-motion, @mui, next/*, styled-components). O projeto tem SOMENTE React, ReactDOM e Tailwind — não altere package.json para adicionar bibliotecas.
- ÍCONES: desenhe SVG inline no próprio componente (nunca biblioteca de ícones).
- Fontes: use a pilha de fontes do sistema; se quiser Google Fonts, coloque um <link> no index.html (nunca via import de pacote).
- Imports: use caminhos RELATIVOS entre seus componentes (ex.: "./components/Header"). O alias "@/..." não está garantido no runtime.
- Se um import não resolver, o preview fica em branco: prefira poucos arquivos e caminhos simples e verifique com run_command (build) antes de finalizar.

LOCALIZAÇÃO + GOOGLE MAPS (OBRIGATÓRIO):
- Inclua seção de localização com o endereço real do contexto, um <iframe> responsivo do Google Maps e um botão "Abrir rota".
- Use a URL de mapa EXATA fornecida no contexto (sem api key). Se o contexto não trouxer URL de mapa, NÃO invente endereço nem mapa.
- O <iframe> do mapa DEVE ter loading="lazy", referrerPolicy="no-referrer" e title. SEMPRE inclua também um link/botão "Abrir no Google Maps" (rota) visível — assim a localização funciona mesmo se o iframe for bloqueado.
- NUNCA coloque chave/secret de API no código.

FATOS (NÃO INVENTAR):
- Não invente depoimentos, prêmios, números, certificações, anos de mercado, clientes famosos, preços, avaliações nem fotos que não pertençam ao cliente.
- Copy comercial genérica é permitida; afirmação factual específica inventada NÃO é.

SINAIS DE CONTROLE (OBRIGATÓRIO — última linha da resposta, um objeto JSON sozinho):
- Tarefa simples que você concluiu: {"signal":"TERMINATE"}
- Tarefa complexa/multi-etapa que precisa de plano (NÃO comece a editar): {"signal":"DELEGATE_TO_PLANNER","reason":"<motivo>"}
- Você concluiu UM passo de um plano recebido: {"signal":"SUBTASK_DONE","summary":"<o que fez>"}

ESCALA:
- Pedido simples (1 arquivo/poucas linhas) → execute e TERMINATE.
- Construção inicial / refatoração grande / vários arquivos interdependentes → DELEGATE_TO_PLANNER antes de editar.
- Quando estiver executando um PLANO do Planner, conclua o "Next task" e responda SUBTASK_DONE.

ANEXOS/MULTIMODAL:
- Quando houver IMAGENS anexadas, elas estão no seu contexto visual — analise-as de verdade.
- Arquivos PDF/binários aparecem apenas como CAMINHO; se não puder interpretá-los, diga que não conseguiu — NUNCA invente o conteúdo de uma imagem/PDF que você não recebeu.
- A memória do projeto é contexto auxiliar: em conflito com o código real, o CÓDIGO prevalece.`;

function historyToMessages(history: StudioStateMessage[]): ModelMessage[] {
  return history.map((m) => ({ role: m.role === "planner" ? "assistant" : (m.role as ModelMessage["role"]), content: m.content }));
}

export async function runStudioTeam(input: StudioTeamInput): Promise<StudioTeamResult> {
  const model = input.model ?? callModelWithTools;
  const planner = input.planner ?? runPlanner;
  const maxRounds = input.maxRounds ?? 12;
  const maxPlans = input.maxPlans ?? 3;

  const state = loadProjectState(input.workspaceRoot, input.projectId);
  const isFirst = state.history.length === 0;
  const files = input.readWorkspace();
  const fileTree = Object.keys(files);
  const { list: tools } = buildCoderTools({ workspaceRoot: input.workspaceRoot, business: input.business, projectId: input.projectId, mode: "edit" });

  // C6 — memória do projeto (contexto auxiliar; código prevalece) + anexos.
  let projectMemory = loadMemory(input.workspaceRoot, input.projectId);
  const memoryBlock = memoryContextBlock(projectMemory);
  const attachBlock = input.attachBlock ?? "";
  const images = (input.attachments ?? [])
    .filter((a) => /^image\//i.test(a.mediaType) && typeof a.dataUrl === "string" && a.dataUrl.startsWith("data:"))
    .map((a) => ({ mime: a.mediaType, dataUrl: a.dataUrl }));

  const mediaBlock = mediaContextBlock(input.business);
  // Direção de arte DETERMINÍSTICA por negócio (mesmo projeto → estável; projetos
  // diferentes → direções diferentes). Impede o "site de blocos" repetido.
  const direction = buildDesignDirection(input.business, input.projectId);
  const directionBlock = `\n\n${direction.block}`;
  const userContent = isFirst
    ? `${buildFirstMessage({ instruction: input.instruction, files, business: input.business })}${attachBlock}${memoryBlock}${mediaBlock}${directionBlock}`
    : [
        input.memory?.length ? `Memória do projeto:\n${input.memory.slice(0, 10).map((m) => `- ${m}`).join("\n")}` : null,
        input.conversation?.length ? `Conversa recente:\n${input.conversation.slice(-6).map((c) => `- ${c}`).join("\n")}` : null,
        attachBlock,
        memoryBlock,
        mediaBlock,
        directionBlock,
        `Pedido do usuário: ${input.instruction}`,
      ].filter((x): x is string => !!x).join("\n\n");

  let messages: ModelMessage[] = [
    ...historyToMessages(state.history),
    { role: "user", content: userContent, images: images.length ? images : undefined },
  ];
  const newHistory: StudioStateMessage[] = [{ role: "user", content: input.instruction, at: new Date().toISOString() }];

  let lastSpeaker: LastSpeaker = null;
  let lastSignal: AgentSignal | null = null;
  let plansUsed = 0;
  let plan: string | undefined = state.plan;
  let reply = "";
  let touched: string[] = [];
  let iterations = 0;
  let error: string | undefined;
  let bootstrapNudges = 0;
  let sweepNudges = 0;
  let colorNudges = 0;
  // EDIÇÃO GLOBAL de cor: guarda a PALETA ANTERIOR para provar (no fim) se a
  // identidade antiga continuou no código (evidência, não achismo).
  const globalVisualEdit = !isFirst && isGlobalVisualEdit(input.instruction ?? "");
  const paletteTarget = globalVisualEdit ? namedColorTarget(input.instruction ?? "") : null;
  const paletteBefore = globalVisualEdit ? colorTokens(input.readWorkspace()) : new Set<string>();

  input.emit({ type: "agent_interaction", agent_name: "Selector", message_type: "thought", content: isFirst ? "Primeira mensagem do projeto — Coder inicia." : "Retomando o projeto — Coder inicia.", timestamp: Date.now() });

  for (let round = 0; round < maxRounds; round += 1) {
    if (input.signal?.aborted) break;
    const speaker = selectNext({ lastSpeaker, lastSignal, round, maxRounds, plansUsed, maxPlans });
    if (speaker === "end") break;
    iterations += 1;

    if (speaker === "Planner") {
      plansUsed += 1;
      input.emit({ type: "agent_interaction", agent_name: "Selector", message_type: "thought", content: "Coder pediu planejamento → Planner.", timestamp: Date.now() });
      const planned = await planner({
        instruction: input.instruction,
        fileTree: Object.keys(input.readWorkspace()),
        priorPlan: plan,
        coderFeedback: reply,
        business: input.business,
        memory: input.memory,
        ai: input.ai,
        emit: input.emit,
      });
      if (!planned.ok) {
        // Sem plano → devolve o turno ao Coder para continuar direto.
        messages = [...messages, { role: "assistant", content: "(Planner indisponível; continue sem plano.)" }];
        lastSpeaker = "Planner";
        lastSignal = null;
        continue;
      }
      plan = planned.plan;
      messages = [...messages, { role: "assistant", content: planned.plan }];
      newHistory.push({ role: "planner", content: planned.plan, at: new Date().toISOString() });
      lastSpeaker = "Planner";
      lastSignal = null;
      continue;
    }

    const coder = await runCoderTurn({
      model,
      // As skills de design são CONHECIMENTO INSTALADO: o agente consulta a
      // ferramenta `design_skills` quando precisa (sem custo de prompt).
      system: CODER_SYSTEM,
      messages,
      tools,
      ai: input.ai,
      emit: input.emit,
      onFilesChanged: input.onFilesChanged,
      instruction: input.instruction,
      signal: input.signal,
    });
    if (coder.text) reply = coder.text;
    touched = [...new Set([...touched, ...coder.touched])];
    messages = [...messages, ...coder.produced];
    const assistantText = coder.text || "(executando…)";
    newHistory.push({ role: "assistant", content: assistantText, at: new Date().toISOString() });
    lastSpeaker = "Coder";
    lastSignal = coder.signal;

    if (coder.error) { error = coder.error; break; }

    // ANTI-TEMPLATE + DIREÇÃO DE ARTE: na 1ª geração o rascunho `prospector-bootstrap`
    // NÃO pode ser a entrega final e a direção de arte precisa estar registrada no
    // código. Quando o Coder acha que terminou e ainda falta isso, forçamos a
    // criação real (bounded, sem loop infinito).
    const finishing = !coder.signal || coder.signal.type === "TERMINATE";
    const filesNow = input.readWorkspace();
    const stillBootstrap = isBootstrapProject(filesNow);
    const missingDirection = !stillBootstrap && !hasArtDirection(filesNow);
    if (isFirst && finishing && (stillBootstrap || missingDirection) && bootstrapNudges < 2 && round < maxRounds - 1) {
      bootstrapNudges += 1;
      const reason = stillBootstrap
        ? "O rascunho inicial ainda está no projeto — vou criar o site real, específico deste negócio, agora."
        : "Falta registrar e aplicar a DIREÇÃO DE ARTE deste negócio — vou definir e implementar agora.";
      input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: reason, timestamp: Date.now() });
      const ask = stillBootstrap
        ? "O projeto AINDA contém o rascunho `prospector-bootstrap` — você NÃO entregou o site real. Substitua AGORA src/App.tsx e src/index.css por uma implementação PRÓPRIA e específica deste negócio (direção visual, seções, imagens reais e mapa), sem manter o rascunho. Use write_file."
        : `Falta a DIREÇÃO DE ARTE. Antes de finalizar: (1) defina arquétipo, paleta HEX, fontes, composição de hero, grid e ritmo específicos deste negócio; (2) registre como comentário em src/App.tsx começando com "${ART_DIRECTION_MARKER}"; (3) garanta que a composição implementada reflete essa direção (hero com personalidade, imagens participando, grid com intenção, ritmo variado — nada de "site de blocos"). Faça a AUTOCRÍTICA e reestruture se estiver genérico. Use write_file.`;
      messages = [...messages, { role: "user", content: ask }];
      lastSpeaker = "Coder";
      lastSignal = null;
      continue;
    }

    // EDIÇÃO GLOBAL: se o pedido é uma mudança de identidade visual e o Coder NÃO
    // varreu o projeto (nem buscou, nem tocou vários arquivos/tokens), cobramos a
    // aplicação completa — evita deixar metade do site com a identidade antiga.
    const globalEdit = globalVisualEdit;
    if (
      globalEdit && finishing && !coder.error && sweepNudges < 1 && round < maxRounds - 1
      && !wasProjectSwept({ touched: [...touched], toolNames: coder.toolUses.map((u) => u.name) })
    ) {
      sweepNudges += 1;
      input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: "Vou revisar TODAS as ocorrências da identidade visual para aplicar o pedido no site inteiro.", timestamp: Date.now() });
      messages = [...messages, { role: "user", content: EDIT_SWEEP_NUDGE }];
      lastSpeaker = "Coder";
      lastSignal = null;
      continue;
    }

    // COR PEDIDA NÃO APLICADA: o usuário nomeou uma cor e o código AINDA usa a
    // paleta anterior → cobramos com a evidência exata (bounded, 1 vez).
    if (globalEdit && paletteTarget && finishing && !coder.error && colorNudges < 1 && round < maxRounds - 1) {
      const after = colorTokens(input.readWorkspace());
      if (!targetApplied(after, paletteTarget) && paletteStillOld(paletteBefore, after)) {
        colorNudges += 1;
        const kept = [...paletteBefore].filter((t) => after.has(t));
        input.emit({ type: "agent_interaction", agent_name: "Coder", message_type: "thought", content: "A cor pedida ainda não está aplicada em todo o site — vou corrigir as sobras da identidade antiga.", timestamp: Date.now() });
        messages = [...messages, { role: "user", content: colorNotAppliedNudge(kept) }];
        lastSpeaker = "Coder";
        lastSignal = null;
        continue;
      }
    }

    if (!coder.signal) break; // sem sinal e sem ferramentas → considera final
  }

  saveProjectState(input.workspaceRoot, {
    version: 1,
    projectId: input.projectId,
    history: [...state.history, ...newHistory],
    plan,
    iterations: state.iterations + iterations,
    updatedAt: new Date().toISOString(),
  });

  // C6: registra preferências/instruções explícitas do usuário (determinístico).
  for (const update of extractMemoryUpdates(input.instruction)) {
    projectMemory = recordMemory(projectMemory, update.kind, update.text);
  }
  saveMemory(input.workspaceRoot, projectMemory);

  if (!reply) reply = "Concluí a solicitação.";
  // Honestidade: se o rascunho ainda está lá, NÃO declarar identidade final.
  if (isFirst && !error && isBootstrapProject(input.readWorkspace())) {
    reply = `${reply}\n\n⚠ O site ainda contém o rascunho inicial (bootstrap) — pode não refletir o design final do negócio.`;
  }
  return { ok: !error, reply, signal: lastSignal, iterations, touched, plan, error };
}
