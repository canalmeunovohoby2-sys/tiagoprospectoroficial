// Railway build: gera dist/server.js (entry ESM que carrega o runtime real via
// tsx — tsx é dependência de runtime). Mantém ESM/imports sem alterar a lógica.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
mkdirSync(dist, { recursive: true });

const entry = `// Gerado pelo build (Railway). Executa o Agent Runtime original via tsx loader.
import "tsx/esm";
await import(new URL("../src/server.ts", import.meta.url).href);
`;
writeFileSync(join(dist, "server.js"), entry, "utf8");
console.log("dist/server.js gerado em", join(dist, "server.js"));
