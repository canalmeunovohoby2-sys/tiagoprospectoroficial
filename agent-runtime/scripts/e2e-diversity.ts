// E2E 5.26 — diversidade criativa entre gerações do MESMO segmento.
// Gera dois sites de barbearias (nomes/cidades diferentes) com o MESMO Cline
// Agent e a MESMA missão base (direção criativa = ponto de partida). Valida:
//  - ambos premium (Generation Gate ok, imagens, responsividade, CTA);
//  - diferenças REAIS entre os dois (paleta, tipografia, seções, composição)
//    — não são duas cópias do mesmo template.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { assertGenerationQuality } from "../src/generation-gate";
import { buildCreativeBrief, formatCreativeBrief } from "../src/creative-direction";

interface Biz { name: string; segment: string; city: string; state: string; phone: string; whatsapp: string; address: string; about: string; services: string[] }

const A: Biz = { name: "Barbearia Navalha Negra", segment: "Barbearia", city: "São Paulo", state: "SP", phone: "(11) 91111-1111", whatsapp: "5511911111111", address: "Rua Augusta, 1200", about: "Barbearia clássica com clima underground e cortes autorais.", services: ["Corte na tesoura", "Barba com toalha quente", "Coloração"] };
const B: Biz = { name: "Corte Imperial Barbearia", segment: "Barbearia", city: "Recife", state: "PE", phone: "(81) 92222-2222", whatsapp: "5581922222222", address: "Av. Boa Viagem, 800", about: "Barbearia sofisticada de bairro, tradição e atendimento de corte.", services: ["Corte degradê", "Barboterapia", "Sobrancelha"] };

function mission(b: Biz): string {
  const ctx = [
    `Empresa: ${b.name}`,
    `Segmento: ${b.segment}`,
    `Cidade: ${b.city}/${b.state}`,
    `Endereço: ${b.address}`,
    `Telefone: ${b.phone}`,
    `WhatsApp: ${b.whatsapp}`,
    `Sobre: ${b.about}`,
    `Serviços: ${b.services.join(", ")}`,
  ].join("\n");
  return `Crie do zero o site deste negócio (geração inicial). Você é o cérebro criativo: defina paleta, tipografia, layout, composição, imagens e efeitos SOB MEDIDA para ESTE negócio — cada site deve ter identidade própria (nunca o mesmo layout de outros projetos).

CONTEXTO REAL DO NEGÓCIO:
${ctx}

${formatCreativeBrief(buildCreativeBrief(b.name, b.segment))}

Regras: código 100% integral (<!doctype html> ao </html>, index.html + src/site.css + src/site.json válido), responsividade total sem overflow, imagens contextuais reais distintas (Unsplash), não invente dados, footer completo.`;
}

function featureSignature(files: FileMap): { palette: string[]; fonts: string[]; sections: string[]; headings: string[]; imgUrls: string[]; effects: string[] } {
  const htmlPath = Object.keys(files).find((k) => k.endsWith("index.html"));
  const cssPath = Object.keys(files).find((k) => k.endsWith("site.css"));
  const jsPath = Object.keys(files).find((k) => k.endsWith("main.js"));
  const html = htmlPath ? files[htmlPath] : "";
  const css = cssPath ? files[cssPath] : "";
  const js = jsPath ? files[jsPath] : "";
  const palette = [...new Set((css + " " + html).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].sort();
  const fonts = [...new Set((html.match(/family=[^:&"]+/gi) ?? []).map((f) => f.slice(7).split(":")[0].replace(/\+/g, " ").toLowerCase()))].sort();
  const sections = [...new Set((html.match(/<section[^>]*id="([^"]+)"/gi) ?? []).map((s) => (s.match(/id="([^"]+)"/)?.[1] ?? "")) )].filter(Boolean).sort();
  const headings = [...new Set((html.match(/<(h[12])[^>]*>([^<]{3,70})/gi) ?? []).map((h) => h.replace(/<[^>]+>/g, "").trim().toLowerCase()))].filter(Boolean).sort();
  const imgUrls = [...new Set((html.match(/src="(https:[^"]+)"/gi) ?? []).map((u) => u.replace(/src="/, "")))];
  const effectHints = ["backdrop-filter", "transition", "animation", "@keyframes", "clip-path", "transform: rotate", "hover"];
  const effects = effectHints.filter((e) => (css + js).toLowerCase().includes(e.toLowerCase()));
  return { palette, fonts, sections, headings, imgUrls, effects };
}

function gateOk(b: Biz, files: FileMap): boolean {
  return assertGenerationQuality(files, { segment: b.segment, name: b.name, businessHas: () => true }).ok;
}

async function generate(b: Biz, pid: string): Promise<{ files: FileMap; gate: boolean; reply: string; finishSkips?: number }> {
  const root = ensureWorkspaceDir(pid, {});
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: b,
    maxIterations: 60,
    mode: "generate",
    enableBrowser: true,
  });
  console.log(`\n=== GERANDO: ${b.name} (${b.city}) ===`);
  let out = await agent.runTask(mission(b));
  // Quality Gate pós-geração (mesmo fluxo do runtime): até 2 ciclos de correção.
  let files = readWorkspace(root);
  let okGate = gateOk(b, files);
  for (let g = 0; g < 2 && !okGate; g++) {
    const issues = assertGenerationQuality(files, { segment: b.segment, name: b.name, businessHas: () => true }).issues;
    console.log("gate correção:", issues.length, "problema(s)");
    out = await agent.runTask(`Antes de finalizar, corrija os problemas abaixo apontados pela revisão automática e verifique no navegador:\n${issues.map((i) => `- ${i}`).join("\n")}`, { continueSession: true });
    files = readWorkspace(root);
    okGate = gateOk(b, files);
  }
  cleanupWorkspace(pid);
  return { files, gate: okGate, reply: out.reply ?? "", finishSkips: out.finishSkips };
}

async function main() {
  const rA = await generate(A, "diversity-a");
  const rB = await generate(B, "diversity-b");

  const sA = featureSignature(rA.files);
  const sB = featureSignature(rB.files);

  const paletteDiff = JSON.stringify(sA.palette) !== JSON.stringify(sB.palette);
  const fontDiff = JSON.stringify(sA.fonts) !== JSON.stringify(sB.fonts);
  const sectionDiff = JSON.stringify(sA.sections) !== JSON.stringify(sB.sections);
  const headingDiff = JSON.stringify(sA.headings) !== JSON.stringify(sB.headings);
  const imgDiff = JSON.stringify(sA.imgUrls) !== JSON.stringify(sB.imgUrls);
  const distinct = paletteDiff || fontDiff || sectionDiff || headingDiff || imgDiff;

  console.log("\n===== COMPARAÇÃO (mesmo segmento: Barbearia) =====");
  console.log("A:", A.name, "| B:", B.name);
  console.log("paleta A:", sA.palette.join(" "));
  console.log("paleta B:", sB.palette.join(" "));
  console.log("fontes A:", sA.fonts.join(", "));
  console.log("fontes B:", sB.fonts.join(", "));
  console.log("seções A:", sA.sections.join(", "));
  console.log("seções B:", sB.sections.join(", "));
  console.log("efeitos A:", sA.effects.join(", "));
  console.log("efeitos B:", sB.effects.join(", "));
  console.log("imagens A:", sA.imgUrls.length, "distintas | imagens B:", sB.imgUrls.length, "distintas");
  console.log("headings A:", sA.headings.length, "| headings B:", sB.headings.length);
  console.log("gate A ok:", rA.gate, "| gate B ok:", rB.gate);

  const pass = rA.gate && rB.gate && distinct;
  console.log("\ndiferenças reais (paleta/fontes/seções/headings/imagens):", distinct);
  console.log("\n" + (pass ? "PASS: gerações do mesmo segmento são PREMIUM e VISUALMENTE DISTINTAS (sem template)" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
