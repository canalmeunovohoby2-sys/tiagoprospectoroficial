import { describe, it, expect } from "vitest";
import { deriveCommitMessage } from "../src/studio/commit-message";

describe("C4 · mensagem de commit", () => {
  it("usa o resumo quando é significativo", () => {
    expect(deriveCommitMessage({ summary: "Update hero section", files: ["src/App.tsx"] })).toBe("Update hero section");
  });

  it("ignora resumos genéricos e usa a instrução", () => {
    expect(deriveCommitMessage({ summary: "update", instruction: "Troque o título do hero", files: ["src/App.tsx"] })).toBe("Troque o título do hero");
    expect(deriveCommitMessage({ summary: "Alterações no projeto", instruction: "Adicione seção de serviços", files: [] })).toBe("Adicione seção de serviços");
  });

  it("deriva dos arquivos quando não há resumo/instrução útil", () => {
    expect(deriveCommitMessage({ files: ["src/App.tsx"] })).toBe("Update App");
    expect(deriveCommitMessage({ files: ["src/components/HeroSection.tsx"] })).toBe("Update Hero Section");
    expect(deriveCommitMessage({ files: ["src/index.css"] })).toBe("Update styles");
  });

  it("escolhe o verbo pela instrução", () => {
    expect(deriveCommitMessage({ instruction: "remova o menu lateral", files: [] })).toBe("Remova o menu lateral");
    expect(deriveCommitMessage({ summary: "changes", instruction: "corrija o botão do whatsapp", files: ["src/App.tsx"] })).toBe("Corrija o botão do whatsapp");
  });

  it("nunca devolve mensagem genérica e tem fallback seguro", () => {
    expect(deriveCommitMessage({ files: [] })).toBe("Update project");
    expect(deriveCommitMessage({ summary: "changes", files: [] })).not.toMatch(/^(changes|update|ai changes)$/i);
  });

  it("trunca mensagens longas", () => {
    const long = "a".repeat(200);
    const msg = deriveCommitMessage({ summary: long, files: [] });
    expect(msg.length).toBeLessThanOrEqual(72);
    expect(msg.endsWith("…")).toBe(true);
  });
});
