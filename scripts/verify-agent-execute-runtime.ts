import { materializeProjectFiles } from "../src/lib/agentProject";
import { fromSnapshot } from "../supabase/functions/_shared/agent-workspace";
import { StaticProjectRuntime } from "../supabase/functions/_shared/agent-execution";
import { normalizeSpec } from "../src/data/siteProjects";

async function main() {
  const spec = normalizeSpec({
    business: { name: "Clínica Bella Forma Estética", segment: "Clínicas", city: "Suzano", state: "SP" },
    design_system: {
      colors: { primary: "#7c2d12", on_primary: "#ffffff", secondary: "#431407", accent: "#c2410c", background: "#faf7f2", surface: "#ffffff", on_surface: "#1c1917", muted: "#78716c", border: "#e7e5e4" },
      typography: { heading_font: "Playfair Display", body_font: "Inter" },
      visual_style: "Estética premium com clima acolhedor.", layout_mood: "premium", layout_archetype: "luxury",
      hero_variant: "cinematic", card_style: "elevated", button_style: "solid", navigation_style: "minimal",
      cta_treatment: "band", footer_style: "editorial",
      motion: { reveal: true, staggerCards: true, hoverLift: true, imageZoom: true, smoothScroll: true },
    },
    sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "cta", type: "cta" }, { id: "contact", type: "contact" }],
    content: {
      hero: { title: "Estética de alto padrão em Suzano", subtitle: "Procedimentos personalizados.", primary_cta: "Agendar avaliação", primary_cta_type: "whatsapp", primary_cta_value: "5511999999999", image: { url: "https://img.example.com/a.jpg", alt: "sala de estética", isIllustrative: true } },
      services: { title: "Procedimentos", items: [{ title: "Botox", description: "Suaviza linhas." }, { title: "Limpeza de pele", description: "Renova." }] },
      cta: { title: "Agende sua avaliação", body: "Fale conosco." },
      contact: { title: "Contato", phone: "(11) 99999-0000", whatsapp: "(11) 99999-0000" },
      footer: { tagline: "Beleza com segurança" },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "5511999999999" }],
    seo: { title: "Clínica Bella Forma", description: "Estética em Suzano.", keywords: [] },
    pages: { home: true },
    navigation: [],
  } as never);

  console.log("=== materializar ===");
  const files = materializeProjectFiles(spec as never);
  console.log("arquivos:", Object.keys(files).length);

  console.log("\n=== runtime estático sobre workspace real ===");
  const ws = fromSnapshot(files);
  const rt = new StaticProjectRuntime("Clínica Bella Forma Estética");
  const res = await rt.build(ws);
  console.log("verdict:", res.verdict);
  console.log("errors:", JSON.stringify(res.errors.slice(0, 6)));

  const htmlPath = Object.keys(ws).find((p) => p.endsWith("index.html")) ?? "";
  console.log("\n=== conteúdo do index.html ===");
  console.log("bytes html:", (ws[htmlPath] ?? "").length);
  console.log("empresa no html:", (ws[htmlPath] ?? "").includes("Clínica Bella Forma"));

  console.log("\n" + (res.verdict === "ok" ? "PASS: workspace materializado valida no runtime" : "REVISAR"));
  process.exit(res.verdict === "ok" ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
