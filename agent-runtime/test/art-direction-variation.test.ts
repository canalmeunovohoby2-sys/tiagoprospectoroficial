import { describe, it, expect } from "vitest";
import { fallbackArtDirection } from "../src/studio/agent-core/art-direction";

// Evidência determinística de VARIAÇÃO REAL entre projetos (Fase 3/6).
// Mesmo segmento com posicionamentos diferentes NÃO pode gerar a mesma assinatura
// visual (tipografia + hero + paleta + plano de seções).
const cases = [
  { name: "Esquerdo Advogados", segment: "advocacia", category: "escritório de advocacia", city: "Bauru", services: ["Criminal", "Cível", "Família"], about: "atuação consultiva e contemporânea" },
  { name: "Moraes & Prado", segment: "advocacia", category: "escritório de advocacia", city: "Bauru", services: ["Trabalhista", "Empresarial"], about: "tradição institucional desde 1985" },
  { name: "Ótica Visão Clara", segment: "ótica", category: "loja de óculos", city: "Campinas", services: ["Armações", "Lentes", "Exame"], about: "moda e precisão" },
  { name: "Clínica Sereno", segment: "psicologia", category: "clínica de psicologia", city: "Belo Horizonte", services: ["Terapia individual", "Casal"], about: "acolhimento e escuta" },
  { name: "Spa Corpo Leve", segment: "massoterapia", category: "massoterapia e estética", city: "São Paulo", services: ["Massagem relaxante", "Drenagem"], about: "bem-estar e recuperação" },
  { name: "Nexa Systems", segment: "tecnologia", category: "software", city: "Florianópolis", services: ["Plataforma", "Integrações"], about: "engenharia de produto" },
  { name: "OdontoVitta", segment: "odontologia", category: "clínica odontológica", city: "Campinas", services: ["Implantes", "Ortodontia"], about: "tecnologia e cuidado" },
];

function signature(s: ReturnType<typeof fallbackArtDirection>): string {
  return [
    s.typography.pair,
    s.hero.composition,
    s.palette.tokens.map((t) => t.hex).join(","),
    s.sectionPlan.map((x) => x.id).join(">"),
  ].join("||");
}

describe("variação real entre projetos", () => {
  it("os 7 projetos não compartilham a mesma assinatura visual", () => {
    const specs = cases.map((c) => fallbackArtDirection(c as never));
    const sigs = specs.map(signature);
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(5);
  });

  it("dois escritórios de advocacia com posicionamentos distintos divergem", () => {
    const [a, b] = cases.slice(0, 2).map((c) => fallbackArtDirection(c as never));
    expect(signature(a)).not.toBe(signature(b));
  });

  it("cada spec tem plano de seções coerente e fontes reais", () => {
    for (const c of cases) {
      const s = fallbackArtDirection(c as never);
      expect(s.sectionPlan.length).toBeGreaterThanOrEqual(3);
      expect(s.typography.heading).toBeTruthy();
      expect(s.typography.body).toBeTruthy();
      expect(s.palette.tokens.length).toBeGreaterThanOrEqual(3);
    }
  });
});
