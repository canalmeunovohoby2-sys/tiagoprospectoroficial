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
- Antes de decidir, leia os arquivos fornecidos no bloco CONTEÚDO ATUAL.`;

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
}): string {
  const errBlock = input.buildErrors.length
    ? `\nERROS DA VALIDAÇÃO ANTERIOR (corrija NA PRÓXIMA rodada de operações):\n- ${input.buildErrors.join("\n- ")}\n`
    : "";
  return `CONTEXTO DA EMPRESA (dados reais — não invente):
${input.contextLines || "(sem contexto adicional)"}
${input.memoryBlock ? `MEMÓRIA DE DECISÕES (preserve):\n${input.memoryBlock}\n` : ""}
INSTRUÇÃO DO USUÁRIO:
"${input.instruction}"
${errBlock}
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
    const max = name.endsWith("site.json") ? 12000 : name.endsWith(".css") ? 14000 : name.endsWith("index.html") ? 50000 : 14000;
    excerpts.push(`\n##### FILE: ${name} (${content.length} chars) #####\n${content.slice(0, max)}${content.length > max ? "\n…(truncado)" : ""}`);
  }
  void company;
  return excerpts.join("\n");
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

    let current = files;
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
      if (buildResult.verdict === "ok") break; // build passou
      // build com erro → próxima iteração corrige
    }

    const finalBuild = buildResult.verdict === "ok"
      ? buildResult
      : await runtime.build(current);

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
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro inesperado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
