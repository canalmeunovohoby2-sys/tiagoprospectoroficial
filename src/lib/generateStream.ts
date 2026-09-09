// Leitor da resposta do /generate do Agent Runtime.
// O runtime NOVO transmite NDJSON (start/ping/result). Mas há respostas que chegam
// como JSON simples 200 (ex.: o ramo de geração BLOQUEADA, que usa send(200, {...})
// sem quebra de linha; ou um runtime ainda na versão antiga que responde send(200,
// JSON) ao fim da geração seguindo o contrato pré-streaming).
// Este leitor aceita AMBOS e devolve o payload do evento `result` (NDJSON) ou o
// próprio objeto JSON (resposta simples), para nunca mascarar o erro real como
// "Editor completo indisponível (HTTP 200)".

export type GenerateHttpResult = Record<string, unknown> | null;

export async function parseGenerateResponse(res: Response): Promise<GenerateHttpResult> {
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  const all = buffer.trim();
  if (!all) return null;

  // 1) NDJSON: procura um evento `result` entre as linhas.
  let event: Record<string, unknown> | null = null;
  for (const raw of all.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let ev: Record<string, unknown> | null = null;
    try { ev = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (ev && ev.type === "result") { event = ev; break; }
  }
  if (event) return event;

  // 2) JSON simples (resposta 200 sem newline): bloqueada/antiga. Sobrescreve o
  //    erro mascarado pelo payload real.
  try {
    const obj = JSON.parse(all) as Record<string, unknown>;
    if (obj && typeof obj === "object") return obj;
  } catch { /* não é JSON único */ }

  return null;
}
