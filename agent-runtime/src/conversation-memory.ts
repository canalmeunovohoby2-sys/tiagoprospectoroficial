// Histórico de conversa (initialMessages) → formato do SDK.
//
// O banco guarda o histórico em formatos mistos (texto puro e/ou blocos, ex.:
// quando houve anexo/imagem). O SDK do agente chama `content.map(...)` quando o
// content é array — e quebra com `content.map is not a function` quando recebe
// string no meio. Aqui normalizamos para **SEMPRE string**, sem blocos e sem
// imagens antigas: a execução nunca morre por causa do histórico.
//
// Causa real observada em produção local: a edição com logo anexada morria em
// ~2,7s com esse erro e o preview piscava em loop (a run nunca concluía).
export function normalizeInitialMessages(
  messages: unknown[],
): Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> {
  const out: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const msg = m as Record<string, unknown>;
    const role = String(msg.role ?? "").trim();
    if (role !== "user" && role !== "assistant") continue;
    const raw = msg.content;
    let text = "";
    if (typeof raw === "string") {
      text = raw;
    } else if (Array.isArray(raw)) {
      text = raw
        .map((b) =>
          b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string"
            ? String((b as { text: string }).text)
            : "",
        )
        .filter(Boolean)
        .join("\n");
    } else if (raw && typeof raw === "object") {
      text = String((raw as { text?: unknown }).text ?? "");
    }
    text = text.trim();
    if (!text) continue;
    // O SDK do agente percorre `content` com `.map(...)`: o histórico PRECISA ser
    // um ARRAY de blocos de texto (era string e quebrava com "content.map is not
    // a function", matando a edição em ~2,7s e fazendo o preview piscar em loop).
    out.push({ role: role as "user" | "assistant", content: [{ type: "text", text }] });
  }
  return out.slice(-20);
}
