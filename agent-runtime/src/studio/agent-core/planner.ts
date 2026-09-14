// Planner (C1): estratégia/decomposição, SEM ferramentas. Não edita arquivos,
// não executa comandos e não acessa o workspace — só produz orientação ao Coder.

import { callStudioModel } from "../model-call.js";
import type { BusinessContext } from "../../tools.js";

export interface RunPlannerInput {
  instruction: string;
  fileTree: string[];
  coderFeedback?: string;
  priorPlan?: string;
  business?: BusinessContext;
  memory?: string[];
  ai: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  emit: (event: Record<string, unknown>) => void;
}

export interface RunPlannerResult {
  ok: boolean;
  plan: string;
  error?: string;
}

const PLANNER_SYSTEM = `Você é o Planner de um time de agentes que edita um projeto React + Vite + TypeScript + Tailwind.
Você NÃO tem ferramentas: não edita arquivos, não roda comandos e não acessa o workspace. Apenas planeja.

REGRAS:
- Decomponha o pedido em um plano curto (5-10 passos), acionável pelo executor (Coder).
- Descreva O QUE fazer, não COMO (sem código/arquivos completos).
- Para construção inicial, o passo 1 deve agrupar a criação dos arquivos-base (evita muitos turnos).
- Inclua um passo de verificação (imports/arquivos existentes, build) após mudanças grandes.
- Não invente dados do negócio.
- Se o Coder relatou erro/estratégia que não está funcionando, MUDE a abordagem.

FORMATO OBRIGATÓRIO:
PLAN: <objetivo>
1. [ ] <passo>
2. [x] <passo concluído>
Next task: <qual passo o Coder executa agora>`;

export async function runPlanner(input: RunPlannerInput): Promise<RunPlannerResult> {
  const b = input.business ?? {};
  const facts = [b.name ? `Empresa: ${b.name}` : null, b.segment ? `Segmento: ${b.segment}` : null].filter(Boolean).join(" · ");
  const parts = [
    `PEDIDO DO USUÁRIO:\n${input.instruction}`,
    facts ? `\nCONTEXTO: ${facts}` : null,
    `\nARQUIVOS DO PROJETO:\n${input.fileTree.slice(0, 120).map((p) => `- ${p}`).join("\n")}`,
    input.priorPlan ? `\nPLANO ANTERIOR:\n${input.priorPlan.slice(0, 4_000)}` : null,
    input.coderFeedback ? `\nRESULTADO/FEEDBACK DO CODER:\n${input.coderFeedback.slice(0, 4_000)}` : null,
  ].filter((x): x is string => x !== null);

  input.emit({ type: "agent_interaction", agent_name: "Planner", message_type: "thought", content: "Analisando o pedido e montando o plano…", timestamp: Date.now() });
  const result = await callStudioModel({
    system: PLANNER_SYSTEM,
    user: parts.join("\n"),
    providerId: input.ai.providerId,
    modelId: input.ai.modelId,
    apiKey: input.ai.apiKey,
    baseUrl: input.ai.baseUrl,
    timeoutMs: 60_000,
    maxTokens: 1_000,
  });
  if (!result.ok || !result.text.trim()) {
    const error = result.error ?? "planner não retornou plano";
    input.emit({ type: "agent_interaction", agent_name: "Planner", message_type: "thought", content: `Não foi possível planejar (${error}).`, timestamp: Date.now() });
    return { ok: false, plan: "", error };
  }
  const plan = result.text.trim();
  input.emit({ type: "agent_interaction", agent_name: "Planner", message_type: "thought", content: plan, timestamp: Date.now() });
  input.emit({ type: "plan", agent_name: "Planner", plan, timestamp: Date.now() });
  return { ok: true, plan };
}
