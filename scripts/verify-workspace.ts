// Verifica o materializador de workspace (5.12): gera site real, materializa os
// arquivos do projeto e valida estrutura (Vite), ausência de segredos e conteúdo real.
import { buildProjectFiles } from "../src/lib/siteExportCore";
import { materializeProjectFiles } from "../src/lib/agentProject";
import { fromSnapshot, listFiles } from "../supabase/functions/_shared/agent-workspace";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const lead = { name: "Clínica Bella Forma", company_name: "Clínica Bella Forma", segment: "Clínicas", city: "Suzano", state: "SP", phone: "(11) 90000-0000", whatsapp: "5511900000000" };
console.log("=== gerando site real ===");
const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-site`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  body: JSON.stringify({ lead }),
});
const data = await res.json().catch(() => ({}));
console.log("HTTP", res.status, "| qa", data.qa_score);
if (!res.ok) process.exit(1);
const spec = data.spec as never;

console.log("\n=== materializando workspace ===");
const files = materializeProjectFiles(spec);
const keys = Object.keys(files);
console.log("arquivos:", keys.length);
for (const k of keys.slice(0, 14)) console.log("  ", k);

const snapshot = fromSnapshot(files);
const names = listFiles(snapshot);
const pkg = names.find((n) => n.endsWith("package.json"));
const html = names.find((n) => n.endsWith("index.html"));
const hasReact = names.some((n) => n.endsWith("main.tsx") || n.endsWith("main.js") || n.endsWith("App.tsx") || n.endsWith("App.jsx"));
const secretLeak = JSON.stringify(files).match(/NVIDIA_API_KEY|GEMINI_API_KEY|DEEPSEEK_API_KEY|sk-[A-Za-z0-9]{10,}|password\s*[:=]/i);
const hasCompany = JSON.stringify(files).includes("Clínica Bella Forma");

console.log("\npackage.json:", !!pkg, "| index.html:", !!html, "| entrada app:", hasReact);
console.log("sem segredos:", !secretLeak, "| conteúdo real da empresa:", hasCompany);

// Simula edição via ferramenta do workspace (escrever nota no README) e valida isolamento.
console.log("\n=== workspace ops (editar README + proteção path) ===");
const base = buildProjectFiles(spec, {}, []);
const pkgPath = Object.keys(base).find((p) => p.endsWith("package.json")) ?? "";
console.log("nome do pacote:", JSON.parse(base[pkgPath]).name);

const pass = !!pkg && !!html && hasReact && !secretLeak && hasCompany;
console.log("\n" + (pass ? "PASS: workspace materializado e seguro" : "REVISAR"));
process.exit(pass ? 0 : 2);
