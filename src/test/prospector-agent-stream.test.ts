import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (name: string) => {
        if (name === "ai-config") return { data: { providers: [] }, error: null };
        if (name === "runtime-config") return { data: { runtimeUrl: "http://runtime.test" }, error: null };
        return { data: null, error: null };
      }),
    },
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
  },
}));

vi.mock("@/lib/agentTicket", () => ({ getAgentTicket: async () => "ticket" }));

import { invokeProspectorAgent } from "@/lib/siteProjectsApi";

function ndjsonResponse(lines: unknown[]): Response {
  const text = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

const input = {
  instruction: "crie o site",
  files: { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x" },
  projectId: "p1",
  context: { name: "Jeane" },
};

describe("invokeProspectorAgent — entrega não se perde quando falta o evento result", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom antigo não expõe AbortSignal.timeout (usado no transport).
    if (typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== "function") {
      (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () => new AbortController().signal;
    }
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("usa o `complete` como resultado final quando o `result` não chega", async () => {
    const generated = { "src/App.tsx": "GERADO", "src/components/Header.tsx": "H" };
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([
      { type: "start", runtime: "studio-team" },
      { type: "files_ready", files: generated },
      { type: "complete", status: "ok", reply: "pronto", changed: true, touched: ["src/App.tsx"], files: generated },
    ])));

    const res = await invokeProspectorAgent(input, undefined, { projectKind: "react", onStudioEvent: () => {} });
    expect(res.status).toBe("ok");
    expect(res.files?.["src/App.tsx"]).toBe("GERADO");
  });

  it("usa o último `files_ready` quando nem result nem complete chegam", async () => {
    const generated = { "src/App.tsx": "REAL" };
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse([
      { type: "start", runtime: "studio-team" },
      { type: "files_ready", files: generated },
    ])));

    const res = await invokeProspectorAgent(input, undefined, { projectKind: "react", onStudioEvent: () => {} });
    expect(res.status).toBe("ok");
    expect(res.files?.["src/App.tsx"]).toBe("REAL");
  });
});
