// Validação integrada 5.14: agent-execute edita código → ProjectPreviewRuntime
// prepara o documento → o badge aparece no preview.
import { materializeProjectFiles } from "../src/lib/agentProject";
import { fromSnapshot } from "../supabase/functions/_shared/agent-workspace";
import { normalizeSpec } from "../src/data/siteProjects";
import { prepareProjectPreview } from "../src/lib/projectPreviewRuntime";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

async function main() {
  const spec = normalizeSpec({
    business: { name: "Clínica Bella Forma Estética", segment: "Clínicas", city: "Suzano", state: "SP" },
    design_system: {
      colors: { primary: "#7c2d12", on_primary: "#ffffff", secondary: "#431407", accent: "#c2410c", background: "#faf7f2", surface: "#ffffff", on_surface: "#1c1917", muted: "#78716c", border: "#e7e5e4" },
      typography: { heading_font: "Playfair Display", body_font: "Inter" },
      visual_style: "Estética premium.", layout_mood: "premium", layout_archetype: "luxury",
      hero_variant: "cinematic", card_style: "elevated", button_style: "solid", navigation_style: "minimal",
      cta_treatment: "band", footer_style: "editorial",
      motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
    },
    sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "cta", type: "cta" }, { id: "contact", type: "contact" }],
    content: {
      hero: { title: "Estética de alto padrão em Suzano", subtitle: "Procedimentos personalizados.", primary_cta: "Agendar", primary_cta_type: "whatsapp", primary_cta_value: "5511999999999", image: { url: "https://img.example.com/a.jpg", alt: "sala", isIllustrative: true } },
      services: { title: "Procedimentos", items: [{ title: "Botox", description: "Suaviza." }, { title: "Limpeza", description: "Renova." }] },
      cta: { title: "Agende", body: "Fale conosco." },
      contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
      footer: { tagline: "Beleza com segurança" },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
    seo: { title: "Clínica Bella", description: "Estética.", keywords: [] },
    pages: { home: true },
    navigation: [],
  } as never);

  const files = materializeProjectFiles(spec as never);
  const ws = fromSnapshot(files);

  // 1) Agente edita o código real
  console.log("=== 1) agent-execute edita o código ===");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({
      instruction: "Adicione no hero do index.html um selo .hero-badge 'Atendimento Premium' e o estilo no site.css. Não invente outros dados.",
      files: ws,
      context: { name: "Clínica Bella Forma Estética", segment: "Clínicas", city: "Suzano", state: "SP" },
      memory: [],
      runtime: "static",
    }),
  });
  const data = await res.json().catch(() => ({}));
  console.log("HTTP", res.status, "| changed:", data.changed, "| touched:", JSON.stringify(data.touched ?? []));
  if (data.status !== "ok" || !data.changed) { console.log("agente não alterou — REVISAR"); process.exit(1); }

  // 2) Runtime de preview prepara o documento a partir do código alterado
  console.log("\n=== 2) ProjectPreviewRuntime prepara documento do código ===");
  const edited = data.files as Record<string, string>;
  const prep = prepareProjectPreview(edited);
  console.log("preview ok:", prep.ok, "| errors:", JSON.stringify(prep.errors ?? []));
  const htmlHas = (prep.document ?? "").includes("hero-badge");
  const cssHas = JSON.stringify(edited).includes(".hero-badge");
  console.log("documento contém .hero-badge:", htmlHas);
  console.log("workspace css contém .hero-badge:", cssHas);

  const pass = prep.ok && htmlHas && cssHas;
  console.log("\n" + (pass ? "PASS: código editado pelo agente aparece no preview (CODE → PREVIEW)" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
