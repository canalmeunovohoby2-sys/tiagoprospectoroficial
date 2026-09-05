import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SiteSpec } from "@/data/siteProjects";
import { normalizeSpec, contentBlock, safeArr } from "@/data/siteProjects";

interface SitePreviewProps {
  spec: SiteSpec | Record<string, unknown> | null;
}

const KNOWN_TYPES = ["hero", "trust", "features", "numbers", "process", "faq", "gallery", "about", "services", "testimonials", "cta", "contact"] as const;
type SectionType = (typeof KNOWN_TYPES)[number];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DESIGN_VIEWPORT_WIDTHS: Record<string, string> = {
  narrow: "62rem",
  standard: "74rem",
  wide: "86rem",
};
const DESIGN_SECTION_PAD: Record<string, string> = {
  compact: "3.5rem",
  comfortable: "5rem",
  generous: "6.5rem",
};
const DESIGN_RADIUS: Record<string, string> = {
  none: "0px",
  small: "8px",
  medium: "16px",
  large: "24px",
};
const HEADING_FALLBACK = "Plus Jakarta Sans";
const BODY_FALLBACK = "Inter";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function oneOf<T extends string>(v: string, list: readonly T[], fb: T): T {
  return (list as readonly string[]).includes(v) ? (v as T) : fb;
}
function isPlaceholderText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function blockText(block: Record<string, unknown>, key: string): string {
  return isPlaceholderText(block[key]) ? block[key].trim() : "";
}
function textRich(text: string): ReactNode[] {
  const parts = text.split(/\[([^\]]+)\]/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <span key={i} className="rounded bg-amber-300/20 px-1 py-0.5 text-amber-600 ring-1 ring-amber-400/40" title="Informação pendente — edite antes de publicar">
          {part}
        </span>
      );
    }
    return part;
  });
}
function waDigits(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.startsWith("55")) return d;
  return d.length >= 10 && d.length <= 11 ? `55${d}` : d;
}

// Aceita string legada ou objeto de asset { url, alt }.
function resolveImg(v: unknown): { url: string; alt: string } | null {
  if (typeof v === "string" && v.trim() && /^https?:\/\//i.test(v.trim())) return { url: v.trim(), alt: "" };
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (typeof r.url === "string" && /^https?:\/\//i.test(r.url)) {
      return { url: r.url, alt: typeof r.alt === "string" ? r.alt : "" };
    }
  }
  return null;
}

function Picture({ src, alt, ratio, eager = false, className = "" }: { src: string; alt: string; ratio?: string; eager?: boolean; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={ratio ? { aspectRatio: ratio, backgroundColor: "color-mix(in srgb, var(--sp-muted) 15%, transparent)" } : { backgroundColor: "color-mix(in srgb, var(--sp-muted) 15%, transparent)" }}>
      <img
        src={src}
        alt={alt || ""}
        loading={eager ? "eager" : "lazy"}
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    </div>
  );
}

type Tokens = Record<string, string>;

export function SitePreview({ spec: raw }: SitePreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const spec = useMemo(() => normalizeSpec(raw), [raw]);

  const business = spec.business ?? {};
  const ds = spec.design_system ?? {};
  const colors = ds.colors ?? {};
  const typo = ds.typography ?? {};
  const archetype = oneOf(str(ds.layout_archetype), ["editorial", "corporate", "minimal", "luxury", "bold", "service_focused", "local_business"] as const, "minimal");
  const heroVariant = oneOf(str(ds.hero_variant), ["split", "centered", "editorial", "statement", "service_first"] as const, "centered");
  const cardStyle = oneOf(str(ds.card_style), ["flat", "bordered", "elevated", "editorial"] as const, "bordered");
  const buttonStyle = oneOf(str(ds.button_style), ["solid", "outline", "soft"] as const, "solid");
  const navStyle = oneOf(str(ds.navigation_style), ["minimal", "centered", "boxed"] as const, "minimal");
  const footerStyle = oneOf(str(ds.footer_style), ["simple", "editorial", "centered"] as const, "simple");
  const containerWidth = DESIGN_VIEWPORT_WIDTHS[oneOf(str(ds.container_width), ["narrow", "standard", "wide"] as const, "standard")];
  const sectionPad = DESIGN_SECTION_PAD[oneOf(str(ds.section_spacing), ["compact", "comfortable", "generous"] as const, "comfortable")];
  const radius = DESIGN_RADIUS[oneOf(str(ds.radius_scale), ["none", "small", "medium", "large"] as const, "medium")];
  const density = oneOf(str(ds.visual_density), ["airy", "balanced", "dense"] as const, "airy");
  const decorative = oneOf(str(ds.decorative_intensity), ["none", "low", "medium"] as const, "low");
  const headingScale = oneOf(str(typo.heading_scale), ["normal", "large", "display"] as const, "large");

  const name = str(business.name) || "Minha Empresa";
  const segmentLabel = str(business.segment) || "Negócio local";
  const headingFont = str(typo.heading_font) || (archetype === "luxury" || archetype === "editorial" ? "Playfair Display" : HEADING_FALLBACK);
  const bodyFont = str(typo.body_font) || BODY_FALLBACK;
  const headingWeight = typo.heading_weight === "regular" ? 400 : typo.heading_weight === "semibold" ? 600 : 700;

  const hero = contentBlock(spec, "hero");
  const about = contentBlock(spec, "about");
  const services = contentBlock(spec, "services");
  const testimonials = contentBlock(spec, "testimonials");
  const ctaBlock = contentBlock(spec, "cta");
  const contact = contentBlock(spec, "contact");
  const footer = contentBlock(spec, "footer");
  const sections = spec.sections ?? [];
  const nav = spec.navigation ?? [];
  const ctas = spec.calls_to_action ?? [];

  const serviceItems = safeArr(services.items).filter((i) => !!str(i.title));
  const testimonialItems = safeArr(testimonials.items);

  const contactPhone = str(contact.phone);
  const contactWa = str(contact.whatsapp);
  const contactAddress = str(contact.address);
  const contactHours = Array.isArray(contact.opening_hours) ? (contact.opening_hours as string[]).filter((x) => typeof x === "string") : [];
  const waLink = contactWa ? `https://wa.me/${waDigits(contactWa)}` : "";

  const heroDestType = str(hero.primary_cta_type);
  const heroDestValue = str(hero.primary_cta_value);
  const heroBtnHref = useMemo(() => {
    const value = heroDestValue || (heroDestType === "whatsapp" ? contactWa : "");
    if (heroDestType === "whatsapp" && value) return `https://wa.me/${waDigits(value)}`;
    if (heroDestType === "tel" && value) return `tel:${value.replace(/\D/g, "")}`;
    if (heroDestType === "link" && value) return value;
    if (heroDestType === "scroll" && value) return `#${value.replace(/^#/, "")}`;
    if (waLink) return waLink;
    return str(hero.primary_cta) ? "#servicos" : "";
  }, [heroDestType, heroDestValue, contactWa, waLink, hero]);
  const heroBtnLabel = str(hero.primary_cta) || (heroBtnHref ? "Falar agora" : "");
  const heroBtnExternal = heroBtnHref.startsWith("http") && !heroBtnHref.startsWith("#");

  const c = (key: string, fb: string): string => (HEX_RE.test(colors[key] || "") ? colors[key]! : fb);
  const primary = c("primary", "#0f766e");
  const onPrimary = c("on_primary", "#ffffff");
  const secondary = c("secondary", "#134e4a");
  const accent = c("accent", "#d97706");
  const background = c("background", "#fafafa");
  const surface = c("surface", "#ffffff");
  const onSurface = c("on_surface", "#111827");
  const muted = c("muted", "#6b7280");
  const borderColor = c("border", "color-mix(in srgb, var(--sp-muted) 26%, transparent)");
  const ctaColor = c("cta", primary);

  const headingVar = `"${headingFont}", "${HEADING_FALLBACK}", system-ui, sans-serif`;
  const bodyVar = `"${bodyFont}", "${BODY_FALLBACK}", system-ui, sans-serif`;
  const headingSize = headingScale === "display" ? "clamp(2.6rem, 6vw, 4.4rem)" : headingScale === "large" ? "clamp(2.1rem, 4.2vw, 3.3rem)" : "clamp(1.9rem, 3.4vw, 2.7rem)";
  const subheadingSize = headingScale === "display" ? "clamp(1.4rem, 2.4vw, 1.9rem)" : "clamp(1.15rem, 1.8vw, 1.45rem)";
  const bodySize = str(typo.body_size) === "large" ? "1.075rem" : "1rem";
  const letterSpacing = archetype === "luxury" || archetype === "editorial" ? "-0.015em" : "-0.02em";
  const isLightFooter = archetype === "editorial" || archetype === "luxury" || archetype === "corporate";

  const tokens: Tokens = {
    "--sp-primary": primary,
    "--sp-on-primary": onPrimary,
    "--sp-secondary": secondary,
    "--sp-accent": accent,
    "--sp-cta": ctaColor,
    "--sp-background": background,
    "--sp-surface": surface,
    "--sp-on-surface": onSurface,
    "--sp-muted": muted,
    "--sp-border": borderColor,
    "--sp-radius": radius,
    "--sp-maxw": containerWidth,
    "--sp-py-section": sectionPad,
    "--sp-heading-font": headingVar,
    "--sp-body-font": bodyVar,
    "--sp-heading-weight": String(headingWeight),
    "--sp-heading-size": headingSize,
    "--sp-sub-size": subheadingSize,
    "--sp-body-size": bodySize,
    "--sp-tracking": letterSpacing,
    "--sp-density": density === "dense" ? "0.6" : density === "airy" ? "1.15" : "1",
  } as Tokens;

  useEffect(() => {
    if (!document.getElementById("sp-google-fonts")) {
      const link = document.createElement("link");
      link.id = "sp-google-fonts";
      link.rel = "stylesheet";
      const fam = Array.from(new Set([headingFont, bodyFont])).map((f) => f.replace(/ /g, "+")).join("&family=");
      if (fam) link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
      document.head.appendChild(link);
    }
  }, [headingFont, bodyFont]);

  // Microinterações: reveal suave das seções ao entrar no viewport.
  useEffect(() => {
    if (!document.getElementById("sp-anim")) {
      const style = document.createElement("style");
      style.id = "sp-anim";
      style.textContent = `
        .sp-root section[id]{opacity:0;transform:translateY(14px);transition:opacity .55s ease,transform .55s ease}
        .sp-root section[id].sp-in{opacity:1;transform:none}
        @media (prefers-reduced-motion: reduce){.sp-root section[id]{opacity:1 !important;transform:none !important;transition:none}}
      `;
      document.head.appendChild(style);
    }
    const secs = Array.from(document.querySelectorAll<HTMLElement>(".sp-root section[id]"));
    if (!("IntersectionObserver" in window)) {
      secs.forEach((s) => s.classList.add("sp-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("sp-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -5% 0px" },
    );
    secs.forEach((s) => {
      const rect = s.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) s.classList.add("sp-in");
      io.observe(s);
    });
    return () => io.disconnect();
  }, [spec]);

  const activeSections = useMemo<SectionType[]>(() => {
    const out: SectionType[] = [];
    for (const s of sections) {
      const t = str(s.type);
      if ((KNOWN_TYPES as readonly string[]).includes(t) && !out.includes(t as SectionType)) out.push(t as SectionType);
    }
    if (out.length === 0) {
      for (const t of ["hero", "trust", "features", "numbers", "process", "faq", "gallery", "about", "services", "testimonials", "cta", "contact"] as SectionType[]) {
        if (Object.keys(contentBlock(spec, t)).length > 0) out.push(t);
      }
    }
    return out.filter((t) => t !== "contact" || (blockText(contact, "title") || contactPhone || contactWa || contactAddress));
  }, [sections, spec, contact, contactPhone, contactWa, contactAddress]);

  const sectionHas = (t: SectionType) => activeSections.includes(t);

  // Reusable primitives -----------------------------------------------------
  const eyebrow = (t: string) => (
    <span className="inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: "var(--sp-primary)", fontWeight: 600 }}>
      <span className="h-px w-7" style={{ backgroundColor: "var(--sp-primary)" }} />
      {t}
    </span>
  );

  const heading = (t: string, opts?: { light?: boolean; size?: string }) => (
    <h2
      className="font-bold leading-[1.08]"
      style={{
        fontFamily: "var(--sp-heading-font)",
        fontWeight: "var(--sp-heading-weight)",
        fontSize: opts?.size ?? "var(--sp-heading-size)",
        letterSpacing: "var(--sp-tracking)",
        color: opts?.light ? "var(--sp-on-primary)" : "var(--sp-on-surface)",
      }}
    >
      {textRich(t)}
    </h2>
  );

  const btn = (label: string, href: string, kind: "primary" | "ghost" = "primary") => {
    const isOutline = buttonStyle === "outline";
    const isSoft = buttonStyle === "soft";
    const bg = kind === "ghost" ? "transparent" : isSoft ? "color-mix(in srgb, var(--sp-cta) 12%, transparent)" : "var(--sp-cta)";
    const fg = kind === "ghost" ? "var(--sp-primary)" : isSoft ? "var(--sp-cta)" : "var(--sp-on-primary)";
    const bd = isOutline && kind === "primary" ? `1px solid var(--sp-cta)` : kind === "ghost" ? "1px solid var(--sp-border)" : "1px solid transparent";
    return (
      <a
        href={href}
        target={href.startsWith("http") && !href.startsWith("#") ? "_blank" : undefined}
        rel={href.startsWith("http") && !href.startsWith("#") ? "noreferrer" : undefined}
        className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.95rem] font-semibold transition-transform hover:scale-[1.02]"
        style={{ backgroundColor: bg, color: fg, border: bd, boxShadow: "none" }}
      >
        {label}
      </a>
    );
  };

  const cardCss = (): React.CSSProperties => {
    const base: React.CSSProperties = { backgroundColor: "var(--sp-surface)", borderRadius: "calc(var(--sp-radius) * 0.85)" };
    if (cardStyle === "flat") return { ...base, border: "1px solid var(--sp-border)", boxShadow: "none" };
    if (cardStyle === "elevated") return { ...base, border: "1px solid transparent", boxShadow: "0 1px 2px rgba(16,24,40,.05), 0 10px 30px -18px rgba(16,24,40,.25)" };
    if (cardStyle === "editorial") return { backgroundColor: "transparent", borderRadius: 0, border: "none", borderTop: "1px solid var(--sp-border)", paddingTop: 18 };
    return { ...base, border: "1px solid var(--sp-border)", boxShadow: "none" };
  };

  const showContactBlock = contactPhone || contactWa || contactAddress || contactHours.length > 0;
  const heroImg = resolveImg(hero.image);
  const heroImgNote = typeof hero.image_note === "string" ? hero.image_note : "";

  const renderSidePanel = () => {
    if (showContactBlock || serviceItems.length > 0) {
      const items = serviceItems.slice(0, 4).map((it) => str(it.title)).filter(Boolean);
      const facts = [
        contactAddress && { icon: "📍", k: "Endereço", v: contactAddress },
        contactPhone && { icon: "☎", k: "Telefone", v: contactPhone },
        contactWa && { icon: "💬", k: "WhatsApp", v: contactWa },
        ...contactHours.slice(0, 3).map((h) => ({ icon: "🕘", k: "Horário", v: h })),
      ].filter((x): x is { icon: string; k: string; v: string } => !!x);
      return (
        <div className="rounded-[calc(var(--sp-radius)*1.1)] p-7" style={{ backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-border)", boxShadow: "0 24px 60px -32px rgba(16,24,40,.28)" }}>
          {items.length > 0 && (
            <div className="mb-6">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] mb-3" style={{ color: "var(--sp-primary)", fontWeight: 700 }}>Especialidades</p>
              <ul className="space-y-2.5">
                {items.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--sp-on-surface)" }}>
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--sp-primary)" }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {facts.length > 0 && (
            <div className="space-y-3">
              {facts.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <span aria-hidden className="text-base leading-none mt-0.5">{f.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[0.66rem] uppercase tracking-wider" style={{ color: "var(--sp-muted)" }}>{f.k}</p>
                    <p className="break-words" style={{ color: "var(--sp-on-surface)" }}>{textRich(f.v)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!items.length && !facts.length && <div className="text-sm" style={{ color: "var(--sp-muted)" }}>Imagem do negócio — espaço reservado</div>}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center rounded-[calc(var(--sp-radius)*1.1)]" style={{ background: "color-mix(in srgb, var(--sp-primary) 8%, var(--sp-surface))", border: "1px dashed var(--sp-border)" }}>
        <span className="px-6 text-center text-sm" style={{ color: "var(--sp-muted)" }}>Imagem do negócio — espaço reservado</span>
      </div>
    );
  };

  const renderHero = () => {
    const title = str(hero.title) || name;
    const sub = str(hero.subtitle) || (str(business.tagline) ? str(business.tagline) : "");

    if (heroVariant === "statement") {
      return (
        <section id="hero" className="relative overflow-hidden" style={{ backgroundColor: "var(--sp-secondary)", color: "var(--sp-on-primary)" }}>
          {heroImg && (
            <div aria-hidden className="absolute inset-0">
              <img
                src={heroImg.url}
                alt=""
                loading="eager"
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--sp-secondary) 90%, transparent) 0%, var(--sp-secondary) 72%)" }} />
            </div>
          )}
          {decorative !== "none" && (
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-10" style={{ backgroundColor: "var(--sp-on-primary)" }} />
          )}
          <div className="relative mx-auto px-6 py-24 sm:py-32" style={{ maxWidth: "var(--sp-maxw)" }}>
            <div className="max-w-4xl space-y-7">
              <span className="text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: "var(--sp-on-primary)", opacity: 0.85 }}>{segmentLabel}</span>
              <h1 className="font-bold leading-[1.02]" style={{ fontFamily: "var(--sp-heading-font)", fontWeight: "var(--sp-heading-weight)", fontSize: "var(--sp-heading-size)", letterSpacing: "var(--sp-tracking)" }}>
                {textRich(title)}
              </h1>
              {sub && <p className="max-w-2xl text-lg leading-relaxed" style={{ color: "color-mix(in srgb, var(--sp-on-primary) 82%, transparent)" }}>{textRich(sub)}</p>}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {heroBtnHref && heroBtnLabel && (
                  <a href={heroBtnHref} target={heroBtnExternal ? "_blank" : undefined} rel={heroBtnExternal ? "noreferrer" : undefined} className="inline-flex items-center gap-2 rounded-full px-7 py-3 font-semibold" style={{ backgroundColor: "var(--sp-accent)", color: "#1c1917" }}>
                    {heroBtnLabel}
                  </a>
                )}
                {!heroBtnLabel && waLink && (
                  <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-7 py-3 font-semibold" style={{ backgroundColor: "var(--sp-accent)", color: "#1c1917" }}>Falar agora</a>
                )}
                {str(hero.secondary_cta) && (
                  <a href="#contato" className="rounded-full border px-7 py-3 font-semibold" style={{ borderColor: "color-mix(in srgb, var(--sp-on-primary) 35%, transparent)", color: "var(--sp-on-primary)" }}>{str(hero.secondary_cta)}</a>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (heroVariant === "split" || heroVariant === "service_first") {
      return (
        <section id="hero" style={{ backgroundColor: "var(--sp-background)", color: "var(--sp-on-surface)" }}>
          <div className="mx-auto grid items-center gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]" style={{ maxWidth: "var(--sp-maxw)" }}>
            <div className="space-y-6">
              <div>{eyebrow(segmentLabel)}</div>
              <h1 className="font-bold leading-[1.05]" style={{ fontFamily: "var(--sp-heading-font)", fontWeight: "var(--sp-heading-weight)", fontSize: "var(--sp-heading-size)", letterSpacing: "var(--sp-tracking)" }}>
                {textRich(title)}
              </h1>
              {sub && <p className="text-lg leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(sub)}</p>}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {heroBtnHref && heroBtnLabel && btn(heroBtnLabel, heroBtnHref)}
                {!heroBtnLabel && waLink && btn("Falar agora", waLink)}
                {str(hero.secondary_cta) && btn(str(hero.secondary_cta), "#contato", "ghost")}
              </div>
            </div>
            <div>
              {heroImg ? (
                <div className="space-y-3">
                  <Picture src={heroImg.url} alt={heroImg.alt} ratio="4 / 3" eager className="rounded-[calc(var(--sp-radius)*1.2)] shadow-[0_30px_70px_-30px_rgba(16,24,40,.35)]" />
                  {heroImgNote && <p className="text-[11px]" style={{ color: "var(--sp-muted)" }}>{textRich(heroImgNote)}</p>}
                </div>
              ) : (
                renderSidePanel()
              )}
            </div>
          </div>
        </section>
      );
    }

    // centered + editorial
    const editorial = heroVariant === "editorial" || archetype === "editorial" || archetype === "luxury";
    return (
      <section id="hero" style={{ backgroundColor: "var(--sp-background)", color: "var(--sp-on-surface)" }}>
        <div className={`mx-auto px-6 py-16 text-${editorial ? "left" : "center"} sm:py-24`} style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className={`${editorial ? "max-w-3xl" : "mx-auto max-w-3xl"} space-y-6`}>
            {editorial ? eyebrow(segmentLabel) : (
              <span className="inline-block text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: "var(--sp-primary)", fontWeight: 600 }}>{segmentLabel}</span>
            )}
            <h1 className="font-bold leading-[1.02]" style={{ fontFamily: "var(--sp-heading-font)", fontWeight: "var(--sp-heading-weight)", fontSize: "var(--sp-heading-size)", letterSpacing: "var(--sp-tracking)" }}>
              {textRich(title)}
            </h1>
            {sub && <p className={`text-lg leading-relaxed ${editorial ? "" : "mx-auto"}`} style={{ color: "var(--sp-muted)" }}>{textRich(sub)}</p>}
            <div className={`flex flex-wrap items-center gap-3 pt-1 ${editorial ? "" : "justify-center"}`}>
              {heroBtnHref && heroBtnLabel && btn(heroBtnLabel, heroBtnHref)}
              {!heroBtnLabel && waLink && btn("Falar agora", waLink)}
              {str(hero.secondary_cta) && btn(str(hero.secondary_cta), "#contato", "ghost")}
            </div>
            {heroImg && (
              <div className={editorial ? "mt-14" : "mx-auto mt-12 max-w-3xl"}>
                <Picture src={heroImg.url} alt={heroImg.alt} ratio="16 / 8" eager className="rounded-[calc(var(--sp-radius)*1.2)] shadow-[0_30px_70px_-30px_rgba(16,24,40,.3)]" />
                {heroImgNote && <p className="mt-2 text-center text-[11px]" style={{ color: "var(--sp-muted)" }}>{textRich(heroImgNote)}</p>}
              </div>
            )}
          </div>
        </div>
        </section>
      );
  };

  const renderAbout = () =>
    blockText(about, "body") ? (
      <section id="about" style={{ backgroundColor: "var(--sp-surface)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className={`grid gap-8 ${archetype === "editorial" || archetype === "luxury" ? "lg:grid-cols-[0.8fr_1.2fr] lg:items-start" : "max-w-3xl"}`}>
            {archetype === "editorial" || archetype === "luxury" ? (
              <>
                <div className="space-y-3">{eyebrow("Sobre")}</div>
                <div className="space-y-5">
                  {heading(blockText(about, "title") || "Sobre")}
                  <p className="leading-relaxed" style={{ color: "var(--sp-muted)", fontSize: "var(--sp-body-size)" }}>{textRich(blockText(about, "body"))}</p>
                </div>
              </>
            ) : (
              <div className="mx-auto max-w-3xl text-center space-y-6">
                {eyebrow("Sobre")}
                {heading(blockText(about, "title") || "Sobre")}
                <p className="leading-relaxed" style={{ color: "var(--sp-muted)", fontSize: "var(--sp-body-size)" }}>{textRich(blockText(about, "body"))}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    ) : null;

  const renderServices = () =>
    serviceItems.length > 0 ? (
      <section id="services" style={{ backgroundColor: "var(--sp-background)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="mb-10 space-y-3 text-center">
            <span className="inline-flex items-center justify-center">{eyebrow("Serviços")}</span>
            {heading(blockText(services, "title") || "Serviços")}
            {blockText(services, "subtitle") && <p className="mx-auto max-w-xl" style={{ color: "var(--sp-muted)" }}>{textRich(blockText(services, "subtitle"))}</p>}
          </div>
          <div className={`grid gap-5 ${cardStyle === "editorial" ? "sm:grid-cols-2" : serviceItems.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {serviceItems.map((item, i) => {
              const title = str(item.title);
              const desc = str(item.description);
              const styleCss = cardCss();
              return (
                <div key={i} className={`p-6 ${cardStyle === "editorial" ? "" : "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_rgba(16,24,40,0.4)]"}`} style={{ ...styleCss, padding: cardStyle === "editorial" ? 0 : undefined }}>
                  {cardStyle === "editorial" && <span className="mb-3 inline-block text-xs font-semibold" style={{ color: "var(--sp-primary)" }}>0{i + 1}</span>}
                  {!cardStyle.includes("editorial") && (
                    <div className="mb-4 h-9 w-9 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: "color-mix(in srgb, var(--sp-primary) 10%, transparent)", color: "var(--sp-primary)" }}>
                      {str(item.icon) || "◆"}
                    </div>
                  )}
                  <h3 className="mb-1.5 font-semibold leading-snug" style={{ fontFamily: "var(--sp-heading-font)", color: "var(--sp-on-surface)" }}>{title}</h3>
                  {desc && <p className="text-sm leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(desc)}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    ) : null;

  const renderTrust = () => {
    const trust = contentBlock(spec, "trust");
    const items = safeArr(trust.items).map((i) => str(i.text)).filter(Boolean);
    if (!sectionHas("trust") || items.length === 0) return null;
    return (
      <section id="trust" style={{ backgroundColor: "var(--sp-background)" }}>
        <div className="mx-auto px-6 py-8" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {items.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--sp-muted)" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--sp-primary)" }} />
                {textRich(t)}
              </span>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderFeatures = () => {
    const features = contentBlock(spec, "features");
    const items = safeArr(features.items).filter((i) => !!str(i.title));
    if (!sectionHas("features") || items.length === 0) return null;
    const columns = items.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
    return (
      <section id="features" style={{ backgroundColor: "var(--sp-background)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="mb-10 max-w-2xl space-y-3">
            {eyebrow("Diferenciais")}
            {heading(blockText(features, "title") || "Por que nos escolher")}
          </div>
          <div className={`grid gap-px overflow-hidden rounded-2xl border ${columns}`} style={{ borderColor: "var(--sp-border)", backgroundColor: "var(--sp-border)" }}>
            {items.map((item, i) => (
              <div key={i} className="group p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_rgba(16,24,40,0.4)]" style={{ backgroundColor: "var(--sp-surface)" }}>
                <div className="mb-4 flex items-baseline justify-between">
                  <span className="text-sm font-bold" style={{ color: "var(--sp-primary)" }}>{str(item.icon) || `0${i + 1}`}</span>
                </div>
                <h3 className="mb-2 font-semibold leading-snug" style={{ fontFamily: "var(--sp-heading-font)", color: "var(--sp-on-surface)" }}>{str(item.title)}</h3>
                {str(item.description) && <p className="text-sm leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(str(item.description))}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderNumbers = () => {
    const numbers = contentBlock(spec, "numbers");
    const items = safeArr(numbers.items).filter((i) => !!str(i.value));
    if (!sectionHas("numbers") || items.length === 0) return null;
    return (
      <section id="numbers" style={{ backgroundColor: "var(--sp-secondary)", color: "var(--sp-on-primary)" }}>
        <div className="mx-auto px-6 py-14" style={{ maxWidth: "var(--sp-maxw)" }}>
          {blockText(numbers, "title") && (
            <p className="mb-8 text-center text-xs uppercase tracking-[0.2em]" style={{ color: "color-mix(in srgb, var(--sp-on-primary) 80%, transparent)" }}>{textRich(blockText(numbers, "title"))}</p>
          )}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {items.map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: "var(--sp-heading-font)" }}>{str(item.value)}</p>
                <p className="mt-1 text-xs" style={{ color: "color-mix(in srgb, var(--sp-on-primary) 75%, transparent)" }}>{str(item.label)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderProcess = () => {
    const process = contentBlock(spec, "process");
    const steps = safeArr(process.steps).filter((i) => !!str(i.title));
    if (!sectionHas("process") || steps.length === 0) return null;
    return (
      <section id="process" style={{ backgroundColor: "var(--sp-surface)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="mb-12 max-w-2xl space-y-3">
            {eyebrow("Como funciona")}
            {heading(blockText(process, "title") || "Nosso processo")}
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, i) => (
              <div key={i} className="relative border-t-2 pt-6" style={{ borderColor: i === 0 ? "var(--sp-primary)" : "var(--sp-border)" }}>
                <span className="mb-3 inline-block text-3xl font-bold" style={{ fontFamily: "var(--sp-heading-font)", color: "var(--sp-primary)", opacity: 0.9 }}>{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mb-2 font-semibold" style={{ fontFamily: "var(--sp-heading-font)" }}>{str(step.title)}</h3>
                {str(step.description) && <p className="text-sm leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(str(step.description))}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderFaq = () => {
    const faq = contentBlock(spec, "faq");
    const items = safeArr(faq.items).filter((i) => !!str(i.question));
    if (!sectionHas("faq") || items.length === 0) return null;
    return (
      <section id="faq" style={{ backgroundColor: "var(--sp-background)" }}>
        <div className="mx-auto max-w-3xl px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="mb-10 space-y-3 text-center">
            {heading(blockText(faq, "title") || "Perguntas frequentes")}
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <details key={i} className="group rounded-xl border px-5 py-4" style={{ borderColor: "var(--sp-border)", backgroundColor: "var(--sp-surface)" }}>
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden" style={{ color: "var(--sp-on-surface)" }}>
                  {str(item.question)}
                  <span className="text-lg leading-none text-[var(--sp-primary)] transition-transform group-open:rotate-45">+</span>
                </summary>
                {str(item.answer) && <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(str(item.answer))}</p>}
              </details>
            ))}
          </div>
        </div>
      </section>
    );
  };

  const renderTestimonials = () =>
    testimonialItems.length > 0 ? (
      <section id="testimonials" style={{ backgroundColor: "var(--sp-surface)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="mb-10 space-y-3 text-center">
            {heading(blockText(testimonials, "title") || "Depoimentos")}
          </div>
          <div className={`grid gap-5 ${testimonialItems.length > 1 ? "sm:grid-cols-2" : "sm:max-w-2xl mx-auto"}`}>
            {testimonialItems.map((item, i) => {
              const quote = str(item.quote);
              if (!quote) return null;
              return (
                <figure key={i} className="p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-30px_rgba(16,24,40,0.4)]" style={{ ...cardCss(), borderLeft: "3px solid var(--sp-primary)" }}>
                  <blockquote className="text-[1.02rem] leading-relaxed" style={{ color: "var(--sp-on-surface)" }}>{textRich(quote)}</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--sp-primary) 14%, transparent)", color: "var(--sp-primary)" }}>
                      {(str(item.author) || "C").charAt(0)}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold" style={{ color: "var(--sp-on-surface)" }}>{str(item.author) || "Cliente"}</span>
                      {str(item.role) && <span className="block text-xs" style={{ color: "var(--sp-muted)" }}>{str(item.role)}</span>}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </section>
    ) : null;

  const renderCta = () => {
    const title = blockText(ctaBlock, "title") || "Fale conosco";
    const ctaInline = str(ds.cta_treatment) === "inline";
    const ctaT = oneOf(str(ds.cta_treatment), ["primary_section", "band", "inline"] as const, "band");
    const solid = buttonStyle !== "outline";
    return (
      <section id="cta" style={{ backgroundColor: ctaT === "band" ? "var(--sp-secondary)" : "var(--sp-background)", color: ctaT === "band" ? "var(--sp-on-primary)" : "var(--sp-on-surface)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className={`${ctaInline ? "lg:flex lg:items-end lg:justify-between lg:gap-10" : "text-center"}`}>
            <div className={`space-y-4 ${ctaInline ? "" : "mx-auto max-w-2xl"}`}>
              <h2 className="font-bold leading-tight" style={{ fontFamily: "var(--sp-heading-font)", fontWeight: "var(--sp-heading-weight)", fontSize: "var(--sp-heading-size)", letterSpacing: "var(--sp-tracking)", color: ctaT === "band" ? "var(--sp-on-primary)" : undefined }}>
                {textRich(title)}
              </h2>
              {blockText(ctaBlock, "body") && <p style={{ color: ctaT === "band" ? "color-mix(in srgb, var(--sp-on-primary) 80%, transparent)" : "var(--sp-muted)" }}>{textRich(blockText(ctaBlock, "body"))}</p>}
            </div>
            <div className={`mt-7 ${ctaInline ? "lg:mt-0" : ""} flex flex-wrap ${ctaInline ? "" : "justify-center"} items-center gap-3`}>
              {waLink ? (
                <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-7 py-3 font-semibold" style={{ backgroundColor: solid ? (ctaT === "band" ? "var(--sp-accent)" : "var(--sp-cta)") : "transparent", color: ctaT === "band" ? "#1c1917" : "var(--sp-on-primary)", border: solid ? "1px solid transparent" : `1px solid ${ctaT === "band" ? "var(--sp-on-primary)" : "var(--sp-cta)"}` }}>
                  {str(ctaBlock.button_label) || "Falar agora"}
                </a>
              ) : contactPhone ? (
                <a href={`tel:${contactPhone.replace(/\D/g, "")}`} className="inline-flex items-center gap-2 rounded-full px-7 py-3 font-semibold" style={{ backgroundColor: solid ? "var(--sp-cta)" : "transparent", color: "var(--sp-on-primary)", border: solid ? "1px solid transparent" : "1px solid var(--sp-cta)" }}>
                  {str(ctaBlock.button_label) || "Ligar agora"}
                </a>
              ) : (
                <a href="#contato" className="inline-flex items-center gap-2 rounded-full px-7 py-3 font-semibold" style={{ backgroundColor: solid ? "var(--sp-cta)" : "transparent", color: "var(--sp-on-primary)", border: solid ? "1px solid transparent" : "1px solid var(--sp-cta)" }}>
                  {str(ctaBlock.button_label) || "Entrar em contato"}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderContact = () =>
    sectionHas("contact") && (blockText(contact, "title") || contactPhone || contactWa || contactAddress) ? (
      <section id="contact" style={{ backgroundColor: "var(--sp-background)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-5">
              {eyebrow("Contato")}
              {heading(blockText(contact, "title") || "Contato")}
              {blockText(contact, "body") && <p className="leading-relaxed" style={{ color: "var(--sp-muted)" }}>{textRich(blockText(contact, "body"))}</p>}
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {contactPhone && (
                <a href={`tel:${contactPhone.replace(/\D/g, "")}`} className="group rounded-xl p-5 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-border)" }}>
                  <span className="mb-2 block text-xl">☎</span>
                  <span className="block text-xs uppercase tracking-wider" style={{ color: "var(--sp-muted)" }}>Telefone</span>
                  <span className="block font-medium break-words" style={{ color: "var(--sp-on-surface)" }}>{contactPhone}</span>
                </a>
              )}
              {contactWa && (
                <a href={waLink} target="_blank" rel="noreferrer" className="rounded-xl p-5 transition-transform hover:-translate-y-0.5" style={{ backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-border)" }}>
                  <span className="mb-2 block text-xl">💬</span>
                  <span className="block text-xs uppercase tracking-wider" style={{ color: "var(--sp-muted)" }}>WhatsApp</span>
                  <span className="block font-medium break-words" style={{ color: "var(--sp-on-surface)" }}>{contactWa}</span>
                </a>
              )}
              {contactAddress && (
                <div className="rounded-xl p-5 sm:col-span-2" style={{ backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-border)" }}>
                  <span className="mb-2 block text-xl">📍</span>
                  <span className="block text-xs uppercase tracking-wider" style={{ color: "var(--sp-muted)" }}>Endereço</span>
                  <span className="block font-medium" style={{ color: "var(--sp-on-surface)" }}>{textRich(contactAddress)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    ) : null;

  const renderGallery = () => {
    const gallery = contentBlock(spec, "gallery");
    const items = safeArr(gallery.items)
      .map((it) => resolveImg(it.image ?? it.url ?? it))
      .filter((x): x is { url: string; alt: string } => !!x);
    if (!sectionHas("gallery") || items.length === 0) return null;
    const editorial = str(gallery.layout) === "editorial";
    return (
      <section id="gallery" style={{ backgroundColor: "var(--sp-surface)" }}>
        <div className="mx-auto px-6 py-[var(--sp-py-section)]" style={{ maxWidth: "var(--sp-maxw)" }}>
          {blockText(gallery, "title") && <div className="mb-9 text-center">{heading(blockText(gallery, "title"))}</div>}
          {editorial ? (
            <div className="grid auto-rows-[10rem] grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {items.slice(0, 7).map((img, i) => (
                <div key={i} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                  <Picture src={img.url} alt={img.alt || ""} className="h-full rounded-[calc(var(--sp-radius)*0.9)] shadow-sm" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {items.slice(0, 6).map((img, i) => (
                <Picture key={i} src={img.url} alt={img.alt || ""} ratio="4 / 3" className="rounded-[calc(var(--sp-radius)*0.9)] shadow-sm" />
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-[11px]" style={{ color: "var(--sp-muted)" }}>Imagens ilustrativas de referência (não são fotos do negócio).</p>
        </div>
      </section>
    );
  };

  const renderFooter = () => {
    const light = isLightFooter;
    const fg = light ? "var(--sp-on-surface)" : "var(--sp-on-primary)";
    const mu = light ? "var(--sp-muted)" : "color-mix(in srgb, var(--sp-on-primary) 75%, transparent)";
    const centered = footerStyle === "centered";
    return (
      <footer style={{ backgroundColor: light ? "var(--sp-surface)" : "var(--sp-secondary)", borderTop: light ? "1px solid var(--sp-border)" : "none", color: fg }}>
        <div className={`mx-auto px-6 py-10 ${centered ? "text-center" : ""}`} style={{ maxWidth: "var(--sp-maxw)" }}>
          <div className={`${centered ? "" : "sm:flex sm:items-center sm:justify-between"} gap-6 space-y-4 sm:space-y-0`}>
            <div className="space-y-1">
              <p className="font-bold" style={{ fontFamily: "var(--sp-heading-font)", color: light ? "var(--sp-primary)" : fg }}>{name}</p>
              {blockText(footer, "tagline") && <p className="text-xs" style={{ color: mu }}>{textRich(blockText(footer, "tagline"))}</p>}
            </div>
            <p className="text-xs" style={{ color: mu }}>
              © {new Date().getFullYear()} {name} · {segmentLabel}
            </p>
          </div>
        </div>
      </footer>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">Preview da especificação · Desktop/Mobile</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setViewport("desktop")} className={`h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${viewport === "desktop" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>Desktop</button>
          <button type="button" onClick={() => setViewport("mobile")} className={`h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${viewport === "mobile" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>Mobile</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 overflow-hidden bg-[var(--sp-background)] shadow-[0_0_0_1px_hsl(0_0%_0%/0.04)]">
        <div
          className={`sp-root mx-auto ${viewport === "mobile" ? "max-w-[400px]" : "max-w-full"} transition-all duration-300`}
          style={{ ...(tokens as React.CSSProperties), backgroundColor: "var(--sp-background)", color: "var(--sp-on-surface)", fontFamily: "var(--sp-body-font)", fontSize: "var(--sp-body-size)" }}
        >
          {/* Header / nav */}
          <header className={`sticky top-0 z-20 ${navStyle === "boxed" ? "px-4 pt-3" : "px-5"}`} style={navStyle === "boxed" ? { background: "transparent" } : { backgroundColor: "color-mix(in srgb, var(--sp-surface) 88%, transparent)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--sp-border)" }}>
            <div className={`mx-auto flex items-center justify-between gap-3 ${navStyle === "boxed" ? "rounded-2xl px-5 py-3" : "px-0 py-3"}`} style={navStyle === "boxed" ? { backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-border)", maxWidth: "var(--sp-maxw)" } : { maxWidth: "var(--sp-maxw)", padding: "0.75rem 0" }}>
              <span className="font-bold tracking-tight" style={{ fontFamily: "var(--sp-heading-font)", color: "var(--sp-primary)" }}>{name.length > 24 ? name.slice(0, 24) + "…" : name}</span>
              {nav.length > 0 && (
                <nav className={`hidden md:flex items-center gap-7 ${navStyle === "centered" ? "lg:flex-1 lg:justify-center" : ""}`}>
                  {nav.slice(0, 5).map((item) => (
                    <a key={str(item.anchor)} href={`#${str(item.anchor)}`} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "var(--sp-on-surface)" }}>{str(item.label) || str(item.anchor)}</a>
                  ))}
                </nav>
              )}
              <div className="flex items-center gap-3">
                {waLink && <a href={waLink} target="_blank" rel="noreferrer" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: "var(--sp-cta)", color: "var(--sp-on-primary)" }}>WhatsApp</a>}
              </div>
            </div>
          </header>

          {renderHero()}
          {renderTrust()}
          {sectionHas("about") && renderAbout()}
          {sectionHas("services") && renderServices()}
          {renderFeatures()}
          {renderNumbers()}
          {renderProcess()}
          {sectionHas("testimonials") && renderTestimonials()}
          {renderGallery()}
          {renderFaq()}
          {sectionHas("cta") && renderCta()}
          {renderContact()}
          {renderFooter()}
        </div>
      </div>
    </div>
  );
}
