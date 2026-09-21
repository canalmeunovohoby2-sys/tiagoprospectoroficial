import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildEditSystemPrompt, buildGenerateSystemPrompt, CONTACT_AND_PHOTOS_RULES } from "../src/agent-identity";

// As regras de composição (endereço = contato; foto = nicho + seção) valem TAMBÉM na
// edição: o caminho de edição usa buildEditSystemPrompt (prospector-site-agent.ts:16).
describe("regras de composição · geração E edição", () => {
  it("a regra existe em uma ÚNICA fonte", () => {
    const src = readFileSync(join(process.cwd(), "src/agent-identity.ts"), "utf8");
    const ocorrencias = (src.match(/ENDEREÇO É DADO DE CONTATO/g) ?? []).length;
    expect(ocorrencias).toBe(1);
    expect(CONTACT_AND_PHOTOS_RULES).toContain("ENDEREÇO É DADO DE CONTATO");
    expect(CONTACT_AND_PHOTOS_RULES).toContain("FOTOS COERENTES COM O NICHO");
  });

  it("chega ao prompt de EDIÇÃO", () => {
    const edit = buildEditSystemPrompt();
    expect(edit).toContain("ENDEREÇO É DADO DE CONTATO");
    expect(edit).toContain("FOTOS COERENTES COM O NICHO");
    expect(edit).toContain("Contato / Localização");
  });

  it("continua no prompt de GERAÇÃO", () => {
    const gen = buildGenerateSystemPrompt({ hasBase: true });
    expect(gen).toContain("ENDEREÇO É DADO DE CONTATO");
    expect(gen).toContain("FOTOS COERENTES COM O NICHO");
  });

  it("o guard de endereço roda na edição (completion-guard importa o gate)", () => {
    const guard = readFileSync(join(process.cwd(), "src/completion-guard.ts"), "utf8");
    expect(guard).toContain('from "./generation-gate.js"');
    const gate = readFileSync(join(process.cwd(), "src/generation-gate.ts"), "utf8");
    expect(gate).toContain("Endereço completo dentro do HERO");
  });
});
