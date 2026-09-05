// E2E 5.26 — anexos reais no workspace:
// 1) imagem PNG anexada → Cline deve USAR no hero (evidência: <img data:...> no HTML)
// 2) arquivo .txt anexado → Cline deve RELATAR conteúdo real (evidência na resposta)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// PNG 1x1 vermelho (válido)
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64").toString("base64");
const txt = Buffer.from("Cliente: Academia Iron House — nota: prefere tom energético e moderno.").toString("base64");

const pid = `att-${Date.now()}`;
const site = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><title>Academia Iron</title></head><body>
<section class="hero"><h1>Academia Iron House</h1><p>Treine com energia.</p><a class="cta" href="https://wa.me/5511">Matricule-se</a></section>
</body></html>`,
  "src/site.css": ".hero{min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#111;color:#fff;font-family:sans-serif}",
  "src/site.json": JSON.stringify({ business: { name: "Academia Iron House", segment: "Academias" } }),
};

async function run(instruction: string, attachments: Array<{ name: string; mediaType: string; dataUrl: string }>) {
  const res = await fetch("http://127.0.0.1:8787/run", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, projectId: pid, files: site, context: { name: "Academia Iron House", segment: "Academias", city: "SP", state: "SP" }, attachments }),
  });
  return res.json();
}

async function main() {
  // Passo 1: usar a imagem anexada no hero (evidência real)
  const r1 = await run("Use a imagem anexada no hero do site. Leia o arquivo real em assets/ e coloque-a como <img> no HTML (embuta o data URL inline). Não invente dados.", [
    { name: "logo-academia.png", mediaType: "image/png", dataUrl: `data:image/png;base64,${png}` },
  ]);
  const files1 = (r1.files ?? {}) as Record<string, string>;
  const html1 = String(files1[Object.keys(files1).find((k) => k.endsWith("index.html")) ?? ""] ?? "");
  const imgUsed = /<img[^>]+src="data:image\/png;base64,/i.test(html1);
  const assetExists = Object.keys(files1).some((k) => k.startsWith("assets/") && k.endsWith(".png"));
  console.log("passo1: changed=", r1.changed, "| asset no workspace:", assetExists, "| img dataURL no html:", imgUsed);
  console.log("passo1 touched:", JSON.stringify(r1.touched ?? []));
  console.log("passo1 reply:", (r1.reply ?? "").slice(0, 300));

  // Passo 2: relatar conteúdo do .txt anexado (evidência real na resposta)
  const r2 = await run("Leia o arquivo anexado em assets/ (arquivo .txt) e relate seu CONTEÚDO real na resposta, em pt-BR.", [
    { name: "nota.txt", mediaType: "text/plain", dataUrl: `data:text/plain;base64,${txt}` },
  ]);
  const replied = ((r2.reply ?? "") + "\n" + (r2.reply ?? "")).toLowerCase();
  const relataConteudo = /energ[ée]tico|moderno|iron house/i.test(replied);
  console.log("\npasso2: changed=", r2.changed, "| relata conteúdo real:", relataConteudo);
  console.log("passo2 reply:", (r2.reply ?? "").slice(0, 400));

  rmSync(join(tmpdir(), "prospector-workspaces"), { recursive: true, force: true });
  const pass = assetExists && imgUsed && relataConteudo;
  console.log("\n" + (pass ? "PASS: anexos materializados, usados e relatados com evidência real" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
