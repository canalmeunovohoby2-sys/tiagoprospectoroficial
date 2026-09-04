import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SiteSpec } from "@/data/siteProjects";
import { normalizeSpec, contentBlock, safeArr } from "@/data/siteProjects";

interface SitePreviewProps {
  spec: SiteSpec | Record<string, unknown> | null;
}

const KNOWN_TYPES = ["hero", "about", "services", "testimonials", "cta", "contact"] as const;
type SectionType = (typeof KNOWN_TYPES)[number];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Renderiza texto destacando placeholders "[...]" (conteúdo editável pendente).
function renderRich(text: string): ReactNode[] {
  const parts = text.split(/\[([^\]]+)\]/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <span
          key={i}
          className="rounded bg-amber-300/20 px-1 py-0.5 text-amber-600 ring-1 ring-amber-400/40"
          title="Informação pendente — edite antes de publicar"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isPlaceholderText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function blockText(block: Record<string, unknown>, key: string): string {
  return isPlaceholderText(block[key]) ? block[key].trim() : "";
}

function waDigits(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.startsWith("55")) return d;
  return d.length >= 10 && d.length <= 11 ? `55${d}` : d;
}

function blockWhatsapp(contact: Record<string, unknown>, ctas: SiteSpec["calls_to_action"]): string {
  const direct = text(contact.whatsapp);
  if (direct) return waDigits(direct);
  const waCta = (ctas ?? []).find((c) => c?.type === "whatsapp" && text(c.value));
  return waCta ? waDigits(text(waCta.value)) : "";
}

export function SitePreview({ spec: raw }: SitePreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const spec = useMemo(() => normalizeSpec(raw), [raw]);

  const business = spec.business ?? {};
  const design = spec.design_system ?? {};
  const colors = design.colors ?? {};
  const headingFont = text(design.typography?.heading_font) || "Plus Jakarta Sans";
  const bodyFont = text(design.typography?.body_font) || "Inter";
  const hero = contentBlock(spec, "hero");
  const about = contentBlock(spec, "about");
  const services = contentBlock(spec, "services");
  const testimonials = contentBlock(spec, "testimonials");
  const ctaBlock = contentBlock(spec, "cta");
  const contact = contentBlock(spec, "contact");
  const footer = contentBlock(spec, "footer");
  const nav = spec.navigation ?? [];
  const ctas = spec.calls_to_action ?? [];
  const sections = spec.sections ?? [];

  const sectionTypes: SectionType[] = useMemo(() => {
    const order: SectionType[] = [];
    for (const s of sections) {
      const t = text(s.type);
      if ((KNOWN_TYPES as readonly string[]).includes(t) && !order.includes(t as SectionType)) {
        order.push(t as SectionType);
      }
    }
    // Garante ordem padrão quando a IA não informar seções.
    if (order.length === 0) {
      for (const t of ["hero", "about", "services", "testimonials", "cta", "contact"] as SectionType[]) {
        const block = contentBlock(spec, t);
        if (Object.keys(block).length > 0) order.push(t);
      }
    }
    return order.filter((t) => t !== "contact" ? true : (blockText(contact, "title") || blockWhatsapp(contact, ctas) || text(business.name)));
  }, [sections, spec, contact, ctas, business.name]);

  useEffect(() => {
    if (!document.getElementById("sp-google-fonts")) {
      const link = document.createElement("link");
      link.id = "sp-google-fonts";
      link.rel = "stylesheet";
      const families = Array.from(new Set([headingFont, bodyFont]))
        .filter((f) => f && f.trim().length > 0)
        .map((f) => f.replace(/ /g, "+"))
        .join("&family=");
      if (families) link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      document.head.appendChild(link);
    }
  }, [headingFont, bodyFont]);

  const cssVars = {
    "--sp-primary": HEX_RE.test(colors.primary || "") ? colors.primary : "#0f766e",
    "--sp-on-primary": HEX_RE.test(colors.on_primary || "") ? colors.on_primary : "#ffffff",
    "--sp-secondary": HEX_RE.test(colors.secondary || "") ? colors.secondary : "#134e4a",
    "--sp-accent": HEX_RE.test(colors.accent || "") ? colors.accent : "#f59e0b",
    "--sp-background": HEX_RE.test(colors.background || "") ? colors.background : "#f8fafc",
    "--sp-surface": HEX_RE.test(colors.surface || "") ? colors.surface : "#ffffff",
    "--sp-on-surface": HEX_RE.test(colors.on_surface || "") ? colors.on_surface : "#0f172a",
    "--sp-muted": HEX_RE.test(colors.muted || "") ? colors.muted : "#64748b",
    "--sp-font-heading": `"${headingFont}", "Plus Jakarta Sans", system-ui, sans-serif`,
    "--sp-font-body": `"${bodyFont}", "Inter", system-ui, sans-serif`,
  } as React.CSSProperties;

  const name = text(business.name) || "Minha Empresa";
  const heroTitle = text(hero.title) || name;
  const heroSub = text(hero.subtitle) || (text(business.tagline) ? text(business.tagline) : "");
  const whatsapp = blockWhatsapp(contact, ctas);
  const phone = text(contact.phone);

  const renderHeroImage = () => {
    const imgUrl = text(hero.image);
    if (/^https:\/\//i.test(imgUrl)) {
      return <img src={imgUrl} alt="" className="w-full h-full object-cover" />;
    }
    return (
      <div
        className="w-full h-full flex items-center justify-center text-center"
        style={{
          background: "linear-gradient(135deg, var(--sp-primary), var(--sp-secondary))",
          opacity: 0.85,
        }}
      >
        <span className="text-[var(--sp-on-primary)]/90 font-medium px-6 py-3 text-sm">
          Imagem do negócio — espaço reservado
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Preview da especificação · Desktop/Mobile</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={`h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${viewport === "desktop" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={`h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${viewport === "mobile" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            Mobile
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 overflow-hidden bg-[var(--sp-background)] shadow-[0_0_0_1px_hsl(0_0%_0%/0.04)]">
        <div
          className={`mx-auto ${viewport === "mobile" ? "max-w-[400px]" : "max-w-full"} transition-all duration-300`}
          style={{ backgroundColor: "var(--sp-background)", color: "var(--sp-on-surface)", fontFamily: "var(--sp-font-body)", ...cssVars }}
        >
          {/* Cabeçalho */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3 border-b backdrop-blur-md" style={{ backgroundColor: "color-mix(in srgb, var(--sp-surface) 85%, transparent)", borderColor: "color-mix(in srgb, var(--sp-muted) 25%, transparent)" }}>
            <span className="font-bold tracking-tight" style={{ fontFamily: "var(--sp-font-heading)", color: "var(--sp-primary)" }}>
              {name.length > 22 ? name.slice(0, 22) + "…" : name}
            </span>
            {nav.length > 0 && (
              <nav className="hidden sm:flex items-center gap-4">
                {nav.slice(0, 5).map((item) => (
                  <a
                    key={text(item.anchor)}
                    href={`#${text(item.anchor)}`}
                    className="text-sm hover:underline underline-offset-4"
                    style={{ color: "var(--sp-on-surface)" }}
                  >
                    {text(item.label) || text(item.anchor)}
                  </a>
                ))}
              </nav>
            )}
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--sp-primary)", color: "var(--sp-on-primary)" }}
              >
                WhatsApp
              </a>
            )}
          </header>

          {/* Hero */}
          {(sectionTypes.includes("hero") || heroTitle) && (
            <section id="hero" className="relative px-5 py-14 sm:py-20 text-center overflow-hidden" style={{ background: "linear-gradient(135deg, var(--sp-secondary), var(--sp-primary))", color: "var(--sp-on-primary)" }}>
              <div className="max-w-3xl mx-auto space-y-5">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--sp-on-primary) 12%, transparent)" }}>
                  {text(business.segment) || "Negócio local"}
                </span>
                <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight" style={{ fontFamily: "var(--sp-font-heading)" }}>
                  {renderRich(heroTitle)}
                </h1>
                {heroSub && <p className="text-base sm:text-lg mx-auto max-w-2xl opacity-90">{renderRich(heroSub)}</p>}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {(() => {
                    const type = text(hero.primary_cta_type);
                    const valueRaw = text(hero.primary_cta_value);
                    const value = valueRaw || (type === "whatsapp" ? whatsapp : "");
                    let href: string | null = null;
                    if (type === "whatsapp" && value) href = `https://wa.me/${waDigits(value)}`;
                    else if (type === "tel" && value) href = `tel:${value.replace(/\D/g, "")}`;
                    else if (type === "link" && value) href = value;
                    else if (type === "scroll" && value) href = `#${value.replace(/^#/, "")}`;
                    else if (!type) {
                      if (whatsapp) href = `https://wa.me/${whatsapp}`;
                      else if (text(hero.primary_cta)) href = "#services";
                    }
                    const label = text(hero.primary_cta) || (href ? "Falar no WhatsApp" : "");
                    if (!href || !label) return null;
                    return (
                      <a
                        href={href}
                        target={type === "link" ? "_blank" : undefined}
                        rel={type === "link" ? "noreferrer" : undefined}
                        className="rounded-full px-6 py-3 text-sm font-bold transition-transform hover:scale-[1.03]"
                        style={{ backgroundColor: "var(--sp-accent)", color: "#1c1917" }}
                      >
                        {label}
                      </a>
                    );
                  })()}
                  {text(hero.secondary_cta) && (
                    <a
                      href="#services"
                      className="rounded-full px-6 py-3 text-sm font-semibold"
                      style={{ backgroundColor: "color-mix(in srgb, var(--sp-on-primary) 14%, transparent)", color: "var(--sp-on-primary)" }}
                    >
                      {text(hero.secondary_cta)}
                    </a>
                  )}
                </div>
                <div className="mx-auto max-w-3xl h-48 sm:h-64 overflow-hidden rounded-2xl ring-1 ring-white/20">
                  {renderHeroImage()}
                </div>
              </div>
            </section>
          )}

          {/* About */}
          {sectionTypes.includes("about") && blockText(about, "body") && (
            <section id="about" className="px-5 py-12 sm:py-16" style={{ backgroundColor: "var(--sp-background)" }}>
              <div className="max-w-3xl mx-auto space-y-4 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--sp-font-heading)", color: "var(--sp-secondary)" }}>
                  {renderRich(blockText(about, "title") || "Sobre")}
                </h2>
                <p className="leading-relaxed" style={{ color: "var(--sp-on-surface)" }}>{renderRich(blockText(about, "body"))}</p>
              </div>
            </section>
          )}

          {/* Services */}
          {sectionTypes.includes("services") && safeArr(services.items).length > 0 && (
            <section id="services" className="px-5 py-12 sm:py-16" style={{ backgroundColor: "color-mix(in srgb, var(--sp-background) 60%, var(--sp-surface))" }}>
              <div className="max-w-5xl mx-auto space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--sp-font-heading)", color: "var(--sp-secondary)" }}>
                    {renderRich(blockText(services, "title") || "Serviços")}
                  </h2>
                  {blockText(services, "subtitle") && <p style={{ color: "var(--sp-muted)" }}>{renderRich(blockText(services, "subtitle"))}</p>}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {safeArr(services.items).map((item, i) => {
                    const title = text(item.title);
                    if (!title) return null;
                    return (
                      <div key={i} className="rounded-2xl p-5 space-y-2 border" style={{ backgroundColor: "var(--sp-surface)", borderColor: "color-mix(in srgb, var(--sp-muted) 22%, transparent)" }}>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: "color-mix(in srgb, var(--sp-primary) 12%, transparent)", color: "var(--sp-primary)" }}>
                          {text(item.icon) || "◆"}
                        </div>
                        <h3 className="font-bold" style={{ fontFamily: "var(--sp-font-heading)" }}>{title}</h3>
                        {text(item.description) && <p className="text-sm leading-relaxed" style={{ color: "var(--sp-muted)" }}>{renderRich(text(item.description))}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Testimonials */}
          {sectionTypes.includes("testimonials") && safeArr(testimonials.items).length > 0 && (
            <section id="testimonials" className="px-5 py-12 sm:py-16" style={{ backgroundColor: "var(--sp-background)" }}>
              <div className="max-w-4xl mx-auto space-y-8">
                <h2 className="text-center text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--sp-font-heading)", color: "var(--sp-secondary)" }}>
                  {renderRich(blockText(testimonials, "title") || "Depoimentos")}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {safeArr(testimonials.items).map((item, i) => {
                    const quote = text(item.quote);
                    if (!quote) return null;
                    return (
                      <figure key={i} className="rounded-2xl p-5 border space-y-3" style={{ backgroundColor: "var(--sp-surface)", borderColor: "color-mix(in srgb, var(--sp-muted) 22%, transparent)" }}>
                        <blockquote className="text-sm leading-relaxed" style={{ color: "var(--sp-on-surface)" }}>“{renderRich(quote)}”</blockquote>
                        <figcaption className="text-sm font-semibold" style={{ color: "var(--sp-primary)" }}>
                          {text(item.author) || "Cliente"}
                          {text(item.role) && <span className="block text-xs font-normal" style={{ color: "var(--sp-muted)" }}>{text(item.role)}</span>}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* CTA */}
          {sectionTypes.includes("cta") && blockText(ctaBlock, "title") && (
            <section id="cta" className="px-5 py-12 text-center" style={{ background: "linear-gradient(120deg, var(--sp-primary), var(--sp-secondary))", color: "var(--sp-on-primary)" }}>
              <div className="max-w-2xl mx-auto space-y-4">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--sp-font-heading)" }}>{renderRich(blockText(ctaBlock, "title"))}</h2>
                {blockText(ctaBlock, "body") && <p className="opacity-90">{renderRich(blockText(ctaBlock, "body"))}</p>}
                {whatsapp && (
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-full px-6 py-3 text-sm font-bold transition-transform hover:scale-[1.03]"
                    style={{ backgroundColor: "var(--sp-accent)", color: "#1c1917" }}
                  >
                    {text(ctaBlock.button_label) || text(ctas.find((c) => c?.type === "whatsapp")?.label) || "Falar agora"}
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Contact */}
          {sectionTypes.includes("contact") && (blockText(contact, "title") || whatsapp || phone) && (
            <section id="contact" className="px-5 py-12 sm:py-16" style={{ backgroundColor: "var(--sp-background)" }}>
              <div className="max-w-3xl mx-auto text-center space-y-4">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "var(--sp-font-heading)", color: "var(--sp-secondary)" }}>
                  {renderRich(blockText(contact, "title") || "Contato")}
                </h2>
                {blockText(contact, "body") && <p style={{ color: "var(--sp-on-surface)" }}>{renderRich(blockText(contact, "body"))}</p>}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-sm">
                  {whatsapp && (
                    <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 font-semibold" style={{ backgroundColor: "#25D366", color: "#062b16" }}>
                      WhatsApp
                    </a>
                  )}
                  {phone && (
                    <a href={`tel:${phone.replace(/\D/g, "")}`} className="rounded-full px-4 py-2 font-semibold border" style={{ borderColor: "color-mix(in srgb, var(--sp-muted) 40%, transparent)", color: "var(--sp-on-surface)" }}>
                      {phone}
                    </a>
                  )}
                  {!whatsapp && !phone && <span className="text-sm" style={{ color: "var(--sp-muted)" }}>[telefone/WhatsApp]</span>}
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="px-5 py-6 text-center text-xs" style={{ backgroundColor: "var(--sp-secondary)", color: "var(--sp-on-primary)" }}>
            <p>
              © {new Date().getFullYear()} {name}
              {text(footer.tagline) ? ` · ${renderRich(text(footer.tagline))}` : ""}
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
