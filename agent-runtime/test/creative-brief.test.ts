import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCreativeBriefPrompt, CREATIVE_BRIEF_SYSTEM, generateCreativeBrief } from "../src/studio/agent-core/creative-brief";
import { runStudioTeam } from "../src/studio/team";
import { materializeWorkspace, readWorkspace } from "../src/workspace";
import type { ModelCaller } from "../src/studio/agent-core/model";

const BOOTSTRAP = {
  "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x",
  "src/App.tsx": "// prospector-bootstrap: rascunho\nexport default function App(){return <main>Rascunho</main>}",
};

let rootA = "";
let rootB = "";
beforeAll(() => {
  rootA = mkdtempSync(join(tmpdir(), "brief-xfit-"));
  rootB = mkdtempSync(join(tmpdir(), "brief-psi-"));
  materializeWorkspace(rootA, BOOTSTRAP);
  materializeWorkspace(rootB, BOOTSTRAP);
});
afterAll(() => { rmSync(rootA, { recursive: true, force: true }); rmSync(rootB, { recursive: true, force: true }); });

describe("briefing criativo · individual por projeto (decisão da IA)", () => {
  it("o prompt do briefing carrega os DADOS reais e trata a base determinística como secundária", () => {
    const p = buildCreativeBriefPrompt({
      business: { name: "Iron Box CrossFit", segment: "Academia", city: "Bauru", state: "SP", address: "Rua A, 10", latitude: -22.31, longitude: -49.06, photos: ["https://x/foto.jpg"] },
      baseDirectionBlock: "Arquétipo visual: technical",
    });
    expect(p).toContain("Iron Box CrossFit");
    expect(p).toContain("Academia");
    expect(p).toContain("Bauru/SP");
    expect(p).toContain("Rua A, 10");
    expect(p).toContain("Fotos REAIS disponíveis: 1");
    expect(p).toMatch(/BASE TÉCNICA DE VARIAÇÃO/);
    expect(p).toMatch(/NÃO é a direção final/i);
    // regras: não inventar e não usar sequência fixa de seções
    expect(CREATIVE_BRIEF_SYSTEM).toMatch(/NUNCA invente fatos/i);
    expect(CREATIVE_BRIEF_SYSTEM).toMatch(/N[ÃA]O use uma sequência obrigatória de seções/i);
    expect(CREATIVE_BRIEF_SYSTEM).toMatch(/N[ÃA]O repita o mesmo briefing entre clientes/i);
    expect(CREATIVE_BRIEF_SYSTEM).toMatch(/CONCEITO:|HERO:|PALETA:|SEÇÕES:/);
  });

  it("dois clientes DIFERENTES recebem briefings diferentes, e o Coder recebe ESSA direção", async () => {
    const coders: Record<string, string[]> = {};

    // "Modelo" que decide o briefing a partir dos DADOS (tools=[] → é a chamada de brief).
    function modelFor(tag: string): ModelCaller {
      return async (input) => {
        const userMsg = String(input.messages.map((m) => m.content ?? "").join("\n"));
        if (input.tools.length === 0) {
          // Briefing individual, específico do negócio que aparece nos dados.
          const isCross = /crossfit|academia/i.test(userMsg);
          return {
            ok: true,
            turn: {
              text: isCross
                ? "CONCEITO: energia bruta de box de treino\nPÚBLICO: 20-35, busca resultado\nPERCEPÇÃO: força e disciplina\nHERO: foto de treino em close, tipografia condensada\nPALETA: #0b0b0f, #ff3d00, #ffffff\nTIPOGRAFIA: condensada + sans\nSEÇÕES: modalidades, estrutura, planos, localização\nCTAs: Agendar aula experimental\nEVITAR: estética de SaaS"
                : "CONCEITO: escuta e acolhimento\nPÚBLICO: adultos ansiosos\nPERCEPÇÃO: calma e confiança\nHERO: editorial, muito espaço negativo, retrato natural\nPALETA: #f7f3ee, #6b7f6e, #2f2f2f\nTIPOGRAFIA: serifada suave + sans\nSEÇÕES: quem atende, como funciona, dúvidas, contato\nCTAs: Agendar uma conversa\nEVITAR: venda agressiva",
              toolCalls: [],
            },
          };
        }
        // Turno do Coder: registra o contexto recebido e escreve o site.
        (coders[tag] = coders[tag] ?? []).push(userMsg);
        if (coders[tag].length === 1) {
          return { ok: true, turn: { text: "vou criar", toolCalls: [{ id: "w1", name: "write_file", arguments: { path: "src/App.tsx", content: "// ART-DIRECTION: x\nexport default function App(){return <main>site</main>}" }, rawArguments: "{}" }] } };
        }
        return { ok: true, turn: { text: 'ok\n{"signal":"TERMINATE"}', toolCalls: [] } };
      };
    }

    await runStudioTeam({
      instruction: "crie o site", projectId: "x1", workspaceRoot: rootA, ai: { providerId: "test", apiKey: "test" },
      business: { name: "Iron Box CrossFit", segment: "Academia", city: "Bauru", state: "SP" },
      emit: vi.fn(), readWorkspace: () => readWorkspace(rootA), model: modelFor("cross"),
    });
    await runStudioTeam({
      instruction: "crie o site", projectId: "p1", workspaceRoot: rootB, ai: { providerId: "test", apiKey: "test" },
      business: { name: "Consultório Ana", segment: "Psicologia", city: "Bauru", state: "SP" },
      emit: vi.fn(), readWorkspace: () => readWorkspace(rootB), model: modelFor("psi"),
    });

    // O Coder recebeu o BRIEFING CRIATIVO (decisão da IA) em ambos os casos…
    expect(coders.cross[0]).toContain("BRIEFING CRIATIVO DESTE CLIENTE");
    expect(coders.psi[0]).toContain("BRIEFING CRIATIVO DESTE CLIENTE");
    // …e os briefings são DIFERENTES entre os projetos (não é o mesmo texto trocando nome).
    expect(coders.cross[0]).toContain("energia bruta de box");
    expect(coders.psi[0]).toContain("escuta e acolhimento");
    expect(coders.cross[0]).not.toContain("escuta e acolhimento");
    // A base determinística continua no contexto, porém SUBORDINADA.
    expect(coders.cross[0]).toContain("BASE TÉCNICA DE VARIAÇÃO");
  });

  it("falha na decisão criativa não quebra a geração (segue com base técnica + system)", async () => {
    const brief = await generateCreativeBrief({
      model: (async () => ({ ok: false, error: "offline", turn: { text: "", toolCalls: [] } })) as unknown as ModelCaller,
      ai: {}, business: { name: "X", segment: "Y" },
    });
    expect(brief).toBe("");
  });
});
