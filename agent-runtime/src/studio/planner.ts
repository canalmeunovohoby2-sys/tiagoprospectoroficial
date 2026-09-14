// PLANNER do Site Studio.
//
// Responsável por ESTRATÉGIA/decomposição quando a tarefa exige múltiplas etapas.
// NÃO executa alterações e NÃO recebe ferramentas. Produz um plano estruturado
// que o Coder consome. Usa o provider/modelo validado do Prospector.
//
// Contexto: recebe apenas o necessário (dados do negócio, LISTA de caminhos —
// não o conteúdo dos arquivos —, decisões e alterações recentes). Enviar o
// projeto inteiro ao modelo é justamente o que a arquitetura evita.

import { callStudioModel } from "./model-call.js";
import type { BusinessContext } from "../tools.js";

export interface StudioPlannerInput {
  instruction: string;
  /** Apenas os CAMINHOS dos arquivos do projeto. */
  files: string[];
  business?: BusinessContext;
  memory?: string[];
  recentChanges?: string[];
  /** Feedback do Coder quando o plano precisa ser revisto (DELEGATE_TO_PLANNER). */
  feedback?: string;
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface StudioPlannerResult {
  ok: boolean;
  plan: string;
  error?: string;
  modelUsed?: string;
}

const PLANNER_SYSTEM = `Você é o Planner do Site Studio do TiagoProspector: um estrategista de edição de sites.
Sua função é DECOMPOR o pedido do usuário em um plano curto e acionável para um agente executor (Coder).

REGRAS:
- Você NÃO edita arquivos e NÃO chama ferramentas. Apenas planeja.
- Considere os arquivos reais listados (HTML/CSS/JS/JSON/assets) e os dados do negócio.
- Não invente fatos do negócio (telefone, endereço, serviços) — use só o que foi fornecido.
- Seja específico: diga QUAL arquivo tende a mudar e O QUE deve mudar.
- Preserve o que não foi pedido (não proponha reescrever o site inteiro por um ajuste pontual).
- Máximo de 6 passos; cada passo deve ser verificável.

FORMATO OBRIGATÓRIO da resposta:
PLAN:
1. [ ] <passo acionável>
2. [ ] <passo acionável>
Next task: <qual passo o Coder deve executar primeiro>`;

function filenameHint(files: string[]): string {
  const relevant = files
    .filter((f) => /\.(html|css|js|json|svg)$/i.test(f))
    .slice(0, 60);
  return relevant.length ? relevant.map((f) => `- ${f}`).join("\n") : "(nenhum arquivo legível)";
}

export async function runStudioPlanner(input: StudioPlannerInput): Promise<StudioPlannerResult> {
  const b = input.business ?? {};
  const facts = [
    b.name ? `Empresa: ${b.name}` : null,
    b.segment ? `Segmento: ${b.segment}` : null,
    b.city ? `Cidade: ${b.city}${b.state ? `/${b.state}` : ""}` : null,
  ].filter(Boolean).join("\n") || "(dados do negócio não informados)";

  const parts: string[] = [];
  parts.push(`PEDIDO DO USUÁRIO:\n${input.instruction}`);
  parts.push(`\nDADOS DO NEGÓCIO:\n${facts}`);
  parts.push(`\nARQUIVOS DO PROJETO:\n${filenameHint(input.files)}`);
  if (input.memory?.length) parts.push(`\nDECISÕES JÁ TOMADAS (preserve):\n${input.memory.slice(0, 12).map((m) => `- ${m}`).join("\n")}`);
  if (input.recentChanges?.length) parts.push(`\nALTERAÇÕES RECENTES:\n${input.recentChanges.slice(0, 8).map((c) => `- ${c}`).join("\n")}`);
  if (input.feedback) parts.push(`\nREVISÃO SOLICITADA PELO EXECUTOR:\n${input.feedback}`);

  const result = await callStudioModel({
    system: PLANNER_SYSTEM,
    user: parts.join("\n"),
    providerId: input.providerId,
    modelId: input.modelId,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    timeoutMs: 60_000,
    maxTokens: 900,
  });
  if (!result.ok || !result.text.trim()) {
    return { ok: false, plan: "", error: result.error ?? "planner não retornou plano.", modelUsed: result.modelUsed };
  }
  return { ok: true, plan: result.text.trim(), modelUsed: result.modelUsed };
}
