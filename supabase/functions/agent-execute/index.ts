// agent-execute (5.13) — executa o Web Design Agent DIRETAMENTE sobre os
// arquivos reais do Site Project (workspace), não apenas sobre a SiteSpec.
//
// Ciclo: IA lê arquivos → planeja → devolve operações de arquivo (write/edit
// multi-arquivo) → runtime aplica com segurança (agent-workspace) → validação
// (StaticProjectRuntime) → se falhar, devolve erros à IA para corrigir →
// até o limite do Orchestrator.
//
// A SiteSpec continua existindo como metadado (site.json nos arquivos), mas o
// agente TRABALHA no código. Segurança: apenas paths do workspace, sem
// execução arbitrária, sem expor secrets.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { generateText, AiError, extractJson, DEFAULT_DEEPSEEK_MODEL } from "../_shared/ai.ts";
import {
  normalizePath, isAllowedTextFile, listFiles, readFile, searchFiles,
  writeFile, editFile, deleteFile, renameFile, fromSnapshot,
  type WorkspaceMap,
} from "../_shared/agent-workspace.ts";
import { createExecutionRuntime, type ExecutionResult } from "../_shared/agent-execution.ts";
import { editRegressionIssues, hasImageReferenceChange, requestsImageSwap } from "../_shared/regression-guard.ts";

const MAX_FILE_OPS = 24;
const MAX_ITERATIONS = 3;

const AGENT_SYSTEM = `Você é um SENIOR FULLSTACK/WEB DESIGNER que trabalha como coding agent DENTRO de um projeto web real.
Você recebe: (1) os ARQUIVOS do projeto (workspace de um site estático Vite: index.html contém o HTML/marcação completo, src/site.css os estilos, src/main.js as interações, src/site.json os dados estruturados), (2) contexto da empresa (dados reais), (3) memória de decisões aprovadas e (4) a INSTRUÇÃO do usuário.

MODO DE TRABALHO (obrigatório):
1. INSPECIONE: liste/leia os arquivos antes de alterar qualquer coisa.
2. ENTENDA o estado atual e decida quais arquivos mudar (múltiplos se necessário).
3. PLANEJE mudanças coordenadas que atendam a instrução de verdade (não só trocar uma cor).
4. DEVOLVA operações de arquivo precisas e completas:
   - "write": conteúdo NOVO inteiro do arquivo (para criar/substituir).
   - "edit": trecho exato "find" (deve existir literalmente) → "replace".
   Prefira "edit" para mudanças pontuais e "write" para reescritas de seções.
5. REGRAS:
   - NUNCA invente dados factuais (telefone, endereço, avaliações, certificações, horários). Use só o que vier no contexto.
   - Preserve decisões aprovadas da memória.
   - Não adicione segredos/API keys em arquivo algum.
   - index.html precisa manter <!doctype html>, <title> e o nome real da empresa visível no conteúdo.
   - site.json deve continuar JSON válido.
   - main.js deve continuar com JS válido (chaves balanceadas).
   - Trabalhe até a instrução estar de fato atendida; não faça só uma alteração simbólica.
   - IMAGENS DO USUÁRIO ficam em assets/<arquivo> (o conteúdo é um data URL guardado no próprio arquivo). Para usá-las, referencie o CAMINHO: <img src="assets/x.png"> ou background url(...) — o preview do produto embute o asset sozinho. NÃO copie data URLs gigantes inline no HTML.
   - Repetir a MESMA foto do usuário em vários pontos (hero + cards + sobre) é ESPERADO e permitido quando o usuário pedir. A regra de imagens distintas vale para banco de imagens, não para anexos do cliente.

RESPOSTA (JSON obrigatório, sem markdown):
{
  "reply": "resumo curto em pt-BR do que você fez no projeto",
  "note": "resumo técnico interno das mudanças (paths tocados)",
  "operations": [
    { "type": "write", "path": "src/site.css", "content": "..." },
    { "type": "edit", "path": "index.html", "find": "trecho exato", "replace": "novo trecho" }
  ]
}

REGRAS DE ENTREGA:
- Se a instrução PEDIR uma mudança (adicionar/melhorar/trocar/criar), você DEVE devolver
  operações que materializem essa mudança. Responder apenas com análise e zero
  operations conta como entrega incompleta.
- Para mudanças pontuais dentro de um arquivo grande, use "edit" com um "find" curto e
  único o suficiente para existir literalmente no arquivo. Se preferir, use "write" para
  reescrever um arquivo INTEIRO (preservando o restante do conteúdo que você recebeu).
- Se o arquivo for muito grande, NÃO precisa reescrevê-lo inteiro: localize o trecho
  exato (ex.: fechamento de uma seção, a classe do hero) e use "edit". Você pode usar
  "edit" múltiplas vezes no mesmo arquivo em uma mesma resposta.
 - Antes de decidir, leia os arquivos fornecidos no bloco CONTEÚDO ATUAL.

COMUNICAÇÃO PROFISSIONAL (5.28):
- O "reply" é a mensagem ao usuário (pt-BR, tom humano de dev sênior — nunca robótico).
- Quando a tarefa tiver várias etapas, escreva a resposta estruturada conforme o trabalho (use os que fizerem sentido; tarefas pequenas: 1–2 frases):
  🔎 Análise · 📋 Diagnóstico · 🛠️ Execução · 📁 Arquivos (paths reais) · 🧪 Verificação (o que você REALMENTE validou) · ✅ Resultado/estado final.
- COMUNICAÇÃO ADAPTATIVA (5.36): tamanho e estrutura da resposta acompanham a tarefa — mudança simples = 2–4 linhas + arquivo; redesign complexo = resumo natural + mudanças + arquivos + verificação + resultado; diagnóstico/auditoria = seção de problemas com impacto + recomendações + prioridades (sem alterar arquivos); falha = explicar o que aconteceu e o que ficou pendente (nunca "concluída com sucesso"). Nunca abra com "A tarefa foi concluída com sucesso"; não repita relatório idêntico toda vez; nada de "Alterações salvas automaticamente" seco no fim.
- Auditoria/pedido de análise técnica: entregue estrutura com arquivos analisados, componentes/fluxos, o que existe, o que falta/está incorreto, problemas, impacto, alterações reais (ou "nenhuma, pois não foi pedido"), evidências e o que ainda precisa correção. NÃO altere arquivos se não foi pedido.
- Nunca invente arquivos/alterações/testes/resultados. Se algo falhou ou não foi verificado, diga explicitamente. Diferencie conversa de execução: conversa → responda sem alterar.

LIBERDADE CRIATIVA E INICIATIVA (5.26):
- Você é o cérebro criativo e decisor. Não espere instruções detalhando cada decisão de design.
- Na geração, defina paleta, tipografia, layout, composição, imagens e efeitos SOB MEDIDA para ESTE negócio. Cada site deve ter identidade e arquitetura próprias — nunca repita o mesmo layout/paleta/efeitos de outro projeto.
- Use o bloco PESQUISA WEB DE REFERÊNCIA (quando presente) para tendências e referências do nicho — inspire-se, NUNCA copie sites/layouts/textos.
- Google Maps (embed, só com endereço real), Google Fonts, ícones e imagens contextuais são permitidos quando fizerem sentido.`;

interface AgentOp {
  type: "write" | "edit" | "delete" | "rename";
  path?: string;
  from?: string;
  to?: string;
  find?: string;
  replace?: string;
  content?: string;
}

function applyOps(files: WorkspaceMap, ops: AgentOp[]): { ok: boolean; files: WorkspaceMap; errors: string[] } {
  let current = { ...files };
  const errors: string[] = [];
  const normalized: Array<{ from: string; to: string; op: string }> = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (normalized.some((n) => n.op === "rename" && n.to === op.path) && op.type !== "rename") {
      // op referenciando arquivo que será renomeado nesta mesma leva — rejeita
    }
    if (op.type === "rename") {
      const src = normalizePath(op.from ?? "");
      const dst = normalizePath(op.to ?? "");
      if (!src || !dst) { errors.push(`Op ${i}: rename com caminho inválido.`); continue; }
      normalized.push({ from: src, to: dst, op: "rename" });
      continue;
    }
    const p = normalizePath(op.path ?? "");
    if (!p) { errors.push(`Op ${i}: caminho inválido ("${op.path}").`); continue; }
    if (!isAllowedTextFile(p)) { errors.push(`Op ${i}: arquivo não permitido ("${p}").`); continue; }
    normalized.push({ from: p, to: p, op: op.type });
  }

  // Aplica renames primeiro (atualiza mapa base)
  for (const n of normalized) {
    if (n.op !== "rename") continue;
    const r = renameFile(current, n.from, n.to);
    if (!r.ok) { errors.push(r.error ?? "rename falhou"); continue; }
    current = r.files;
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === "rename") continue;
    const target = normalizePath(op.path ?? "") ?? "";
    if (op.type === "write") {
      const r = writeFile(current, target, op.content ?? "");
      if (!r.ok) errors.push(r.error ?? "write falhou");
      else current = r.files;
    } else if (op.type === "edit") {
      if (!op.find) { errors.push(`Op ${i}: edit sem "find".`); continue; }
      const r = editFile(current, target, { find: op.find, replace: op.replace ?? "" });
      if (!r.ok) errors.push(r.error ?? "edit falhou");
      else current = r.files;
    } else if (op.type === "delete") {
      const r = deleteFile(current, target);
      if (!r.ok) errors.push(r.error ?? "delete falhou");
      else current = r.files;
    }
  }
  return { ok: errors.length === 0, files: current, errors };
}

function buildAgentPrompt(input: {
  instruction: string;
  contextLines: string;
  memoryBlock: string;
  filesList: string;
  filesContent: string;
  buildErrors: string[];
  researchBlock?: string;
  conversationBlock?: string;
}): string {
  const errBlock = input.buildErrors.length
    ? `\nERROS DA VALIDAÇÃO ANTERIOR (corrija NA PRÓXIMA rodada de operações):\n- ${input.buildErrors.join("\n- ")}\n`
    : "";
  return `CONTEXTO DA EMPRESA (dados reais — não invente):
${input.contextLines || "(sem contexto adicional)"}
${input.memoryBlock ? `MEMÓRIA DE DECISÕES (preserve):\n${input.memoryBlock}\n` : ""}
${input.conversationBlock ? `${input.conversationBlock}\n` : ""}
INSTRUÇÃO DO USUÁRIO:
"${input.instruction}"
${errBlock}
${input.researchBlock ?? ""}
ARQUIVOS DO PROJETO:
${input.filesList}

CONTEÚDO ATUAL DOS ARQUIVOS-CHAVE:
${input.filesContent}
`;
}

function summarizeContent(files: WorkspaceMap, company: string): string {
  const names = listFiles(files);
  const excerpts: string[] = [];
  // Ordem de prioridade para expor conteúdo: site.json, index.html, site.css, main.js.
  const keySuffix = ["site.json", "index.html", "site.css", "main.js"];
  const ordered: string[] = [];
  for (const suffix of keySuffix) {
    const found = names.find((n) => n.endsWith(suffix));
    if (found) ordered.push(found);
  }
  for (const name of names) if (!ordered.includes(name)) ordered.push(name);
  for (const name of ordered.slice(0, 6)) {
    const content = files[name] ?? "";
    // Data URIs gigantes (fotos do usuário embutidas) consomem o orçamento do
    // resumo e escondem o restante do arquivo. Compacta antes de cortar: o
    // agente não precisa re-emitir o blob — deve referenciar assets/<arquivo>.
    const safe = compactDataUris(content);
    const max = name.endsWith("site.json") ? 12000 : name.endsWith(".css") ? 14000 : name.endsWith("index.html") ? 50000 : 14000;
    excerpts.push(`\n##### FILE: ${name} (${content.length} chars) #####\n${safe.slice(0, max)}${safe.length > max ? "\n…(truncado)" : ""}`);
  }
  void company;
  return excerpts.join("\n");
}

// Substitui data URIs longos por um marcador curto (mantém a estrutura legível).
function compactDataUris(content: string): string {
  return content.replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, (m) => `data:[${Math.round((m.length * 3) / 4)} bytes de imagem embutida]`);
}

// PESQUISA WEB (5.26) — referências/tendências do segmento antes da geração.
// Best-effort: usa as secrets TAVILY_API_KEY_01..08 (mesmo padrão do provider
// pool); sem chaves ou com falha, a geração segue sem pesquisa (honesto).
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

function edgeTavilyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const label = `TAVILY_API_KEY_${String(i).padStart(2, "0")}`;
    const k = Deno.env.get(label) ?? Deno.env.get(`TAVILY_API_KEY_${i}`);
    if (k && !keys.includes(k)) keys.push(k);
  }
  const single = Deno.env.get("TAVILY_API_KEY");
  if (single && !keys.includes(single)) keys.push(single);
  return keys;
}

async function edgeSearchOnce(query: string, key: string): Promise<Array<{ title: string; url: string; description: string }>> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: query.slice(0, 400), max_results: 5, search_depth: "basic" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status !== 200) return [];
  const data = (await res.json().catch(() => null)) as { results?: Array<{ title?: string; url?: string; content?: string }> } | null;
  if (!data || !Array.isArray(data.results)) return [];
  return data.results
    .filter((r) => typeof r?.url === "string")
    .slice(0, 5)
    .map((r) => ({
      title: String(r.title ?? "").slice(0, 160),
      url: String(r.url ?? "").slice(0, 300),
      description: String(r.content ?? "").slice(0, 400),
    }));
}

// Retorna um bloco enxuto de referências ou "" (nunca lança).
async function edgeResearchBlock(opts: { name?: string; segment?: string; city?: string }, meta?: { trace: Array<{ query: string; ok: boolean; resultsCount: number; source: string }> }): Promise<string> {
  const keys = edgeTavilyKeys();
  if (keys.length === 0) return "";
  const seg = opts.segment || "negócio local";
  const place = opts.city ? ` ${opts.city}` : "";
  const queries = [
    `melhores sites de ${seg}${place} referência visual`,
    `tendências de design para ${seg}${place}`,
  ];
  const lines: string[] = [];
  for (const q of queries) {
    let queryCount = 0;
    for (const key of keys) {
      try {
        const results = await edgeSearchOnce(q, key);
        if (!results.length) continue;
        queryCount = results.length;
        lines.push(`Queries: "${q}"`);
        for (const r of results.slice(0, 4)) {
          lines.push(`- ${r.title || r.url}`);
          if (r.description) lines.push(`  ${r.description.slice(0, 180)}`);
        }
        break;
      } catch { /* tenta próxima chave/query */ }
    }
    if (queryCount > 0 && meta) meta.trace.push({ query: q.slice(0, 160), ok: true, resultsCount: queryCount, source: "tavily" });
  }
  if (!lines.length) return "";
  const body = lines.join("\n");
  return `\nPESQUISA WEB DE REFERÊNCIA (5.26) — use para decidir a direção criativa (tendências, técnicas, o que líderes do nicho fazem). NÃO copie sites/layouts/textos; crie algo próprio e contextualizado:\n${body.length > 2200 ? body.slice(0, 2200) + "\n…(truncado)" : body}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) {
      return new Response(JSON.stringify({ error: "instruction é obrigatória" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Workspace atual: recebido como snapshot (mapa path->content) OU vazio.
    const files = fromSnapshot(body?.files ?? {});
    const context = (body?.context && typeof body?.context === "object" ? body.context : {}) as Record<string, unknown>;
    const memory = Array.isArray(body?.memory) ? (body.memory as unknown[]).filter((x): x is string => typeof x === "string").slice(-6) : [];
    const conversation = Array.isArray(body?.conversation) ? (body.conversation as unknown[]).filter((x): x is string => typeof x === "string").slice(-8) : [];
    const companyName = String(context.name ?? context.company_name ?? "").trim();
    const ctxLines = [
      context.name && `Empresa: ${context.name}`,
      context.segment && `Segmento: ${context.segment}`,
      context.city && `Cidade: ${context.city}`,
      context.state && `Estado: ${context.state}`,
      context.address && `Endereço: ${context.address}`,
      context.phone && `Telefone: ${context.phone}`,
      context.whatsapp && `WhatsApp: ${context.whatsapp}`,
    ].filter(Boolean).join("\n");

    const runtimeKind = typeof body?.runtime === "string" && body.runtime ? String(body.runtime) : "static";
    const runtime = createExecutionRuntime(runtimeKind, { companyName });

    const filesList = listFiles(files).map((p, i) => `  ${i + 1}. ${p} (${(files[p] ?? "").length} chars)`).join("\n");
    const filesContent = summarizeContent(files, companyName);
    const memoryBlock = memory.join("\n- ");

    // Geração (workspace sem index.html): pesquisa referências antes da missão.
    const isGenerate = Object.keys(files).length === 0 || !listFiles(files).some((p) => p.endsWith("index.html"));
    let researchBlock = "";
    const researchTrace: Array<{ query: string; ok: boolean; resultsCount: number; source: string }> = [];
    if (isGenerate) {
      try {
        researchBlock = await edgeResearchBlock({
          name: String(context.name ?? context.company_name ?? ""),
          segment: String(context.segment ?? ""),
          city: String(context.city ?? ""),
        }, { trace: researchTrace });
      } catch { researchBlock = ""; }
    }

    // Conversa recente (continuidade) — contexto, não nova instrução.
    const conversationBlock = conversation.length
      ? `CONVERSA RECENTE (contexto para continuidade — a INSTRUÇÃO acima é a mensagem atual; entenda referências a mensagens anteriores sem exigir repetição e não desfaça o que já foi feito):\n- ${conversation.join("\n- ").slice(0, 3000)}`
      : "";

    let current = files;
    const baseline = files; // estado ORIGINAL (para detecção de regressão)
    let lastOps: AgentOp[] = [];
    let lastReply = "";
    let usedModel = DEFAULT_DEEPSEEK_MODEL;
    let buildResult: ExecutionResult = { verdict: "error", errors: ["sem build ainda"] };
    let firstRound = true;

    // Palavras que indicam pedido de MUDANÇA (não apenas pergunta).
    const requestsChange = /adiciona|adicionar|inclui|incluir|cria|criar|coloca|muda|mudar|troca|trocar|deixa|deixar|faz|fazer|transforma|reconstruir|refina|melhora|melhorar|reescreve|substitui|remove|apaga|insere|edita|implementa/i.test(instruction);
    let emptyOpsNudge = false;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const prompt = buildAgentPrompt({
        instruction,
        contextLines: ctxLines,
        memoryBlock,
        filesList: listFiles(current).map((p, i) => `  ${i + 1}. ${p} (${(current[p] ?? "").length} chars)`).join("\n"),
        filesContent: summarizeContent(current, companyName),
        buildErrors: firstRound ? (emptyOpsNudge ? ["VOCÊ RESPONDEU QUE FEZ A MUDANÇA MAS DEVOLVEU ZERO OPERATIONS. ISSO É ENTREGA INCOMPLETA — devolva write/edit reais agora."] : []) : buildResult.errors,
        researchBlock,
        conversationBlock,
      });
      firstRound = false;

      const res = await generateText({ system: AGENT_SYSTEM, user: prompt, temperature: 0.4, json: true, maxOutputTokens: 16000 });
      usedModel = res.model;
      const parsed = extractJson(res.text) as { reply?: string; note?: string; operations?: AgentOp[] } | null;
      if (!parsed || typeof parsed !== "object") {
        buildResult = { verdict: "error", errors: ["Resposta do agente não é JSON válido."] };
        break;
      }
      lastReply = typeof parsed.reply === "string" ? parsed.reply.slice(0, 1000) : "";
      const ops = Array.isArray(parsed.operations) ? parsed.operations : [];
      if (ops.length === 0) {
        // Sem operações: se a instrução pede mudança, NÃO aceite "só expliquei".
        if (requestsChange && !emptyOpsNudge && iter < MAX_ITERATIONS - 1) {
          emptyOpsNudge = true;
          buildResult = { verdict: "error", errors: ["Agente respondeu sem aplicar operações — solicitar operações concretas."] };
          continue;
        }
        // Instrução sem mudança (pergunta/avaliação) ou limite: encerra.
        if (buildResult.errors.length === 0) {
          buildResult = { verdict: "ok", errors: [], logs: ["Agente não precisou alterar arquivos (apenas resposta)."] };
          lastOps = [];
          break;
        }
        buildResult = { verdict: "error", errors: ["Agente não devolveu operações para corrigir os erros apontados."] };
        break;
      }
      if (ops.length > MAX_FILE_OPS) {
        buildResult = { verdict: "error", errors: [`Agente devolveu ${ops.length} operações (máx ${MAX_FILE_OPS}).`] };
        break;
      }
      const applied = applyOps(current, ops);
      if (!applied.ok) {
        buildResult = { verdict: "error", errors: applied.errors.slice(0, 6) };
        lastOps = ops;
        continue; // devolve erro para a IA corrigir na próxima iteração
      }
      current = applied.files;
      lastOps = ops;
      buildResult = await runtime.build(current);
      if (buildResult.verdict !== "ok") continue; // build com erro → corrige
      if (isGenerate) break; // geração: regressão não se aplica (site do zero)
      // (5.30) REGRESSION GUARD: EDITAR ≠ RECONSTRUIR — impede que a edição
      // desmonte o site existente e devolve os problemas para o agente corrigir.
      const regressions = editRegressionIssues(baseline, current, instruction);
      if (regressions.length) {
        buildResult = { verdict: "error", errors: regressions.slice(0, 4), logs: ["regressão detectada — restaure/corrija antes de concluir"] };
        continue;
      }
      // (5.35) IMAGE SWAP GUARD: pedido de troca de imagem exige que uma URL de
      // imagem tenha realmente mudado no código.
      if (requestsImageSwap(instruction) && !hasImageReferenceChange(baseline, current)) {
        buildResult = {
          verdict: "error",
          errors: ["Você foi solicitado a trocar uma imagem, mas nenhuma URL de imagem mudou no código. Substitua de verdade a imagem do elemento solicitado e confirme no navegador."],
          logs: ["image swap sem evidência — corrija antes de concluir"],
        };
        continue;
      }
      break; // build passou e sem regressão
    }

    const finalBuild = buildResult.verdict === "ok"
      ? buildResult
      : await runtime.build(current);
    const regressions = isGenerate ? [] : editRegressionIssues(baseline, current, instruction);
    if (regressions.length) {
      // Restauração defensiva: devolve o ESTADO ORIGINAL (nada de edição
      // destrutiva) + explicação honesta; o front mostra o bloqueio.
      return new Response(
        JSON.stringify({
          status: "error",
          reply: lastReply,
          errors: regressions.slice(0, 4),
          logs: ["Edição descartada para preservar o site (regressão detectada)."],
          changed: false,
          touched: [],
          files: baseline,
          spec: null,
          model: usedModel,
          researchTrace,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Precisamos também devolver a "spec" derivada do site.json (compatibilidade),
    // se presente e JSON válido, para o front conseguir sincronizar dados.
    let derivedSpec: unknown = null;
    const dataPath = listFiles(current).find((p) => p.endsWith("site.json"));
    if (dataPath) {
      try {
        derivedSpec = JSON.parse(current[dataPath]);
      } catch { /* mantém null */ }
    }

    const touched = Object.keys(current).filter((p) => files[p] !== current[p]);
    return new Response(
      JSON.stringify({
        status: finalBuild.verdict === "ok" ? "ok" : "error",
        reply: lastReply,
        errors: finalBuild.errors,
        logs: finalBuild.logs ?? [],
        changed: touched.length > 0 || JSON.stringify(current) !== JSON.stringify(files),
        touched,
        files: current,
        spec: derivedSpec,
        model: usedModel,
        researchTrace,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
