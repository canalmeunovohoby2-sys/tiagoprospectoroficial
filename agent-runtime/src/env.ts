// Carregador de ambiente do Agent Runtime.
//
// PROBLEMA REAL: o runtime sobe com `node dist/server.js` e NÃO carregava
// `.env`/`.env.local` — qualquer chave local era ignorada (hasKey:false).
// Este módulo é importado PRIMEIRO no server.ts: carrega os arquivos do cwd
// sem NUNCA sobrescrever variáveis já definidas no processo e sem expor valores.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function applyEnvFile(file: string): void {
  try {
    if (!existsSync(file)) return;
    const text = readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] !== undefined) continue; // ambiente do processo tem precedência
      process.env[key] = value;
    }
  } catch {
    /* best-effort: ambiente é melhoria, nunca bloqueia o boot */
  }
}

const cwd = process.cwd();
applyEnvFile(join(cwd, ".env"));
applyEnvFile(join(cwd, ".env.local"));

// Diagnóstico MASCARADO (nunca imprime a chave): indica formato inválido antes
// de qualquer chamada ao modelo, para o erro não virar "sem atividade".
try {
  const key = process.env.DEEPSEEK_API_KEY ?? "";
  if (key) {
    const ok = key.startsWith("sk-");
    console.log(
      `[runtime] DEEPSEEK_API_KEY presente (${key.length} chars) — formato ${ok ? "ok" : "INVÁLIDO (deve começar com sk-)"}`,
    );
  }
} catch {
  /* noop */
}
