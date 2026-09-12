import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeadCard } from "@/pages/Leads";
import type { Lead } from "@/data/types";

function makeLead(overrides: Record<string, unknown> = {}): Lead {
  return {
    id: "lead-1",
    user_id: "user-1",
    search_id: "search-1",
    external_id: "ChIJ123",
    name: "Advocacia Teste",
    category: "Advogado",
    segment: "advogados",
    city: "Bauru",
    state: "SP",
    address: "Rua A, 100",
    phone: "5514999999999",
    whatsapp: "5514999999999",
    website: "https://exemplo.com.br",
    google_url: "https://maps.google.com/?cid=1",
    instagram: null,
    facebook: null,
    rating: 4.6,
    reviews_count: 12,
    score: 4,
    final_score: 70,
    score_reasons: ["Telefone disponível"],
    has_website: true,
    is_favorite: false,
    is_contacted: false,
    in_crm: false,
    confidence: "high",
    photo_name: "https://lh3.googleusercontent.com/abc=w400",
    ...overrides,
  } as unknown as Lead;
}

function renderCard(lead: Lead, handlers: { onFavorite?: () => void; onContacted?: () => void } = {}) {
  return render(<LeadCard lead={lead} onFavorite={handlers.onFavorite ?? (() => {})} onContacted={handlers.onContacted ?? (() => {})} />);
}

describe("LeadCard — imagem real do estabelecimento", () => {
  it("1) lead com thumbnail → foto aparece", () => {
    renderCard(makeLead());
    const img = screen.getByRole("img", { name: "Advocacia Teste" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("lh3.googleusercontent.com");
    expect(img.className).toContain("object-cover");
  });

  it("3) lead sem imagem → mostra 'Sem imagem' e nenhum <img>", () => {
    renderCard(makeLead({ photo_name: null }));
    expect(screen.getByText("Sem imagem")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("4) URL inválida → fallback 'Sem imagem'", () => {
    renderCard(makeLead({ photo_name: "not-a-url" }));
    expect(screen.getByText("Sem imagem")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("5) lead sem foto continua aparecendo", () => {
    renderCard(makeLead({ photo_name: null }));
    expect(screen.getByText("Advocacia Teste")).toBeInTheDocument();
  });
});

describe("LeadCard — sem botão 'Ver' e card não clicável", () => {
  it("6) não existe botão 'Ver'", () => {
    renderCard(makeLead());
    expect(screen.queryByText(/^\s*Ver\s*$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /ver/i })).toBeNull();
  });

  it("7) clicar na imagem ou no nome não navega (não estão em link/botão)", () => {
    renderCard(makeLead());
    const heading = screen.getByText("Advocacia Teste");
    expect(heading.closest("a,button")).toBeNull();
    const img = screen.getByRole("img", { name: "Advocacia Teste" });
    expect(img.closest("a,button")).toBeNull();
  });
});

describe("LeadCard — ações continuam funcionando", () => {
  it("8) WhatsApp", () => {
    renderCard(makeLead());
    const el = screen.getByTitle("WhatsApp");
    const a = el.tagName === "A" ? el : el.closest("a");
    expect(a?.getAttribute("href")).toBe("https://wa.me/5514999999999");
  });

  it("9) telefone", () => {
    renderCard(makeLead());
    const el = screen.getByTitle("Ligar");
    const a = el.tagName === "A" ? el : el.closest("a");
    expect(a?.getAttribute("href")).toBe("tel:5514999999999");
  });

  it("10) site", () => {
    renderCard(makeLead());
    const el = screen.getByTitle("Site");
    const a = el.tagName === "A" ? el : el.closest("a");
    expect(a?.getAttribute("href")).toBe("https://exemplo.com.br");
  });

  it("favoritar e contatado chamam os callbacks", () => {
    const onFavorite = vi.fn();
    const onContacted = vi.fn();
    renderCard(makeLead(), { onFavorite, onContacted });
    fireEvent.click(screen.getByTitle("Favoritar"));
    fireEvent.click(screen.getByTitle("Marcar como contatado"));
    expect(onFavorite).toHaveBeenCalledTimes(1);
    expect(onContacted).toHaveBeenCalledTimes(1);
  });

  it("botão Google Maps usa a URL (place_id) do lead", () => {
    render(
      <LeadCard
        lead={makeLead({ google_url: "https://www.google.com/maps/place/?q=place_id:ChIJ1" })}
        onFavorite={() => {}}
        onContacted={() => {}}
      />,
    );
    const el = screen.getByTitle("Google Maps");
    const a = el.tagName === "A" ? el : el.closest("a");
    expect(a?.getAttribute("href")).toBe("https://www.google.com/maps/place/?q=place_id:ChIJ1");
  });

  it("botão 'Gerar Site' existe e chama o callback", () => {
    const onGenerateSite = vi.fn();
    render(<LeadCard lead={makeLead()} onFavorite={() => {}} onContacted={() => {}} onGenerateSite={onGenerateSite} />);
    const btn = screen.getByRole("button", { name: /gerar site/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onGenerateSite).toHaveBeenCalledTimes(1);
  });

  it("botão 'Gerar Site' fica desabilitado enquanto abre o projeto", () => {
    render(<LeadCard lead={makeLead()} onFavorite={() => {}} onContacted={() => {}} onGenerateSite={() => {}} openingSite />);
    expect(screen.getByRole("button", { name: /gerar site/i })).toBeDisabled();
  });
});
