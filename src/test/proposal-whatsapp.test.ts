import { describe, expect, it } from "vitest";
import {
  buildProposalMessage,
  businessLabel,
  publicSiteUrl,
  resolveProposalTarget,
  whatsappProposalUrl,
} from "@/lib/proposalWhatsApp";

describe("proposalWhatsApp — WhatsApp do lead", () => {
  it("lead com WhatsApp → número internacional correto", () => {
    const t = resolveProposalTarget({ name: "Pet Care", whatsapp: "(11) 91234-5678" });
    expect(t.hasWhatsapp).toBe(true);
    expect(t.phoneNumber).toBe("5511912345678");
    expect(t.whatsapp).toBe("(11) 91234-5678");
  });

  it("lead com número já com 55 → preserva", () => {
    const t = resolveProposalTarget({ name: "X", whatsapp: "+5513987654321" });
    expect(t.phoneNumber).toBe("5513987654321");
    expect(t.hasWhatsapp).toBe(true);
  });

  it("telefone fixo NUNCA vira WhatsApp", () => {
    const t = resolveProposalTarget({ name: "X", whatsapp: null, phone: "(11) 3456-7890" });
    expect(t.hasWhatsapp).toBe(false);
    expect(t.phoneNumber).toBeNull();
  });

  it("sem whatsapp → botão indisponível", () => {
    const t = resolveProposalTarget({ name: "Y", whatsapp: "", phone: "(11) 3456-7890" });
    expect(t.hasWhatsapp).toBe(false);
  });
});

describe("proposalWhatsApp — mensagem e link", () => {
  it("mensagem usa nome do lead e link da proposta quando existir", () => {
    const msg = buildProposalMessage({ name: "Pet Care", city: "Santos", siteUrl: "https://app/site/pet-care" });
    expect(msg).toContain("Pet Care");
    expect(msg).toContain("https://app/site/pet-care");
  });

  it("sem link → avisa que será enviado depois (não inventa URL)", () => {
    const msg = buildProposalMessage({ name: "Pet Care" });
    expect(msg).not.toMatch(/https?:\/\/\S+/);
  });

  it("publicSiteUrl monta URL pública com slug", () => {
    expect(publicSiteUrl("https://prospector.app/", "pet-care")).toBe("https://prospector.app/public/pet-care");
    expect(publicSiteUrl("https://prospector.app", null)).toBeNull();
  });

  it("URL de envio usa o número do lead e mensagem codificada", () => {
    const url = whatsappProposalUrl("5511912345678", "Olá! Segue a proposta.");
    expect(url).toBe(`https://api.whatsapp.com/send?phone=5511912345678&text=${encodeURIComponent("Olá! Segue a proposta.")}`);
  });

  it("rótulo combina empresa + cidade", () => {
    expect(businessLabel("Pet Care", "Santos")).toBe("Pet Care (Santos)");
  });
});
