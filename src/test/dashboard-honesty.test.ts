import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const FORBIDDEN = /Ticket m[eé]dio|Convers[aã]o por nicho|Taxa de resposta|alto ROI|ROI estimado|Faturamento|Receita estimada|Probabilidade de venda|Taxa de fechamento|Math\.random|lorem ipsum/i;

describe("Dashboard — honestidade (só métricas com fonte real)", () => {
  it("AnalyticsCards não contém métricas inventadas nem valores aleatórios", () => {
    const src = read("src/components/app/AnalyticsCards.tsx");
    expect(src).not.toMatch(FORBIDDEN);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/TICKET|AVG_TICKET/);
  });

  it("AnalyticsCards lê APENAS tabelas reais (leads/searches/site_projects/services)", () => {
    const src = read("src/components/app/AnalyticsCards.tsx");
    expect(src).toContain('from("leads")');
    expect(src).toContain('from("searches")');
    expect(src).toContain('from("site_projects")');
    expect(src).toContain('from("services")');
  });

  it("Dashboard.tsx não exibe métricas comerciais sem fonte", () => {
    const src = read("src/pages/Dashboard.tsx");
    expect(src).not.toMatch(FORBIDDEN);
  });
});
