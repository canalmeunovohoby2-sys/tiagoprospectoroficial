import { describe, it, expect } from "vitest";
import { filterLeadsByOrvixSegment, validateOrvixLeadSegment } from "@/lib/orvixSegmentValidation";
import type { Lead } from "@/data/types";

function mk(partial: Partial<Lead>): Lead {
  return { id: "l1", name: "", city: "Guarulhos", state: "SP", ...partial } as unknown as Lead;
}

describe("Segmento (5.31) — não fecha resultados por campo ausente", () => {
  it("marca sem a palavra do nicho no nome NÃO é ocultada (contexto da busca)", () => {
    const lead = mk({ name: "Casa Aurora", category: "Padaria", id: "x1" });
    const r = validateOrvixLeadSegment(lead, "Padaria");
    expect(r.valid).toBe(true);
    expect(r.rejectionCategory).toBeUndefined();
  });

  it("rejeição explícita por termo de outro nicho continua funcionando", () => {
    const lead = mk({ name: "Restaurante Sabor Mineiro", category: "Restaurante", id: "x2" });
    const r = validateOrvixLeadSegment(lead, "Padaria");
    expect(r.valid).toBe(false);
    expect(r.rejectionCategory).toBe("reject_term_hit");
  });

  it("filtro mantém leads sem nenhum texto (sem descartar só por dados ausentes)", () => {
    const leads = [
      mk({ id: "a", name: "", category: null, segment: null }),
      mk({ id: "b", name: "Padaria Estrela", category: "Padaria" }),
    ];
    const { valid, rejected } = filterLeadsByOrvixSegment(leads, "Padaria");
    expect(valid.length).toBe(2);
    expect(rejected.length).toBe(0);
  });
});
