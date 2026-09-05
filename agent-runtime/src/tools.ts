// Custom tools do ProspectorSiteAgent — ferramentas de arquivo SCOPED ao
// workspace do projeto + contexto do negócio. Usa a API oficial createTool
// (zod + lifecycle). Nada acessa fora do root do projeto.
import { z } from "zod";
import { createTool } from "@cline/sdk";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { resolve } from "node:path";

export interface BusinessContext {
  name?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  about?: string | null;
  services?: string[];
}

export interface ToolEnv {
  workspaceRoot: string;
  business: BusinessContext;
}

const MAX_FILE = 2_000_000;

function safeJoin(root: string, path: string): string | null {
  const clean = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  const abs = resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  if (/^\.env($|\.)/.test(clean)) return null;
  return abs;
}

function relOf(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

export function buildSiteTools(env: ToolEnv) {
  const root = env.workspaceRoot;

  const list = createTool({
    name: "list_files",
    description: "Lista os arquivos do projeto do site (workspace).",
    inputSchema: z.object({ path: z.string().optional().describe("subdiretório (default: raiz)") }),
    async execute(input) {
      const base = input.path ? safeJoin(root, input.path) : root;
      if (!base || !existsSync(base)) return JSON.stringify({ error: "diretório não existe" });
      const { readdirSync, statSync } = await import("node:fs");
      const out: string[] = [];
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            walk(full);
          } else if (e.isFile()) {
            out.push(relOf(root, full));
          }
        }
      };
      walk(base);
      return JSON.stringify(out.sort());
    },
  });

  const read = createTool({
    name: "read_file",
    description: "Lê o conteúdo de um arquivo do projeto (path relativo ao workspace).",
    inputSchema: z.object({ path: z.string().describe("caminho relativo, ex.: index.html") }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs || !existsSync(abs)) return JSON.stringify({ error: "arquivo não encontrado" });
      const content = readFileSync(abs, "utf8");
      if (content.length > MAX_FILE) return JSON.stringify({ error: "arquivo grande demais" });
      return content;
    },
  });

  const write = createTool({
    name: "write_file",
    description: "Cria ou sobrescreve um arquivo do projeto com conteúdo completo.",
    inputSchema: z.object({
      path: z.string().describe("caminho relativo"),
      content: z.string().describe("conteúdo completo do arquivo"),
    }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs) return JSON.stringify({ error: "caminho inválido (fora do workspace)" });
      if (input.content.length > MAX_FILE) return JSON.stringify({ error: "conteúdo grande demais" });
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, input.content, "utf8");
      return JSON.stringify({ ok: true, path: relOf(root, abs) });
    },
  });

  const edit = createTool({
    name: "edit_file",
    description: "Substitui um trecho exato em um arquivo (find deve existir literalmente).",
    inputSchema: z.object({
      path: z.string(),
      find: z.string(),
      replace: z.string(),
    }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs || !existsSync(abs)) return JSON.stringify({ error: "arquivo não encontrado" });
      const current = readFileSync(abs, "utf8");
      const idx = current.indexOf(input.find);
      if (idx === -1) return JSON.stringify({ error: "trecho find não encontrado no arquivo" });
      const next = current.slice(0, idx) + input.replace + current.slice(idx + input.find.length);
      if (next.length > MAX_FILE) return JSON.stringify({ error: "resultado grande demais" });
      writeFileSync(abs, next, "utf8");
      return JSON.stringify({ ok: true, path: relOf(root, abs) });
    },
  });

  const remove = createTool({
    name: "delete_file",
    description: "Remove um arquivo do projeto.",
    inputSchema: z.object({ path: z.string() }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs || !existsSync(abs)) return JSON.stringify({ error: "arquivo não encontrado" });
      rmSync(abs, { force: true });
      return JSON.stringify({ ok: true, path: input.path });
    },
  });

  const context = createTool({
    name: "get_site_context",
    description: "Retorna o contexto real do negócio/site (dados do cliente) para usar no conteúdo.",
    inputSchema: z.object({}),
    async execute() {
      return JSON.stringify(env.business, null, 2);
    },
  });

  return [list, read, write, edit, remove, context];
}

export type SiteToolSet = ReturnType<typeof buildSiteTools>;
