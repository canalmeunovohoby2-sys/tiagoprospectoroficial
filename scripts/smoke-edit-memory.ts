// Smoke do fluxo conversacional CONTÍNUO (memory + transcript) do edit-site.
// Simula: sofisticar -> aprovar hero -> mudar só os cards preservando a tipografia.
import { buildConversationContext, buildDesignMemory } from "../src/lib/aiEditContext";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const base = {
  business: { name: "Café do Bairro", segment: "Restaurantes", city: "Guarulhos", state: "SP" },
  design_system: {
    colors: { primary: "#9a3412", on_primary: "#ffffff", secondary: "#2b1004", accent: "#d97706", background: "#fdf6ec", surface: "#ffffff", on_surface: "#291407", muted: "#8a6a50", border: "#f0e0cd" },
    typography: { heading_font: "Fraunces", body_font: "Work Sans", heading_weight: "bold", heading_scale: "display" },
    visual_style: "Acolhedor e sensorial.", layout_mood: "bold", layout_archetype: "bold", hero_variant: "cinematic",
    card_style: "elevated", button_style: "accent", navigation_style: "minimal", cta_treatment: "immersive", footer_style: "dark",
    motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
  },
  pages: { home: true },
  navigation: [{ label: "Início", anchor: "top" }],
  sections: [{ id: "hero", type: "hero", order: 1 }, { id: "services", type: "services", order: 2 }, { id: "cta", type: "cta", order: 3 }, { id: "contact", type: "contact", order: 4 }],
  content: {
    hero: { title: "Café de verdade no seu bairro", subtitle: "Grãos selecionados e pão na chapa.", primary_cta: "Ver cardápio", primary_cta_type: "link" },
    services: { title: "No cardápio", items: [{ title: "Cafés especiais", description: "Métodos artesanais." }, { title: "Salgados", description: "Feitos na hora." }] },
    cta: { title: "Vem conhecer", body: "A gente te espera." },
    contact: { title: "Contato", phone: "(11) 90000-0000", whatsapp: "(11) 90000-0000" },
    footer: { tagline: "Feito com calma" },
  },
  calls_to_action: [{ label: "Ver cardápio", type: "whatsapp", value: "5511900000000" }],
  seo: { title: "Café do Bairro", description: "Café em Guarulhos.", keywords: [] },
};

type Turn = { role: "user" | "assistant"; text: string };

async function call(instruction: string, spec: unknown, turns: Turn[], memory: string[]) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/edit-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({
      spec,
      instruction,
      context: { name: "Café do Bairro", segment: "Restaurantes" },
      conversation: buildConversationContext(turns, { maxTurns: 12 }),
      memory: buildDesignMemory(memory ? [...turns].map((t) => ({ ...t })) : turns),
    }),
  });
  const data = await res.json().catch(() => ({}));
  const changed = JSON.stringify(data.spec ?? {}) !== JSON.stringify(spec);
  console.log(`\n>>> ${instruction}`);
  console.log(`HTTP ${res.status} | mode=${data.mode} | changed=${changed}`);
  console.log(`reply: ${(data.reply ?? "").slice(0, 260)}`);
  if (data.spec?.design_system) {
    const ds = data.spec.design_system;
    console.log(`hero=${ds.hero_variant} card=${ds.card_style} headingFont=${ds.typography?.heading_font}`);
  }
  return { spec: data.spec, changed, mode: data.mode, status: res.status };
}

let spec = base;
const turns: Turn[] = [];
const memory: string[] = [];

// Turno 1 — edit: sofisticar hero
let r = await call("Deixa a hero mais sofisticada, com composição editorial.", spec, turns, memory);
if (r.status === 200 && r.spec) { spec = r.spec; turns.push({ role: "user", text: "Deixa a hero mais sofisticada, com composição editorial." }, { role: "assistant", text: (r as { spec: unknown }).spec ? "" : "" }); }
const heroBefore = (spec as typeof base).design_system.hero_variant;

// Turno 2 — aprovou
await call("Gostei da hero, mantém ela como está.", spec, turns, memory);
turns.push({ role: "user", text: "Gostei da hero, mantém ela como está." }, { role: "assistant", text: "Ótimo, hero preservada." });
memory.push("Usuário aprovou a hero editorial — não alterar a hero.");

// Turno 3 — edit dependente: muda só os cards preservando tipografia/hero
r = await call("Agora deixa os cards de serviços mais premium, mas mantém a hero e a tipografia que aprovamos.", spec, turns, memory);
if (r.status === 200 && r.spec) {
  spec = r.spec;
  turns.push({ role: "user", text: "deixa os cards premium mantendo hero e tipografia." }, { role: "assistant", text: "Cards refinados." });
}
const heroAfter = (spec as typeof base).design_system.hero_variant;
const fontAfter = (spec as typeof base).design_system.typography.heading_font;

const pass = heroBefore === heroAfter && fontAfter === "Fraunces";
console.log(`\n${pass ? "PASS: continuidade preservada (hero e tipografia intactos)" : `REVISAR: hero mudou (${heroBefore}->${heroAfter})`}`);
process.exit(pass ? 0 : 2);
