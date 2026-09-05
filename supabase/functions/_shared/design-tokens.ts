// Premium Design Tokens — escala tipográfica, espaçamento, forma, sombra e motion.
// Consumido pelo component-library (7.1) e pelo Premium QA (7.3).
// Puro (sem Deno) — roda em testes, edge e preview.

// ---------------- Tipografia ----------------
export interface TypeRoleTokens {
  display: { size: string; line: number; weight: number; tracking: string };
  heading: { size: string; line: number; weight: number; tracking: string };
  subheading: { size: string; line: number; weight: number };
  body: { size: string; line: number };
  eyebrow: { size: string; tracking: string };
  caption: { size: string };
  button: { size: string };
}

export type TypeVoice = "editorial" | "display" | "quiet" | "bold" | "technical";

const TYPE_VOICES: Record<TypeVoice, TypeRoleTokens> = {
  editorial: {
    display: { size: "clamp(2.9rem,6.5vw,4.6rem)", line: 1.02, weight: 600, tracking: "-0.02em" },
    heading: { size: "clamp(1.9rem,3.4vw,2.9rem)", line: 1.08, weight: 600, tracking: "-0.015em" },
    subheading: { size: "clamp(1.15rem,1.9vw,1.5rem)", line: 1.35, weight: 500 },
    body: { size: "1.06rem", line: 1.7 },
    eyebrow: { size: "0.72rem", tracking: "0.22em" },
    caption: { size: "0.8rem" },
    button: { size: "0.95rem" },
  },
  display: {
    display: { size: "clamp(3rem,7vw,5rem)", line: 0.98, weight: 800, tracking: "-0.03em" },
    heading: { size: "clamp(2rem,3.8vw,3.2rem)", line: 1.04, weight: 700, tracking: "-0.02em" },
    subheading: { size: "clamp(1.2rem,2vw,1.6rem)", line: 1.3, weight: 600 },
    body: { size: "1.05rem", line: 1.65 },
    eyebrow: { size: "0.7rem", tracking: "0.26em" },
    caption: { size: "0.8rem" },
    button: { size: "0.95rem" },
  },
  quiet: {
    display: { size: "clamp(2.5rem,5vw,3.9rem)", line: 1.08, weight: 500, tracking: "-0.02em" },
    heading: { size: "clamp(1.7rem,3vw,2.5rem)", line: 1.12, weight: 500, tracking: "-0.015em" },
    subheading: { size: "clamp(1.1rem,1.8vw,1.4rem)", line: 1.4, weight: 450 },
    body: { size: "1rem", line: 1.72 },
    eyebrow: { size: "0.68rem", tracking: "0.24em" },
    caption: { size: "0.78rem" },
    button: { size: "0.9rem" },
  },
  bold: {
    display: { size: "clamp(2.8rem,6vw,4.4rem)", line: 0.99, weight: 800, tracking: "-0.025em" },
    heading: { size: "clamp(1.9rem,3.5vw,2.9rem)", line: 1.05, weight: 700, tracking: "-0.02em" },
    subheading: { size: "clamp(1.15rem,1.9vw,1.55rem)", line: 1.3, weight: 600 },
    body: { size: "1.05rem", line: 1.62 },
    eyebrow: { size: "0.7rem", tracking: "0.24em" },
    caption: { size: "0.8rem" },
    button: { size: "0.95rem" },
  },
  technical: {
    display: { size: "clamp(2.6rem,5.4vw,4rem)", line: 1.02, weight: 800, tracking: "-0.02em" },
    heading: { size: "clamp(1.8rem,3.2vw,2.7rem)", line: 1.08, weight: 700, tracking: "-0.01em" },
    subheading: { size: "clamp(1.12rem,1.8vw,1.45rem)", line: 1.35, weight: 600 },
    body: { size: "1.02rem", line: 1.6 },
    eyebrow: { size: "0.7rem", tracking: "0.24em" },
    caption: { size: "0.8rem" },
    button: { size: "0.93rem" },
  },
};

export function typeVoiceFor(archetype: string): TypeVoice {
  if (archetype === "editorial" || archetype === "luxury") return "editorial";
  if (archetype === "bold") return "display";
  if (archetype === "corporate" || archetype === "service_focused") return "technical";
  if (archetype === "minimal" || archetype === "local_business") return "quiet";
  return "quiet";
}

export function getTypeRoleTokens(archetype: string): TypeRoleTokens {
  return TYPE_VOICES[typeVoiceFor(archetype)] ?? TYPE_VOICES.quiet;
}

// ---------------- Layout / ritmo ----------------
export interface LayoutTokens {
  container: string;       // max-width
  sectionPad: string;
  gutter: string;
  gridGap: string;
  densityLine: number;     // line-height multiplicador p/ densidade
}

export const CONTAINER_BY = { narrow: "62rem", standard: "74rem", wide: "86rem" } as const;
export const SECTION_PAD_BY = { compact: "3.5rem", comfortable: "5rem", generous: "6.5rem" } as const;
export const GUTTER_BY = { compact: "1.25rem", comfortable: "1.75rem", generous: "2.25rem" } as const;
export const DENSITY_LINE_BY = { dense: 1.42, balanced: 1.6, airy: 1.75 } as const;

export function layoutTokens(opts: { container?: string; spacing?: string; density?: string }): LayoutTokens {
  const container = CONTAINER_BY[opts.container as keyof typeof CONTAINER_BY] ?? CONTAINER_BY.standard;
  const spacing = opts.spacing && opts.spacing in SECTION_PAD_BY ? (opts.spacing as keyof typeof SECTION_PAD_BY) : "comfortable";
  const density = opts.density && opts.density in DENSITY_LINE_BY ? (opts.density as keyof typeof DENSITY_LINE_BY) : "balanced";
  return {
    container,
    sectionPad: SECTION_PAD_BY[spacing],
    gutter: GUTTER_BY[spacing],
    gridGap: spacing === "compact" ? "1rem" : spacing === "generous" ? "1.75rem" : "1.25rem",
    densityLine: DENSITY_LINE_BY[density],
  };
}

// ---------------- Shape ----------------
export type RadiusKey = "none" | "small" | "medium" | "large";
export const RADIUS_BY: Record<RadiusKey, string> = { none: "0px", small: "8px", medium: "16px", large: "24px" };

export type ShadowTreatment = "flat" | "soft" | "elevated" | "editorial" | "none";
export const SHADOW_CSS: Record<ShadowTreatment, string> = {
  none: "none",
  flat: "0 1px 2px rgba(16,24,40,.04)",
  soft: "0 6px 24px -12px rgba(16,24,40,.14)",
  elevated: "0 1px 2px rgba(16,24,40,.05), 0 22px 50px -24px rgba(16,24,40,.28)",
  editorial: "0 1px 0 rgba(16,24,40,.06)",
};

export function radiusFor(scale?: string): RadiusKey {
  return scale && scale in RADIUS_BY ? (scale as RadiusKey) : "medium";
}

export function shadowFor(cardStyle?: string, archetype?: string): ShadowTreatment {
  if (cardStyle === "editorial" || archetype === "editorial") return "editorial";
  if (cardStyle === "elevated") return "elevated";
  if (cardStyle === "flat") return "flat";
  if (archetype === "luxury" || archetype === "minimal") return "soft";
  if (cardStyle === "bordered") return "soft";
  return "soft";
}

// ---------------- Motion ----------------
export interface MotionTokens {
  durationFast: string;
  durationBase: string;
  durationSlow: string;
  easing: string;
  revealY: string;          // distância do reveal
  hoverLift: string;        // translateY no hover de cards
  imageZoomScale: string;
  staggerMs: number;
}

export const EASING_PREMIUM = "cubic-bezier(.22,.8,.28,1)";
export const EASING_SOFT = "cubic-bezier(.4,0,.2,1)";
export const EASING_SNAPPY = "cubic-bezier(.2,.7,.3,1)";

export function motionTokens(cluster: string): MotionTokens {
  const calm = cluster === "saude_bem_estar" || cluster === "profissional_consultivo" || cluster === "arquitetura_design";
  const energetic = cluster === "automotivo" || cluster === "alimentacao" || cluster === "beleza";
  if (calm) {
    return {
      durationFast: "220ms", durationBase: "450ms", durationSlow: "750ms",
      easing: EASING_SOFT, revealY: "16px", hoverLift: "-3px", imageZoomScale: "1.04", staggerMs: 70,
    };
  }
  if (energetic) {
    return {
      durationFast: "180ms", durationBase: "380ms", durationSlow: "650ms",
      easing: EASING_SNAPPY, revealY: "20px", hoverLift: "-5px", imageZoomScale: "1.07", staggerMs: 50,
    };
  }
  return {
    durationFast: "200ms", durationBase: "420ms", durationSlow: "700ms",
    easing: EASING_PREMIUM, revealY: "18px", hoverLift: "-4px", imageZoomScale: "1.05", staggerMs: 60,
  };
}

// Conveniência: monta o objeto de tokens completo de um cluster + archetype.
export function resolveDesignTokens(segment: string, archetype: string, opts?: { container?: string; spacing?: string; density?: string; cardStyle?: string; radius?: string }) {
  return {
    layout: layoutTokens({ container: opts?.container, spacing: opts?.spacing, density: opts?.density }),
    type: getTypeRoleTokens(archetype),
    shape: {
      radius: RADIUS_BY[radiusFor(opts?.radius)],
      shadow: SHADOW_CSS[shadowFor(opts?.cardStyle, archetype)],
      shadowKey: shadowFor(opts?.cardStyle, archetype),
    },
    motion: motionTokens(segment),
  };
}
