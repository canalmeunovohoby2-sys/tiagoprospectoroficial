// TESTE 4 (5.19): gerar 2 nichos e comparar arquitetura/direção real.
import { cleanupWorkspace } from "../src/workspace";

async function generate(pid: string, ctx: Record<string, unknown>): Promise<Record<string, string>> {
  const res = await fetch("http://127.0.0.1:8787/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: pid, context: ctx }),
  });
  const d = (await res.json()) as { status: string; files?: Record<string, string> };
  return d.files ?? {};
}

function sigOf(files: Record<string, string>): string {
  const html = files[Object.keys(files).find((n) => n.endsWith("index.html")) ?? ""] ?? "";
  const heroClass = html.match(/<section[^>]*class="([^"]*hero[^"]*)"/i)?.[1] ?? "";
  const fonts = [...new Set((html.match(/font-family:[^;"]+/gi) ?? []).map((s) => s.split(":")[1].trim()))];
  const sections = (html.match(/<section[^>]*id="([^"]+)"/gi) ?? []).map((s) => s.match(/id="([^"]+)"/)?.[1]).filter(Boolean);
  const palette = (html.match(/#[0-9a-fA-F]{6}/g) ?? []).slice(0, 6);
  return JSON.stringify({ heroClass, fonts: fonts.slice(0, 4), sections: sections.slice(0, 10), palette });
}

async function main() {
  cleanupWorkspace("nicho-pet");
  cleanupWorkspace("nicho-rest");
  console.log("gerando Pet Shop…");
  const pet = await generate("nicho-pet", { name: "Pet Shop Amigo Fiel", segment: "Pet Shop", city: "Guarulhos", state: "SP", services: ["Banho e Tosa", "Hidratação"] });
  console.log("gerando Restaurante…");
  const rest = await generate("nicho-rest", { name: "Cantina do Nonno", segment: "Restaurantes", city: "São Paulo", state: "SP", services: ["Massas artesanais", "Reserva de mesas"] });

  const sPet = sigOf(pet);
  const sRest = sigOf(rest);
  console.log("\n=== PET ===\n", sPet);
  console.log("\n=== REST ===\n", sRest);
  const sameHero = JSON.parse(sPet).heroClass === JSON.parse(sRest).heroClass && JSON.stringify(JSON.parse(sPet).palette) === JSON.stringify(JSON.parse(sRest).palette);
  console.log("\nmesma direção (hero/paleta):", sameHero);
  cleanupWorkspace("nicho-pet");
  cleanupWorkspace("nicho-rest");
  console.log(sameHero ? "REVISAR: nichos parecidos" : "PASS: dois nichos com direções diferentes");
  process.exit(sameHero ? 2 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
