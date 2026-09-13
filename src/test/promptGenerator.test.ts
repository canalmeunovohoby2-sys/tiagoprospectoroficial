import { describe, it, expect } from "vitest";
import { buildPremiumPrompt, classifySegment, promptFileName, OBJECTIVE_OPTIONS, STYLE_OPTIONS } from "../../src/lib/promptGenerator";

const base = { companyName: "Clínica Sorriso", segment: "clínica odontológica", objectives: ["Agendar atendimento"], styles: ["Premium"] };

describe("Criador de Prompt Premium — motor determinístico (sem IA)", () => {
  it("formulário mínimo (só obrigatórios) gera prompt completo e não vazio", () => {
    const p = buildPremiumPrompt(base);
    expect(p.length).toBeGreaterThan(1500);
    for (const bloco of ["BRIEFING PREMIUM", "CONTEXTO DO NEGÓCIO", "POSICIONAMENTO", "OBJETIVO & ESTRATÉGIA", "DIREÇÃO CRIATIVA", "ARQUITETURA DO SITE", "COPY", "MOBILE", "SEO", "TRACKING", "REGRAS ANTI-INVENÇÃO", "CHECKLIST DE QUALIDADE"]) {
      expect(p, bloco).toContain(bloco);
    }
    expect(p).toContain("Clínica Sorriso");
    expect(p).toContain("clínica odontológica");
    // sem dados opcionais → placeholders honestos
    expect(p).toContain("[INSERIR");
  });

  it("formulário completo incorpora os dados fornecidos", () => {
    const p = buildPremiumPrompt({
      companyName: "Studio Aurora", segment: "design de interiores", location: "São Paulo/SP",
      offers: "projetos residenciais e comerciais", audience: "famílias e empresas",
      differentials: "atendimento autoral e prazos claros", objectives: ["Gerar leads", "Receber pedidos no WhatsApp"],
      styles: ["Elegante", "Editorial".replace("Editorial", "Sofisticado")], reference: "estética editorial de clínicas premium",
    });
    expect(p).toContain("São Paulo/SP");
    expect(p).toContain("projetos residenciais e comerciais");
    expect(p).toContain("famílias e empresas");
    expect(p).toContain("atendimento autoral e prazos claros");
    expect(p).toContain("estética editorial de clínicas premium");
    expect(p).toMatch(/WhatsApp/i);
  });

  it("NUNCA inventa fatos: sem dados factuais usa placeholders e proíbe invenção", () => {
    const p = buildPremiumPrompt(base);
    // instruções anti-invenção presentes
    expect(p.toLowerCase()).toContain("nunca invente");
    expect(p).toContain("[INSERIR");
    // não afirma fatos do cliente
    expect(p).not.toMatch(/\bdesde 19\d\d\b/i);
    expect(p).not.toMatch(/\b\d{3,} clientes\b/i);
    // instrui a proibir texto genérico
    expect(p).toContain("PROIBIDO");
  });

  it("varia a direção criativa entre segmentos (exemplos reais)", () => {
    const examples = [
      { companyName: "Clínica Sorriso", segment: "clínica odontológica premium", objectives: ["Agendar atendimento"], styles: ["Premium"] },
      { companyName: "Almeida & Prado", segment: "escritório de advocacia", objectives: ["Gerar contatos"], styles: ["Sofisticado"] },
      { companyName: "Cantina Bella", segment: "restaurante italiano", objectives: ["Receber pedidos no WhatsApp"], styles: ["Artesanal"] },
      { companyName: "Sol Forte", segment: "empresa de energia solar", objectives: ["Gerar leads"], styles: ["Tecnológico"] },
      { companyName: "Forge Fit", segment: "academia", objectives: ["Agendar atendimento"], styles: ["Impactante"] },
    ];
    const prompts = examples.map((e) => buildPremiumPrompt(e));
    prompts.forEach((p, i) => expect(p.length, examples[i].segment).toBeGreaterThan(1500));
    const arqu = examples.map((e) => classifySegment(e.segment).key);
    expect(new Set(arqu).size).toBeGreaterThanOrEqual(4);
    // paleta/tipografia variam (pelo menos 3 combinações distintas de paleta)
    const paletas = prompts.map((p) => (p.match(/Paleta \(família "([^"]+)"/) ?? [])[1]);
    expect(new Set(paletas).size).toBeGreaterThanOrEqual(3);
    // o prompt de academia menciona fitness; o de energia solar menciona orçamento técnico
    expect(classifySegment("academia").key).toBe("fitness");
    expect(classifySegment("empresa de energia solar").key).toBe("servicos_tecnicos");
  });

  it("objetivo e estilo alteram o prompt (conversão direcionada)", () => {
    const wa = buildPremiumPrompt({ ...base, objectives: ["Receber pedidos no WhatsApp"] });
    const leads = buildPremiumPrompt({ ...base, objectives: ["Gerar leads"] });
    expect(wa).toMatch(/WhatsApp como canal principal/i);
    expect(leads).toMatch(/Formulário enxuto/i);
    expect(wa).not.toBe(leads);
  });

  it("nome de arquivo sanitizado", () => {
    expect(promptFileName("Clínica Sorriso")).toBe("prompt-premium-clinica-sorriso.md");
    expect(promptFileName("")).toBe("prompt-premium-cliente.md");
  });

  it("opções de objetivo/estilo expostas e estáveis", () => {
    expect(OBJECTIVE_OPTIONS).toContain("Receber pedidos no WhatsApp");
    expect(STYLE_OPTIONS).toContain("Premium");
    expect(STYLE_OPTIONS).toContain("Você decide");
  });
});
