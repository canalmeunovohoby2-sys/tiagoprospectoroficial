// Custom tools do ProspectorSiteAgent — ferramentas de arquivo SCOPED ao
// workspace do projeto + contexto do negócio. Usa a API oficial createTool
// (zod + lifecycle). Nada acessa fora do root do projeto.
import { z } from "zod";
import { createTool } from "@cline/sdk";
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname, relative, sep } from "node:path";
import { resolve } from "node:path";
import { classifyTask } from "./visual-task.js";
import { evaluateLogoQuality } from "./branding.js";
import { applyBrandCmd, loadBrandStateFromFiles, createBrandStudio, brandSnapshot, type BrandCmd, type BrandStudioSnapshot } from "./branding-state.js";
import { resolveBrandIdentity, runBrandMockup, mockupContext, readMockupResult, readMockupHistory } from "./mockup-integration.js";
import { createArtifactStore } from "./artifact-store.js";
import { generateAndPersistBrandPdf, writeBrandPdfManifest, loadBrandMockups, loadBrandPdf, PDF_RESULT_REL, PDF_HISTORY_REL } from "./brand-pdf.js";
import { generateAndPersistBrandPackage, writeBrandPackageManifest, PACKAGE_RESULT_REL, PACKAGE_HISTORY_REL } from "./brand-package.js";
import { generateAndPersistSiteVideo, writeSiteVideoManifest, VIDEO_RESULT_REL, VIDEO_HISTORY_REL } from "./site-video.js";

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
  projectId?: string;
  /** mode da execução: "generate" recebe uma toolset enxuta (sem identidade/deliverables). */
  mode?: "edit" | "generate";
}

// Tarefas SÓ de identidade/deliverables — NÃO devem rodar durante a GERAÇÃO de um
// site (evita o agente criar identidade visual standalone e inflar/atrasar a geração).
const GENERATE_EXCLUDED_TOOLS = new Set(["branding", "mockup", "brand_pdf", "brand_package", "site_video"]);

function countOccurrences(str: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  for (;;) {
    const found = str.indexOf(needle, pos);
    if (found === -1) break;
    count++;
    pos = found + needle.length;
  }
  return count;
}

function nthIndexOf(str: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    const found = str.indexOf(needle, idx + 1);
    if (found === -1) return -1;
    idx = found;
  }
  return idx;
}

const MAX_FILE = 2_000_000;
// FASE 7 — limite real de arquivos do workspace (evita criação infinita/acidental).
const MAX_TOTAL_FILES = 400;
// Limite de itens devolvidos por list_files (evita payload gigante ao modelo).
const LIST_FILES_LIMIT = 200;
// Arquivos ESTRUTURAIS do site que não podem ser excluídos por delete_file.
const CRITICAL_SITE_FILES = new Set(["index.html", "src/site.css", "src/main.js", "src/site.json", "package.json"]);
// Extensões de texto legível (podem ser devolvidas como conteúdo).
const TEXT_EXT = new Set(["html", "htm", "css", "js", "mjs", "cjs", "jsx", "ts", "tsx", "json", "svg", "md", "txt", "xml", "webmanifest", "map", "yml", "yaml", "toml", "csv"]);
// Extensões binárias/asset: read_file devolve METADADOS (nunca conteúdo bruto/base64).
const BINARY_EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  pdf: "application/pdf", zip: "application/zip", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
};

function countWorkspaceFiles(root: string): number {
  let count = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  };
  try { walk(root); } catch { /* noop */ }
  return count;
}

function safeJoin(root: string, path: string): string | null {
  const clean = String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null;
  const abs = resolve(root, ...parts);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  // FASE 7 — bloqueia .env/credenciais em QUALQUER nível (não apenas na raiz).
  if (parts.some((s) => /^\.env($|\.)/i.test(s))) return null;
  return abs;
}

function relOf(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

// Caminho absoluto (POSIX `/...` ou Windows `C:\...` / `\\`) — nunca aceito nas
// ferramentas de arquivo (devem ser sempre relativos ao workspace).
function isAbsoluteInput(p: unknown): boolean {
  return /^(?:[A-Za-z]:[\\/]|[\\/])/.test(String(p ?? "").trim());
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
      const files = out.sort();
      if (files.length > LIST_FILES_LIMIT) {
        return JSON.stringify({
          files: files.slice(0, LIST_FILES_LIMIT),
          total: files.length,
          truncated: true,
          note: `Listando ${LIST_FILES_LIMIT} de ${files.length} arquivos. Use list_files com "path" num subdiretório específico para ver o restante.`,
        });
      }
      return JSON.stringify(files);
    },
  });

  const read = createTool({
    name: "read_file",
    description: "Lê o conteúdo de um arquivo de TEXTO do projeto (path relativo ao workspace). Para imagens/binários devolve apenas metadados.",
    inputSchema: z.object({ path: z.string().describe("caminho relativo, ex.: index.html") }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs || !existsSync(abs)) return JSON.stringify({ error: "arquivo não encontrado" });
      const content = readFileSync(abs, "utf8");
      if (content.length > MAX_FILE) return JSON.stringify({ error: "arquivo grande demais" });
      const clean = String(input.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      const ext = (clean.split(".").pop() ?? "").toLowerCase();
      const mime = BINARY_EXT_MIME[ext];
      // Binário por extensão OU conteúdo base64/dataURL (anexo) → metadados, nunca
      // o texto gigante. Arquivos de texto conhecidos nunca passam por aqui.
      const looksBase64 = !TEXT_EXT.has(ext) && (
        /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(content.slice(0, 64)) ||
        (content.length > 2048 && /^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 400)))
      );
      if (mime || looksBase64) {
        let bytes = content.length;
        try { bytes = statSync(abs).size; } catch { /* mantém content.length */ }
        return JSON.stringify({
          path: clean,
          kind: "binary",
          mimeType: mime ?? "application/octet-stream",
          bytes,
          note: `Conteúdo binário/anexo NÃO é retornado como texto (evita payload gigante). Referencie o caminho no código, ex.: <img src="${clean}"> ou url("./${clean}").`,
        });
      }
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
      if (!existsSync(abs) && countWorkspaceFiles(root) >= MAX_TOTAL_FILES) {
        return JSON.stringify({ error: `limite de ${MAX_TOTAL_FILES} arquivos do workspace atingido — remova arquivos obsoletos antes de criar novos.` });
      }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, input.content, "utf8");
      return JSON.stringify({ ok: true, path: relOf(root, abs) });
    },
  });

  const edit = createTool({
    name: "edit_file",
    description:
      "Substitui um trecho EXATO e ÚNICO em um arquivo (alteração localizada; nunca reescreve o arquivo inteiro). Se o trecho aparecer mais de uma vez, a edição é RECUSADA por ambiguidade — inclua mais contexto/âncora estrutural ao redor do alvo para torná-lo único ou informe occurrence (1..N). Para trocar imagem/texto/ícone, altere SOMENTE o trecho do alvo e preserve CSS/tema/classes existentes.",
    inputSchema: z.object({
      path: z.string(),
      find: z.string().describe("trecho exato e ÚNICO a localizar (inclua contexto/âncora ao redor do alvo)"),
      replace: z.string(),
      occurrence: z.number().int().positive().optional().describe("Qual ocorrência (1..N) quando o trecho se repete; sem ele, o trecho precisa ser único"),
    }),
    async execute(input) {
      const abs = safeJoin(root, input.path);
      if (!abs || !existsSync(abs)) return JSON.stringify({ error: "arquivo não encontrado" });
      const current = readFileSync(abs, "utf8");
      const total = countOccurrences(current, input.find);
      if (total === 0) return JSON.stringify({ error: "trecho find não encontrado no arquivo" });
      let idx: number;
      if (typeof input.occurrence === "number" && input.occurrence >= 1) {
        if (input.occurrence > total) return JSON.stringify({ error: `find aparece ${total}× ; occurrence=${input.occurrence} é inválido` });
        idx = nthIndexOf(current, input.find, input.occurrence);
      } else if (total > 1) {
        return JSON.stringify({ error: `trecho find é AMBÍGUO: aparece ${total}× no arquivo. Inclua mais contexto/âncora para torná-lo único ou use occurrence (1..${total}).` });
      } else {
        idx = current.indexOf(input.find);
      }
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
      const clean = String(input.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (CRITICAL_SITE_FILES.has(clean)) {
        return JSON.stringify({ error: `"${clean}" é um arquivo ESTRUTURAL do site e não pode ser excluído. Use edit_file para alterar/remover apenas o conteúdo necessário (não apague o arquivo inteiro).` });
      }
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

  // IMAGE PIPELINE (FASE 6): gera ImageIntent a partir da direção/negócio, executa a
  // pesquisa existente, extrai e seleciona candidatos (rejeitando repetidos) sem
  // fabricar URL. Retorna sugestão para o agente aplicar; verificação fica no browser.
  const imagePlan = createTool({
    name: "image_plan",
    description:
      "Planeja uma IMAGEM contextual para o projeto (ImageIntent → pesquisa → candidatos → seleção), evitando repetir imagens já usadas. " +
      "Informe o papel/composição (hero/service/product/editorial/background/detail/testimonial/location). Retorna a intenção, a(s) query(ies), os candidatos de imagem e a seleção. " +
      "Use para escolher uma imagem com direção criativa (não 'nicho genérico'). NÃO fabrica URL; se não houver candidato verificável, informe honestamente.",
    inputSchema: z.object({
      role: z.enum(["hero", "service", "product", "editorial", "background", "detail", "testimonial", "location"]),
    }),
    async execute(input) {
      const { planImage, defaultImageSearch } = await import("./image-pipeline.js");
      const { collectImageInventory } = await import("./image-inventory.js");
      const files = readFilesRec(root);
      const used = new Set(collectImageInventory(files).map((r) => r.url));
      const ctx = {
        businessName: env.business?.name ?? "",
        segment: env.business?.segment ?? "",
        city: env.business?.city ?? "",
        positioning: env.business?.about ?? "",
      };
      const plan = await planImage(ctx, input.role, defaultImageSearch, used);
      const lines: string[] = [];
      lines.push(`IMAGE INTENT (${input.role})`);
      lines.push(`sujeito: ${plan.intent.subject}`);
      lines.push(`mood: ${plan.intent.mood} | tratamento: ${plan.intent.treatment} | aspect: ${plan.intent.aspectRatio ?? "auto"}`);
      lines.push(`evitar: ${plan.intent.avoid.join("; ")}`);
      lines.push(`query: ${plan.query}`);
      lines.push(`candidatos encontrados: ${plan.candidates.length}`);
      for (const c of plan.candidates) {
        lines.push(`- [${c.rejected ? "rejeitado" : "candidato"}] relevance ${c.relevance.toFixed(2)} · URL: ${c.url.slice(0, 90)}${c.rejectionReason ? " · " + c.rejectionReason : ""}`);
      }
      if (plan.selection.candidate) {
        lines.push(`\nSELECIONADO: ${plan.selection.candidate.url}`);
        lines.push(`motivo: ${plan.selection.reason}`);
      } else {
        lines.push(`\nNenhum candidato verificável (rejeitados: ${plan.selection.rejectedCount}). ${plan.selection.reason}`);
      }
      return lines.join("\n");
    },
  });

  // BRANDING STUDIO (FASE 9): estado persistente + SVGs reais no workspace.
  // Aplica um comando (create/select/reject/revert/edit*) e devolve o snapshot
  // (conceitos, seleção, versões, variações, identidade) para preview/render.
  const branding = createTool({
    name: "branding",
    description:
      "Executa o Branding Studio: cria projeto de identidade (briefing livre), seleciona/rejeita conceito, edita tipografia/paleta/espessura (não-destrutivo) ou reverte versão. " +
      "Persiste brand-state.json + assets/brand/*.svg no workspace (fonte de verdade, recupera ao reabrir). Retorna o snapshot completo (conceitos, seleção, versões, variações SVG, identidade) para o preview real.",
    inputSchema: z.object({
      command: z.enum(["create", "select", "reject", "revert", "editTypography", "editPalette", "editThickness"]),
      briefing: z.string().optional().describe("para command=create (briefing/pedido do usuário)"),
      conceptId: z.string().optional(),
      palette: z.object({ primary: z.string(), secondary: z.string(), accent: z.string(), background: z.string(), foreground: z.string() }).optional(),
      typography: z.object({ heading: z.string().optional(), body: z.string().optional(), weights: z.string().optional() }).optional(),
      thickness: z.number().optional(),
    }),
    async execute(input) {
      const files = readFilesRec(root);
      let state = loadBrandStateFromFiles(files);
      const name = files["brand-state.json"] ? "" : (input.briefing ?? "").split(/\r?\n/)[0]?.slice(0, 40) || "Marca";
      const cmd: BrandCmd =
        input.command === "create" ? { op: "create", briefing: input.briefing ?? "" }
          : input.command === "select" ? { op: "select", conceptId: input.conceptId ?? "1" }
            : input.command === "reject" ? { op: "reject", conceptId: input.conceptId ?? "3" }
              : input.command === "revert" ? { op: "revert" }
                : input.command === "editTypography" ? { op: "editTypography", heading: input.typography?.heading, body: input.typography?.body, weights: input.typography?.weights }
                  : input.command === "editPalette" ? { op: "editPalette", palette: input.palette ?? { primary: "#111", secondary: "#666", accent: "#f90", background: "#fff", foreground: "#111" } }
                    : { op: "editThickness", factor: input.thickness ?? 1 };

      let snapshot: BrandStudioSnapshot;
      if (input.command === "create" && !state) {
        state = createBrandStudio(input.briefing ?? "", name);
        const res = applyBrandCmd(state, { op: "create", briefing: input.briefing ?? "", name }, name);
        snapshot = res.snapshot;
        for (const f of res.files) writeFileSync(join(root, f.path), f.content);
      } else {
        if (!state) return "branding: projeto ainda não criado — use command=create com (briefing).";
        const base = state;
        const res = applyBrandCmd(base, cmd, name);
        snapshot = res.snapshot;
        for (const f of res.files) writeFileSync(join(root, f.path), f.content);
      }

      const lines: string[] = [];
      lines.push(`BRANDING STUDIO — ${snapshot.name}`);
      lines.push(`Conceitos: ${snapshot.concepts.map((c) => `${c.id}:${c.name}${snapshot.selectedConceptId === c.id ? " ✓" : snapshot.rejected.includes(c.id) ? " ✗" : ""}`).join(" | ")}`);
      lines.push(`Selecionado: ${snapshot.selectedConceptId ?? "—"} | Versão atual: ${snapshot.currentVersionId ?? "—"} | Anterior: ${snapshot.previousVersionId ?? "—"}`);
      lines.push(`Paleta: ${snapshot.palette.primary} | Tipografia: ${snapshot.typography.heading} ${snapshot.typography.weights}`);
      lines.push(`Construção: ${snapshot.construction.constructionLogic}`);
      // GATE DE QUALIDADE da marca (anti-genérica): só aceita como final o que passar.
      const chosen = snapshot.concepts.find((c) => c.id === snapshot.selectedConceptId);
      const q = chosen && snapshot.variants?.primary ? evaluateLogoQuality(snapshot.variants.primary, { type: chosen.type }) : null;
      if (q) lines.push(`Crítica de marca (gate): ${q.ok ? "APROVADA" : "REVER, refine antes de finalizar"} · score ${q.score.toFixed(2)}${q.critiques.length ? " · " + q.critiques.join("; ") : ""}`);
      return lines.join("\n");
    },
  });

  // MOCKUP MASTER (FASE 10.10): liga a identidade já criada no Branding Studio ao
  // PSD Master real (mesmo agente, mesmo cérebro). Consome brand-state.json +
  // assets/brand/*.svg do workspace (NÃO gera outra logo / não inventa cores),
  // aplica identidade nas aplicações selecionadas, exporta os rasters reais das
  // camadas modificadas e persiste resultado + histórico no workspace. Nunca
  // sobrescreve o Master; não cria mockup falso (sem compositor do PDF).
  const mockup = createTool({
    name: "mockup",
    description:
      "Gera os MOCKUPS da identidade já aprovada no Branding Studio, aplicando-a no PSD Master real (fonte imutável). " +
      "Se `applications` não vier, usa `selectBrandApplications` com o contexto real (papelaria/restaurante/tecnologia/escritório). " +
      "Rasteriza a logo (primary.svg) com encaixe contain/cover, aplica cores primária/secundária/apontamento nas camadas de cor, exporta os PNGs reais das camadas modificadas e persiste o resultado + histórico no workspace. " +
      "Retorna o estado (aplicadas/não suportadas, PSD derivado, previews, camadas alteradas, persisted). Pode trocar a variação da logo (logoSvg) ou as cores (colors) sem destruir versões anteriores (nenhum PSD gerado é silenciosamente sobrescrito).",
    inputSchema: z.object({
      action: z.enum(["generate", "status", "history"]).default("generate"),
      applications: z.array(z.string()).optional().describe("aplicações a aplicar (ex.: BC, A4, Mug). Se ausente → seleção contextual"),
      logoSvg: z.string().optional().describe("SVG da logo (outra variação) — default: primary.svg do workspace"),
      colors: z.object({ primary: z.string().optional(), secondary: z.string().optional(), accent: z.string().optional() }).optional().describe("override de cores (default: paleta do brand-state)"),
      context: z.string().optional().describe("contexto para seleção (papelaria/restaurante/tecnologia/escritório) — default derivado do segmento"),
      fit: z.enum(["contain", "cover"]).optional().describe("encaixe da logo na superfície (default contain)"),
      applyColors: z.boolean().optional().describe("aplicar cores nas camadas de cor (default true)"),
    }),
    async execute(input) {
      const files = readFilesRec(root);
      const identity = resolveBrandIdentity(files);
      if (!identity && input.action !== "history" && input.action !== "status") {
        return "mockup: nenhuma identidade persistida no workspace (brand-state.json ausente). Crie/complete a identidade no Branding Studio antes de gerar mockups.";
      }
      if (input.action === "history" || input.action === "status") {
        const current = readMockupResult(root);
        const history = readMockupHistory(root);
        const lines: string[] = [];
        lines.push(`MOCKUP — ${current ? `última execução ${current.status}` : "nenhuma execução ainda"}`);
        if (current) lines.push(`aplicadas: ${current.applicationsApplied.join(", ") || "—"} | não suportadas: ${current.applicationsUnsupported.map((u) => `${u.applicationId}(${u.reason})`).join(", ") || "—"} | persisted: ${current.persisted}`);
        lines.push(`histórico: ${history.length} execução/ões`);
        for (const h of history.slice(-5)) lines.push(`- [${h.createdAt}] ${h.status} · ${h.applicationsApplied.join(", ") || "—"} (${h.versionId})`);
        return lines.join("\n");
      }
      const res = await runBrandMockup({
        workspaceRoot: root,
        identity,
        applications: input.applications,
        context: input.context ?? mockupContext(env.business?.segment, identity?.name),
        logoSvgOverride: input.logoSvg,
        colorsOverride: input.colors,
        projectId: env.projectId || undefined,
        store: createArtifactStore(),
        options: { fit: input.fit, applyColors: input.applyColors, availableApplications: undefined },
      });
      const lines: string[] = [];
      lines.push(`MOCKUP — ${res.status} · persisted=${res.persisted}`);
      lines.push(`identidade: ${res.identityUsed.name} (${res.identityUsed.primary}/${res.identityUsed.secondary}) · versão ${res.identityUsed.versionId ?? "—"}`);
      lines.push(`aplicações aplicadas: ${res.applicationsApplied.join(", ") || "—"}`);
      lines.push(`não suportadas: ${res.applicationsUnsupported.map((u) => `${u.applicationId}(${u.reason})`).join(", ") || "—"}`);
      lines.push(`PSD gerado: ${res.outputPsd} (${res.outputPsdBytes ? `${res.outputPsdBytes} bytes` : "ausente"})`);
      lines.push(`previews (rasters reais): ${res.previews.map((p) => `${p.applicationId} (${p.width}x${p.height})`).join(", ") || "—"}`);
      lines.push(`camadas alteradas: ${res.modifiedLayers.join(", ") || "—"} | cores: ${res.modifiedColors.join(", ") || "—"}`);
      if (res.reason) lines.push(`motivo: ${res.reason}`);
      return lines.join("\n");
    },
  });

  // MANUAL DA IDENTIDADE (FASE 11): gera um PDF profissional e EXCLUSIVO por
  // projeto a partir da identidade real (brand-state.json + assets/brand/*.svg) e
  // dos mockups reais do PSD Master persistidos no Artifact Store. Mesmo agente.
  const brand_pdf = createTool({
    name: "brand_pdf",
    description:
      "Gera o Manual/PDF da identidade visual a partir dos dados REAIS do Branding Studio e dos mockups reais do PSD Master. " +
      "Composição, cores, tipografia, hierarquia, elementos gráficos, construção e ritmo derivam da própria identidade (exclusivo por projeto); o PDF usa os SVGs reais e os PNGs de mockups persistidos, sem inventar dados. " +
      "Ações: `generate` (gera nova versão, persiste no Artifact Store, preserva versões anteriores) e `status` (estado atual do manifesto). " +
      "Pode regenerar com a identidade atual a qualquer momento ('Refaça o PDF com essa identidade atual') sem usar dados antigos silenciosamente.",
    inputSchema: z.object({
      action: z.enum(["generate", "status"]).default("generate"),
    }),
    async execute(input) {
      const files = readFilesRec(root);
      if (input.action === "status") {
        const manifest = existsSync(join(root, PDF_RESULT_REL)) ? readFileSync(join(root, PDF_RESULT_REL), "utf8") : "{}";
        const hist = existsSync(join(root, PDF_HISTORY_REL)) ? readFileSync(join(root, PDF_HISTORY_REL), "utf8") : "[]";
        let history: unknown[] = []; try { history = JSON.parse(hist); } catch { history = []; }
        return `MANUAL — ${manifest !== "{}" ? "gerado" : "não gerado"} · execuções: ${history.length}`;
      }
      // generate
      const identity = resolveBrandIdentity(files);
      if (!identity) return "brand_pdf: nenhuma identidade persistida (brand-state.json ausente). Crie a identidade no Branding Studio antes.";
      const store = createArtifactStore();
      const projectId = env.projectId || "default";
      const mockups = await loadBrandMockups(store, projectId);
      try {
        const out = await generateAndPersistBrandPdf({ store, projectId, stateFiles: files, mockups });
        const manifestFiles = writeBrandPdfManifest(root, out.metadata, { persisted: out.persisted, status: out.persisted ? "ready" : "error", reason: out.persisted ? undefined : "validação falhou" });
        const lines: string[] = [];
        lines.push(`MANUAL DA IDENTIDADE — ${out.persisted ? "pronto" : "erro"} · versão ${out.metadata.versionId}`);
        lines.push(`identidade: ${out.metadata.identityName} · mockups: ${mockups.length} aplicações reais`);
        lines.push(`páginas: ${out.metadata.pageCount} (${out.pageNames.join(", ")})`);
        lines.push(`validação: ${out.validation.ok ? "ok" : "PROBLEMAS - " + out.validation.issues.join("; ")}`);
        lines.push(`PDF persistido: pdf/current.pdf (${out.contentBytes} bytes)`);
        lines.push(`arquivos de manifesto no workspace: ${Object.keys(manifestFiles).join(", ")}`);
        return lines.join("\n");
      } catch (e) {
        return `brand_pdf: falha ao gerar. ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  // IDENTIDADE COMPLETA (FASE 12): reúne todos os artefatos reais (SVGs,
  // brand-state, mockups reais do PSD Master, manual PDF real, PSD final real)
  // em um ZIP profissional, validado e persistido no Artifact Store. Sempre com
  // allowlist (nunca o Master original, nem .env/secrets/traversal). Mesmo agente.
  const brand_package = createTool({
    name: "brand_package",
    description:
      "Gera o pacote 'Identidade completa' — ZIP profissional contendo os arquivos REAIS do projeto (SVGs da logo + PNG transparente, brand-state.json, identidade.json, paleta.txt, tipografia.txt, mockups reais do PSD Master, manual-identidade.pdf, master-output.psd final e README). " +
      "Só entra o que existe/persistido; o Master original nunca é distribuído; sem arquivos inventados, sem .env/secrets, sem path traversal. " +
      "Ações: `generate` (gera nova versão, persiste em package/current.zip + package/versions/<id>.zip, preserva anteriores) e `status` (estado atual). " +
      "Regenera com a identidade/mockups/PDF atuais quando solicitado ('Prepare a identidade completa para download' / 'Gere novamente o pacote atualizado').",
    inputSchema: z.object({ action: z.enum(["generate", "status"]).default("generate") }),
    async execute(input) {
      const files = readFilesRec(root);
      if (input.action === "status") {
        const manifest = existsSync(join(root, PACKAGE_RESULT_REL)) ? readFileSync(join(root, PACKAGE_RESULT_REL), "utf8") : "{}";
        const hist = existsSync(join(root, PACKAGE_HISTORY_REL)) ? readFileSync(join(root, PACKAGE_HISTORY_REL), "utf8") : "[]";
        let history: unknown[] = []; try { history = JSON.parse(hist); } catch { history = []; }
        return `PACOTE — ${manifest !== "{}" ? "pronto" : "não gerado"} · versões: ${history.length}`;
      }
      const identity = resolveBrandIdentity(files);
      if (!identity) return "brand_package: nenhuma identidade persistida (brand-state.json ausente). Crie a identidade antes.";
      const store = createArtifactStore();
      const projectId = env.projectId || "default";
      try {
        const r = await generateAndPersistBrandPackage({ stateFiles: files, projectId, store });
        const manifestFiles = writeBrandPackageManifest(root, r.manifest, { persisted: r.persisted, zipSizeBytes: r.zipSizeBytes, status: r.persisted ? "ready" : "error", reason: r.persisted ? undefined : r.validation.issues.join("; ") });
        const lines: string[] = [];
        lines.push(`IDENTIDADE COMPLETA — ${r.persisted ? "pronto" : "erro"} · versão ${r.manifest.versionId}`);
        lines.push(`arquivos: ${r.manifest.fileCount} · ZIP: ${Math.round(r.zipSizeBytes / 1024)} KB`);
        lines.push(`validação: ${r.validation.ok ? "ok" : "PROBLEMAS - " + r.validation.issues.join("; ")}`);
        lines.push(`inclui: ${r.manifest.files.slice(0, 6).map((f) => f.path.split("/").pop()).join(", ")}…`);
        lines.push(`persistido: package/current.zip` + (Object.keys(manifestFiles).length ? ` · manifesto: ${Object.keys(manifestFiles).join(", ")}` : ""));
        return lines.join("\n");
      } catch (e) {
        return `brand_package: falha ao gerar. ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  // VÍDEO PROFISSIONAL DO SITE (FASE 13): analisa o site real (DOM), cria um
  // roteiro visual, captura cenas reais via Playwright, renderiza um vídeo real
  // (MP4 quando FFmpeg disponível; WebM nativo caso contrário), valida, PERSISTE
  // no ArtifactStore e escreve manifesto para a UI. Mesmo agente (sem outro agente).
  const site_video = createTool({
    name: "site_video",
    description:
      "Gera um vídeo profissional (~40-50s, 16:9) do site REAL do projeto. Analisa o site (DOM/Playwright), monta um roteiro visual com distribuição variável (impacto inicial → proposta → serviços/diferenciais → seções → CTA), captura cenas reais com movimento suave, renderiza e PERSISTE no Artifact Store. " +
      "Ações: `generate` (gera nova versão, preserva anteriores), `status` e `history`. " +
      "Vídeo real do site público, sem conteúdo inventado, sem secrets. 'Crie um vídeo profissional desse site' / 'Gere novamente o vídeo'.",
    inputSchema: z.object({ action: z.enum(["generate", "status", "history"]).default("generate") }),
    async execute(input) {
      const files = readFilesRec(root);
      if (input.action === "status" || input.action === "history") {
        const manifest = existsSync(join(root, VIDEO_RESULT_REL)) ? readFileSync(join(root, VIDEO_RESULT_REL), "utf8") : "{}";
        const hist = existsSync(join(root, VIDEO_HISTORY_REL)) ? readFileSync(join(root, VIDEO_HISTORY_REL), "utf8") : "[]";
        let history: unknown[] = []; try { history = JSON.parse(hist); } catch { history = []; }
        return `VÍDEO — ${manifest !== "{}" ? "pronto" : "não gerado"} · execuções: ${history.length}`;
      }
      if (!existsSync(join(root, "index.html"))) return "site_video: nenhum site (index.html) no workspace. Gere/edite o site antes de criar o vídeo.";
      const store = createArtifactStore();
      const projectId = env.projectId || "default";
      try {
        const res = await generateAndPersistSiteVideo({ workspaceRoot: root, projectId, store, target: 45 });
        if (!res.ok || !res.manifest) {
          return `site_video: falha na geração. ${res.reason ?? "sem motivo"}`;
        }
        const manifestFiles = writeSiteVideoManifest(root, res.manifest);
        const lines: string[] = [];
        lines.push(`VÍDEO PROFISSIONAL — ${res.manifest.validationOk ? "pronto" : "erro"} · versão ${res.manifest.versionId}`);
        lines.push(`container: ${res.manifest.container} · ${res.manifest.width}×${res.manifest.height} (16:9) · ${res.manifest.duration}s · ${Math.round(res.manifest.fileSize / 1024)} KB`);
        lines.push(`cenas: ${res.manifest.scenes.length} · seções de origem: ${res.manifest.sourceSections.join(", ") || "—"}`);
        lines.push(`validação: ${res.manifest.validationOk ? "ok" : "PROBLEMAS"}`);
        lines.push(`persistido: ${res.manifest.videoRelPath}` + (Object.keys(manifestFiles).length ? ` · manifesto: ${Object.keys(manifestFiles).join(", ")}` : ""));
        return lines.join("\n");
      } catch (e) {
        return `site_video: falha ao gerar. ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  // ── rename_file / move_file / run_command (autonomia de projeto) ──────────
  // Todas usam safeJoin (mesma proteção do resto): sem `..`, sem absoluto, sem
  // `.env*`, sempre dentro do workspace. Arquivos ESTRUTURAIS não podem ser
  // removidos do seu caminho (mesma regra do delete_file).
  const rename = createTool({
    name: "rename_file",
    description:
      "Renomeia um arquivo DENTRO do projeto (mesma pasta ou outra), preservando o conteúdo. Cria o diretório de destino se necessário. Não sai do workspace e não renomeia arquivos ESTRUTURAIS (index.html, src/site.css, src/main.js, src/site.json, package.json).",
    inputSchema: z.object({
      from: z.string().describe("caminho atual (relativo ao workspace)"),
      to: z.string().describe("novo caminho (relativo ao workspace)"),
    }),
    async execute(input) {
      if (isAbsoluteInput(input.from) || isAbsoluteInput(input.to)) {
        return JSON.stringify({ error: "caminho absoluto não permitido (use caminho relativo ao projeto)" });
      }
      const cleanFrom = String(input.from ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (CRITICAL_SITE_FILES.has(cleanFrom)) {
        return JSON.stringify({ error: `"${cleanFrom}" é um arquivo ESTRUTURAL do site e não pode ser renomeado (quebraria o site). Altere o conteúdo com edit_file.` });
      }
      const src = safeJoin(root, input.from);
      const dst = safeJoin(root, input.to);
      if (!src || !dst) return JSON.stringify({ error: "caminho inválido (fora do workspace)" });
      if (!existsSync(src)) return JSON.stringify({ error: `arquivo de origem não encontrado: ${relOf(root, src)}` });
      try {
        mkdirSync(dirname(dst), { recursive: true });
        renameSync(src, dst);
      } catch (e) {
        return JSON.stringify({ error: `falha ao renomear: ${e instanceof Error ? e.message : String(e)}` });
      }
      return JSON.stringify({ ok: true, from: relOf(root, src), to: relOf(root, dst) });
    },
  });

  const move = createTool({
    name: "move_file",
    description:
      "Move um arquivo para outra pasta DENTRO do projeto, preservando o conteúdo e criando o diretório de destino. Não sai do workspace e não move arquivos ESTRUTURAIS (index.html, src/site.css, src/main.js, src/site.json, package.json).",
    inputSchema: z.object({
      from: z.string().describe("origem (relativa ao workspace)"),
      to: z.string().describe("destino (relativo ao workspace, incluindo o nome do arquivo)"),
    }),
    async execute(input) {
      if (isAbsoluteInput(input.from) || isAbsoluteInput(input.to)) {
        return JSON.stringify({ error: "caminho absoluto não permitido (use caminho relativo ao projeto)" });
      }
      const cleanFrom = String(input.from ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (CRITICAL_SITE_FILES.has(cleanFrom)) {
        return JSON.stringify({ error: `"${cleanFrom}" é um arquivo ESTRUTURAL do site e não pode ser movido (quebraria o site).` });
      }
      const src = safeJoin(root, input.from);
      const dst = safeJoin(root, input.to);
      if (!src || !dst) return JSON.stringify({ error: "caminho inválido (fora do workspace)" });
      if (!existsSync(src)) return JSON.stringify({ error: `arquivo de origem não encontrado: ${relOf(root, src)}` });
      try {
        mkdirSync(dirname(dst), { recursive: true });
        renameSync(src, dst);
      } catch (e) {
        return JSON.stringify({ error: `falha ao mover: ${e instanceof Error ? e.message : String(e)}` });
      }
      return JSON.stringify({ ok: true, from: relOf(root, src), to: relOf(root, dst) });
    },
  });

  // EXECUTOR CONTROLADO (sem shell livre): só `npm install|ci|run <script-do-package.json>`.
  // cwd = workspace; ambiente SEM segredos; timeout; limite de saída; exit!=0 = falha.
  const runCmd = createTool({
    name: "run_command",
    description:
      "Executa comandos de DESENVOLVIMENTO do próprio projeto: 'install' (npm install), 'ci' (npm ci) ou 'run' (npm run <script definido no package.json>). NÃO é um shell livre — só estas ações. Roda com cwd no workspace, sem propagar secrets, com timeout e limite de saída. Exit code != 0 = falha.",
    inputSchema: z.object({
      action: z.enum(["install", "ci", "run"]),
      script: z.string().optional().describe("nome do script do package.json (obrigatório para action=run): build, lint, test, dev…"),
      timeoutMs: z.number().int().positive().optional().describe("timeout em ms (default 120000, máx 300000)"),
    }),
    async execute(input) {
      const pkgPath = join(root, "package.json");
      if (!existsSync(pkgPath)) return JSON.stringify({ error: "run_command: não há package.json no projeto (nada para instalar/rodar)." });
      let argv: string[];
      if (input.action === "install") {
        argv = ["install", "--no-audit", "--no-fund"];
      } else if (input.action === "ci") {
        argv = ["ci", "--no-audit", "--no-fund"];
      } else {
        const script = String(input.script ?? "").trim();
        if (!/^[a-z0-9:_-]{1,40}$/i.test(script)) return JSON.stringify({ error: "run_command: nome de script inválido." });
        let scripts: Record<string, unknown> = {};
        try { scripts = (JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, unknown> }).scripts ?? {}; }
        catch { return JSON.stringify({ error: "run_command: package.json inválido." }); }
        if (!Object.prototype.hasOwnProperty.call(scripts, script)) {
          return JSON.stringify({ error: `run_command: o script "${script}" não existe no package.json.` });
        }
        argv = ["run", script];
      }
      const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 120000, 1000), 300000);
      // Ambiente SEM segredos: nunca propaga KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL/API/AUTH/COOKIE.
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v !== "string") continue;
        if (/key|token|secret|password|passwd|credential|api|auth|cookie|session/i.test(k)) continue;
        env[k] = v;
      }
      env.npm_config_audit = "false";
      env.npm_config_fund = "false";
      env.CI = "1";
      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      return await new Promise<string>((resolve) => {
        const LIMIT = 200_000;
        let out = "";
        let err = "";
        let done = false;
        let child: ReturnType<typeof spawn>;
        try {
          // shell apenas no Windows para resolver npm.cmd; argv é 100% fixo/validado (sem texto livre do usuário).
          child = spawn(npmCmd, argv, { cwd: root, env, shell: process.platform === "win32", windowsHide: true });
        } catch (e) {
          resolve(JSON.stringify({ error: `run_command: falha ao iniciar (${e instanceof Error ? e.message : String(e)})` }));
          return;
        }
        const clamp = (s: string) => (s.length > LIMIT ? `${s.slice(0, LIMIT)}\n…(saída truncada em ${LIMIT} caracteres)` : s);
        const finish = (code: number | null, timedOut: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (timedOut) {
            // Mata a ÁRVORE de processos (o npm gera um filho node, que segura o cwd).
            try {
              if (process.platform === "win32" && child.pid) {
                spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
              } else {
                child.kill("SIGKILL");
              }
            } catch { /* noop */ }
          }
          const payload = { code: code ?? -1, stdout: clamp(out), stderr: clamp(err), timedOut };
          if (timedOut) resolve(JSON.stringify({ error: `run_command: timeout de ${timeoutMs}ms em "npm ${argv.join(" ")}"`, ...payload }));
          else if ((code ?? 1) !== 0) resolve(JSON.stringify({ error: `run_command: "npm ${argv.join(" ")}" falhou (exit ${code}).`, ...payload }));
          else resolve(JSON.stringify({ ok: true, ...payload }));
        };
        const timer = setTimeout(() => finish(null, true), timeoutMs);
        child.stdout?.on("data", (d) => { if (out.length < LIMIT) out += String(d); });
        child.stderr?.on("data", (d) => { if (err.length < LIMIT) err += String(d); });
        child.on("error", (e) => { err += `\n${e.message}`; finish(-1, false); });
        child.on("close", (code) => finish(code, false));
      });
    },
  });

  const tools = [list, read, write, edit, remove, rename, move, runCmd, context, imagePlan, branding, mockup, brand_pdf, brand_package, site_video];
  // Geração de site: remove a toolset de identidade/deliverables para o agente
  // focar no site (e não criar uma identidade visual automaticamente).
  if (env.mode === "generate") {
    return tools.filter((t) => !GENERATE_EXCLUDED_TOOLS.has((t as { name: string }).name));
  }
  return tools;
}

function readFilesRec(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /\.(html|css|js|json|svg)$/i.test(e.name)) {
        try { out[relative(root, full).split(sep).join("/")] = readFileSync(full, "utf8"); } catch { /* noop */ }
      }
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

export type SiteToolSet = ReturnType<typeof buildSiteTools>;
