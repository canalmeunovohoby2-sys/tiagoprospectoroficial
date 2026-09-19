import { describe, it, expect } from "vitest";
import { saveConversation } from "../src/server";

// FASE 1 — requisito F: a conversa do caminho React passa a ser persistida na
// MESMA infraestrutura do legado (`conversation-save` → agent_conversation_memory,
// isolada por project_id + conversation_id). Ao recarregar, o `runtime-ai-config`
// devolve esse transcript como `initialMessages` — continuidade real.

describe("FASE 1 · persistência da conversa (reload)", () => {
  it("envia o transcript para conversation-save com projeto+conversa corretos", async () => {
    const calls: Array<{ url: string; auth?: string; body: Record<string, unknown> }> = [];
    const origFetch = globalThis.fetch;
    const origUrl = process.env.SUPABASE_FUNCTIONS_URL;
    process.env.SUPABASE_FUNCTIONS_URL = "https://example.test/functions/v1";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), auth: String(init?.headers?.Authorization ?? ""), body: JSON.parse(String(init?.body ?? "{}")) });
      return { ok: true, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;

    try {
      await saveConversation(
        "user-1", "proj-A", "conv-1",
        [
          { role: "user", content: "Quero um site elegante para minha empresa." },
          { role: "assistant", content: "Vou criar uma direção elegante." },
        ],
        ["index.html"],
        "deepseek-chat", "deepseek",
        { method: "jwt", token: "JWT-TESTE" } as never,
      );
    } finally {
      globalThis.fetch = origFetch;
      if (origUrl === undefined) delete process.env.SUPABASE_FUNCTIONS_URL;
      else process.env.SUPABASE_FUNCTIONS_URL = origUrl;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/conversation-save");
    expect(calls[0].auth).toBe("Bearer JWT-TESTE");
    expect(calls[0].body.project_id).toBe("proj-A");
    expect(calls[0].body.conversation_id).toBe("conv-1");
    expect(JSON.stringify(calls[0].body.messages)).toContain("Quero um site elegante");
    expect(calls[0].body.files_changed).toEqual(["index.html"]);
  });

  it("projeto isolado: o mesmo usuário grava conversas em projetos diferentes sem misturar", async () => {
    const seen: Array<{ project_id?: string; conversation_id?: string }> = [];
    const origFetch = globalThis.fetch;
    const origUrl = process.env.SUPABASE_FUNCTIONS_URL;
    process.env.SUPABASE_FUNCTIONS_URL = "https://example.test/functions/v1";
    globalThis.fetch = (async (_url: unknown, init: { body?: string }) => {
      seen.push(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, json: async () => ({}) } as never;
    }) as unknown as typeof fetch;
    try {
      await saveConversation("user-1", "proj-A", "conv-1", [{ role: "user", content: "A" }], [], undefined, undefined, { method: "jwt", token: "T" } as never);
      await saveConversation("user-1", "proj-B", "conv-1", [{ role: "user", content: "B" }], [], undefined, undefined, { method: "jwt", token: "T" } as never);
    } finally {
      globalThis.fetch = origFetch;
      if (origUrl === undefined) delete process.env.SUPABASE_FUNCTIONS_URL;
      else process.env.SUPABASE_FUNCTIONS_URL = origUrl;
    }
    expect(seen.map((s) => s.project_id)).toEqual(["proj-A", "proj-B"]);
    expect(seen[0].conversation_id).toBe(seen[1].conversation_id);
  });
});
