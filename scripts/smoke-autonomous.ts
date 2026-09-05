// Valida o ciclo autônomo do edit-site em produção:
// - pedido AMPLO ("deixa mais premium") → múltiplas passadas + qa_score alto;
// - pedido CIRÚRGICO ("troca a cor") → mudança pontual.
import { classifyAmplitude } from "../supabase/functions/_shared/design-intent";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const spec = {
  business: { name: "Clínica Aurora", segment: "Clínicas", city: "Suzano", state: "SP" },
  design_system: {
    colors: { primary: "#0f766e", on_primary: "#ffffff", secondary: "#134e4a", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
    typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter", heading_weight: "bold", heading_scale: "large" },
    visual_style: "Limpo e acolhedor.", layout_mood: "premium", layout_archetype: "service_focused", hero_variant: "split",
    card_style: "bordered", button_style: "solid", navigation_style: "minimal", cta_treatment: "band", footer_style: "simple",
    motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
  },
  pages: { home: true },
  navigation: [{ label: "Início", anchor: "top" }, { label: "Serviços", anchor: "services" }],
  sections: [
    { id: "hero", type: "hero", order: 1 },
    { id: "services", type: "services", order: 2 },
    { id: "cta", type: "cta", order: 3 },
    { id: "contact", type: "contact", order: 4 },
  ],
  content: {
    hero: { title: "Ortopedia que cuida de você", subtitle: "Especialistas em joelho e coluna.", primary_cta: "Agendar avaliação", primary_cta_type: "whatsapp", primary_cta_value: "5511999999999" },
    services: { title: "Serviços", items: [{ title: "Consulta", description: "Avaliação completa." }, { title: "Fisioterapia", description: "Reabilitação." }] },
    cta: { title: "Fale conosco", body: "Agende sua consulta." },
    contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
    footer: { tagline: "Cuidado que respeita seu tempo" },
  },
  calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
  seo: { title: "Clínica Aurora", description: "Clínica ortopédica em Suzano.", keywords: [] },
};

async function call(instruction: string) {
  const started = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/edit-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ spec, instruction, context: { name: "Clínica Aurora", segment: "Clínicas" }, conversation: [], memory: [] }),
  });
  const data = await res.json().catch(() => ({}));
  const ms = Date.now() - started;
  const changed = JSON.stringify(data.spec ?? {}) !== JSON.stringify(spec);
  const ds = (data.spec?.design_system ?? {});
  const sections = (data.spec?.sections ?? []).map((x: { type: string }) => x.type);
  return { status: res.status, mode: data.mode, changed, qa: data.qa_score, passes: data.passes_used, ms, reply: (data.reply ?? "").slice(0, 160), hero: ds.hero_variant, footer: ds.footer_style, sections, colors: ds.colors?.primary };
}

console.log("classifyAmplitude('deixa o site mais premium') =", classifyAmplitude("deixa o site mais premium"));
console.log("classifyAmplitude('troca a cor para azul') =", classifyAmplitude("troca a cor para azul"));

const broad = await call("deixa o site mais premium, com visual sofisticado");
console.log("\n=== AMPLO: 'deixa o site mais premium' ===");
console.log("status", broad.status, "| mode", broad.mode, "| changed", broad.changed, "| qa_score", broad.qa, "| passes", broad.passes, "|", broad.ms + "ms");
console.log("reply:", broad.reply);
console.log("hero:", broad.hero, "| footer:", broad.footer, "| sections:", JSON.stringify(broad.sections));

const surgical = await call("troca a cor principal para um azul marinho #1e3a5f");
console.log("\n=== CIRÚRGICO: 'troca a cor' ===");
console.log("status", surgical.status, "| changed", surgical.changed, "| passes", surgical.passes, "|", surgical.ms + "ms");
console.log("nova cor:", surgical.colors);

const pass = broad.status === 200 && broad.changed === true && surgical.status === 200 && surgical.changed === true && surgical.colors === "#1e3a5f";
console.log("\n" + (pass ? "PASS: ciclo autônomo + edição cirúrgica funcionando" : "REVISAR"));
process.exit(pass ? 0 : 2);
