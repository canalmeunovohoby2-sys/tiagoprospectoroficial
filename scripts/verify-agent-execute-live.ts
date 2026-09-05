// Valida agent-execute REAL (edge): a IA deve operar sobre os arquivos do
// projeto, alterando MÚLTIPLOS arquivos e passando no runtime estático.
import { materializeProjectFiles } from "../src/lib/agentProject";
import { fromSnapshot } from "../supabase/functions/_shared/agent-workspace";
import { normalizeSpec } from "../src/data/siteProjects";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

async function main() {
  const spec = normalizeSpec({
    business: { name: "Pet Care Banho e Tosa", segment: "Pet Shop", city: "Guarulhos", state: "SP" },
    design_system: {
      colors: { primary: "#1d4ed8", on_primary: "#ffffff", secondary: "#0f172a", accent: "#f59e0b", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#5b6b7c", border: "#e2e8f0" },
      typography: { heading_font: "Plus Jakarta Sans", body_font: "Inter" },
      visual_style: "Acolhedor e moderno.", layout_mood: "bold", layout_archetype: "service_focused",
      hero_variant: "split", card_style: "elevated", button_style: "solid", navigation_style: "minimal",
      cta_treatment: "band", footer_style: "multi_column",
      motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
    },
    sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "cta", type: "cta" }, { id: "contact", type: "contact" }],
    content: {
      hero: { title: "Banho e tosa com carinho", subtitle: "Cuidado profissional para o seu pet.", primary_cta: "Agendar", primary_cta_type: "whatsapp", primary_cta_value: "5511999999999", image: { url: "https://img.example.com/pet.jpg", alt: "cachorro no banho", isIllustrative: true } },
      services: { title: "Serviços", items: [{ title: "Banho & Tosa", description: "Completo." }, { title: "Hidratação", description: "Pelagem." }] },
      cta: { title: "Agende agora", body: "WhatsApp rápido." },
      contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
      footer: { tagline: "Amor em cada detalhe" },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
    seo: { title: "Pet Care", description: "Pet em Guarulhos.", keywords: [] },
    pages: { home: true },
    navigation: [],
  } as never);

  const files = materializeProjectFiles(spec as never);
  const ws = fromSnapshot(files);

  console.log("workspace inicial:", Object.keys(ws).length, "arquivos");
  const instruction = "Adicione no index.html um selo/badge de destaque no hero (ex.: 'Atendimento no mesmo dia') e, no src/site.css, um estilo .hero-badge com gradiente e cantos arredondados coerentes com a paleta. Não invente dados além do badge genérico.";
  console.log("instrução:", instruction.slice(0, 80), "…");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({
      instruction,
      files: ws,
      context: { name: "Pet Care Banho e Tosa", segment: "Pet Shop", city: "Guarulhos", state: "SP", whatsapp: "(11) 99999-0000" },
      memory: ["Usuário prefere composição sofisticada; hero atual aprovado."],
      runtime: "static",
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { console.log("não-JSON:", text.slice(0, 500)); process.exit(1); }
  console.log("HTTP", res.status, "| status:", data.status, "| model:", data.model);
  console.log("reply:", (data.reply ?? "").slice(0, 260));
  console.log("touched:", JSON.stringify(data.touched));
  console.log("errors:", JSON.stringify((data.errors ?? []).slice(0, 6)));
  console.log("changed:", data.changed);

  if (data.files && typeof data.files === "object") {
    const outWs = data.files as Record<string, string>;
    const htmlPath = Object.keys(outWs).find((p) => p.endsWith("index.html")) ?? "";
    const cssPath = Object.keys(outWs).find((p) => p.endsWith("site.css")) ?? "";
    console.log("\nhtml contém badge:", (outWs[htmlPath] ?? "").includes("hero-badge"));
    console.log("css contém .hero-badge:", (outWs[cssPath] ?? "").includes(".hero-badge"));
    const multi = data.touched?.length >= 2;
    const pass = res.status === 200 && data.status === "ok" && (outWs[htmlPath] ?? "").includes("hero-badge") && (outWs[cssPath] ?? "").includes(".hero-badge");
    console.log("\n" + (pass ? `PASS: agente editou ${data.touched?.length ?? 0} arquivo(s) reais` : "REVISAR"));
    process.exit(pass ? 0 : 2);
  } else {
    console.log("sem arquivos retornados");
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
