// Paletas premium curadas por cluster + pares tipográficos.
// Usadas como fallback no generate-site quando o modelo não entrega cores
// completas/válidas — garantindo identidade distinta e sofisticada por
// segmento em vez do "teal padrão" que deixa tudo com cara de template.
// Puro (sem Deno).

export interface PremiumPalette {
  colors: Record<string, string>;
  headingFont: string;
  bodyFont: string;
  visualStyle: string;
  mood: string;
}

// Paletas pensadas por segmento — coordenadas e com contraste AAA.
export const PREMIUM_PALETTES: Record<string, PremiumPalette> = {
  pet_care: {
    colors: {
      primary: "#1d4ed8", on_primary: "#ffffff", secondary: "#0f172a", accent: "#f59e0b",
      background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#5b6b7c", border: "#e2e8f0",
    },
    headingFont: "Plus Jakarta Sans",
    bodyFont: "Inter",
    visualStyle: "Acolhedor e moderno, com formas suaves, cantos levemente arredondados e toques de amarelo âmbar para energia amigável — sem infantilizar.",
    mood: "bold",
  },
  saude_bem_estar: {
    colors: {
      primary: "#0e7490", on_primary: "#ffffff", secondary: "#083344", accent: "#14b8a6",
      background: "#f0fdfa", surface: "#ffffff", on_surface: "#0f172a", muted: "#5b7280", border: "#d9ecea",
    },
    headingFont: "Lora",
    bodyFont: "Inter",
    visualStyle: "Clínico sofisticado: muito espaço em branco, tipografia elegante, verde-água profundo e teal — transmite confiança e cuidado humano.",
    mood: "editorial",
  },
  profissional_consultivo: {
    colors: {
      primary: "#1e3a5f", on_primary: "#ffffff", secondary: "#0f1c30", accent: "#b8860b",
      background: "#f7f5f1", surface: "#ffffff", on_surface: "#1b2733", muted: "#6b7280", border: "#e4dfd6",
    },
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    visualStyle: "Autoridade editorial: serif clássica, paleta azul-marinho e papel quente, composição sóbria e confiável com acabamento refinado.",
    mood: "editorial",
  },
  alimentacao: {
    colors: {
      primary: "#9a3412", on_primary: "#ffffff", secondary: "#2b1004", accent: "#d97706",
      background: "#fdf6ec", surface: "#ffffff", on_surface: "#291407", muted: "#8a6a50", border: "#f0e0cd",
    },
    headingFont: "Fraunces",
    bodyFont: "Work Sans",
    visualStyle: "Sensorial e apetitoso: tons terrosos quentes, tipografia display expressiva e fotografia gastronômica como protagonista.",
    mood: "bold",
  },
  automotivo: {
    colors: {
      primary: "#1e293b", on_primary: "#ffffff", secondary: "#020617", accent: "#f97316",
      background: "#f1f5f9", surface: "#ffffff", on_surface: "#0f172a", muted: "#5b6472", border: "#dbe2ea",
    },
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    visualStyle: "Performance técnica: grafite profundo com laranja vibrante, tipografia grotesca forte e composição direta de oficina profissional.",
    mood: "bold",
  },
  arquitetura_design: {
    colors: {
      primary: "#374151", on_primary: "#ffffff", secondary: "#111827", accent: "#c28d3f",
      background: "#fafafa", surface: "#ffffff", on_surface: "#1f2937", muted: "#6b7280", border: "#e5e5e5",
    },
    headingFont: "Cormorant Garamond",
    bodyFont: "Work Sans",
    visualStyle: "Editorial arquitetônico: escala tipográfica refinada, imagens amplas, assimetria e muito whitespace com detalhe dourado discreto.",
    mood: "editorial",
  },
  beleza: {
    colors: {
      primary: "#6d28d9", on_primary: "#ffffff", secondary: "#2e1065", accent: "#c9a227",
      background: "#faf7fb", surface: "#ffffff", on_surface: "#241534", muted: "#7a6b87", border: "#eadcf2",
    },
    headingFont: "Cormorant Garamond",
    bodyFont: "Nunito Sans",
    visualStyle: "Luxo contemporâneo: vinhos profundos, dourado e creme, tipografia serif elegante com toque de alta estética — nada de rosa genérico.",
    mood: "premium",
  },
};

export const FALLBACK_PREMIUM_PALETTE: PremiumPalette = {
  colors: {
    primary: "#4338ca", on_primary: "#ffffff", secondary: "#1e1b4b", accent: "#f59e0b",
    background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#5b6472", border: "#e2e8f0",
  },
  headingFont: "Plus Jakarta Sans",
  bodyFont: "Inter",
  visualStyle: "Identidade moderna e acolhedora, construída sob medida para o negócio com equilíbrio entre impacto e clareza.",
  mood: "minimal",
};

// Traduz cluster da spec (vindo do niche-design) para paleta curada.
export function premiumPaletteForCluster(cluster: string): PremiumPalette {
  return PREMIUM_PALETTES[cluster] ?? FALLBACK_PREMIUM_PALETTE;
}

// Preenche lacunas da paleta com os valores curados do cluster, mantendo as
// escolhas válidas do modelo (preferência ao que veio da IA).
export function fillPremiumColors(cluster: string, incoming?: Record<string, unknown> | null): Record<string, string> {
  const curated = premiumPaletteForCluster(cluster).colors;
  const out: Record<string, string> = {};
  for (const key of Object.keys(curated)) {
    const raw = incoming?.[key];
    const v = typeof raw === "string" ? raw.trim() : "";
    out[key] = /^#[0-9a-f]{6}$/i.test(v) ? v : curated[key];
  }
  return out;
}
