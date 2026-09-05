// Smoke do fluxo conversacional do edit-site.
// Roda com: npx tsx scripts/smoke-edit-chat.ts
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const SPEC = {
  business: { name: "Clínica Aurora", segment: "Clínicas", city: "Suzano", state: "SP" },
  design_system: {
    colors: { primary: "#0f766e", on_primary: "#ffffff", secondary: "#134e4a", accent: "#b45309", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", border: "#e2e8f0" },
    typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter", heading_weight: "bold", heading_scale: "large" },
    visual_style: "Limpo e acolhedor.",
    layout_mood: "premium", layout_archetype: "service_focused", hero_variant: "split",
    card_style: "bordered", button_style: "solid", navigation_style: "minimal",
    cta_treatment: "band", footer_style: "editorial",
    motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
  },
  pages: { home: true },
  navigation: [{ label: "Início", anchor: "top" }, { label: "Serviços", anchor: "services" }],
  sections: [{ id: "hero", type: "hero", order: 1 }, { id: "services", type: "services", order: 2 }, { id: "cta", type: "cta", order: 3 }, { id: "contact", type: "contact", order: 4 }],
  content: {
    hero: { title: "Ortopedia que cuida de você", subtitle: "Especialistas em joelho e coluna.", primary_cta: "Agendar avaliação", primary_cta_type: "whatsapp", primary_cta_value: "5511999999999" },
    services: { title: "Serviços", items: [{ title: "Consulta", description: "Avaliação completa." }] },
    cta: { title: "Fale conosco", body: "Agende sua consulta." },
    contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
    footer: { tagline: "Cuidado que respeita seu tempo" },
  },
  calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
  seo: { title: "Clínica Aurora", description: "Clínica ortopédica em Suzano.", keywords: [] },
};

async function call(instruction: string, conversation: string[] = []) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/edit-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ spec: SPEC, instruction, context: { name: "Clínica Aurora", segment: "Clínicas" }, conversation }),
  });
  const data = await res.json().catch(() => ({}));
  const specStr = JSON.stringify(data.spec ?? {});
  const changed = specStr !== JSON.stringify(SPEC);
  console.log(`\n=== "${instruction}"`);
  console.log(`HTTP ${res.status} | mode=${data.mode} | changed=${changed}`);
  console.log(`reply: ${(data.reply ?? "").slice(0, 220)}`);
  return { changed, mode: data.mode, status: res.status };
}

const q1 = await call("o que vocês acham de adicionar um depoimento? ainda não temos.", ["qualidade: o que posso melhorar?"]);
const q2 = await call("obrigado!", []);
const edit1 = await call("muda a cor principal para um azul mais escuro, tipo #1e3a5f", []);
const chat1 = await call("bom dia! tudo certo?", []);

const pass = q1.changed === false && q1.status === 200 && q2.changed === false && q2.status === 200 && edit1.changed === true && edit1.status === 200 && chat1.changed === false && chat1.status === 200;
console.log(`\n${pass ? "PASS: conversa não altera; edição altera" : "REVISAR: fluxo de intenção com falha (ver 503/erros)"}`);
process.exit(pass ? 0 : 2);
