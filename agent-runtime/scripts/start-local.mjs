// Agent Runtime LOCAL — launcher oficial.
// Lê agent-runtime/.env.local (ou variáveis já no ambiente) e sobe o runtime em
// http://localhost:8787 SEM segredos globais: autentica o usuário pelo JWT do
// Supabase e resolve a IA do usuário via runtime-ai-config com o MESMO JWT.
//
// Uso:  npm run local   (em agent-runtime/)
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvFile(join(root, ".env.local"));
loadEnvFile(join(here, ".env.local"));

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`[agent-runtime-local] Falta a variável ${k}. Copie agent-runtime/.env.local.example para agent-runtime/.env.local e preencha.`);
    process.exit(1);
  }
}
process.env.AGENT_RUNTIME_LOCAL = "1";
process.env.PORT = process.env.PORT ?? "8787";
process.env.HOST = process.env.HOST ?? "127.0.0.1";
delete process.env.RUNTIME_GATEWAY_SECRET; // NUNCA roda com o secret global.
delete process.env.AGENT_TICKET_SECRET;     // LOCAL usa JWT do usuário.

const isWin = process.platform === "win32";
// No Windows/Node 22, spawn de um arquivo .cmd exige shell:true (correção do
// CVE-2024-27980). Sem shell, o Node lança "spawn EINVAL". Nos demais SOs,
// seguimos com shell:false (execução direta do binário tsx).
const bin = isWin ? join(root, "node_modules", ".bin", "tsx.cmd") : join(root, "node_modules", ".bin", "tsx");
console.log(`[agent-runtime-local] subindo em http://localhost:${process.env.PORT} (JWT auth; sem RUNTIME_GATEWAY_SECRET)`);
const child = spawn(bin, ["src/server.ts"], { cwd: root, env: process.env, stdio: "inherit", shell: isWin });
child.on("exit", (code) => process.exit(code ?? 1));
