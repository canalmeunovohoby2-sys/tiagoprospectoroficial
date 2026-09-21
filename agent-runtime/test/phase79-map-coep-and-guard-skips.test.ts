import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyToolResultFailure } from "../src/completion-guard";

// FASE 7.9 — Mapa visível sob COEP e skips de guarda que NÃO são falha.

const mapSrc = readFileSync(join(process.cwd(), "src/studio/agent-core/static-map.ts"), "utf8");

describe("FASE 7.9 · mapa sob COEP (fim do mapa branco)", () => {
  it("o runtime cria o iframe do GOOGLE MAPS real por cima do mosaico (fallback OSM)", () => {
    const mapSrc = readFileSync(join(process.cwd(), "src/studio/agent-core/static-map.ts"), "utf8");
    expect(mapSrc).toContain("maps.google.com/maps");
    expect(mapSrc).toContain("output=embed");
    expect(mapSrc).toContain('data-pf-gmap');
    // e a normalização NÃO troca o NOSSO iframe (idempotência)
    const media = readFileSync(join(process.cwd(), "src/studio/agent-core/site-media.ts"), "utf8");
    expect(media).toContain('/data-pf-gmap/i.test(m) ? m : repl');
  });

  it("os tiles do OSM são carregados em modo NO-CORS (CORP permite sob COEP; CORS forçado bloqueia)", () => {
    // OSM NÃO envia Access-Control-Allow-Origin (só CORP) — forçar crossOrigin
    // bloqueava os tiles e sobrava apenas o marcador. No-cors + CORP funciona.
    expect(mapSrc).not.toMatch(/img\.crossOrigin="anonymous"/);
    expect(mapSrc).toContain("tile.openstreetmap.org");
  });

  it("o runtime observa montagem tardia (React) e reconecta quando o nó é trocado", () => {
    expect(mapSrc).toContain("MutationObserver");
    expect(mapSrc).toMatch(/observe\(document\.documentElement/);
  });

  it("sem coordenadas o iframe quebrado vira card honesto (nunca área branca)", () => {
    const media = readFileSync(join(process.cwd(), "src/studio/agent-core/site-media.ts"), "utf8");
    expect(media).toContain("replaceBrokenMapEmbeds");
    expect(media).toMatch(/if \(!block\) return replaceBrokenMapEmbeds/);
  });
});

describe("FASE 7.9 · skip de guarda NÃO é ferramenta quebrada", () => {
  it("write_file bloqueado por guarda de config vira 'guard', não 'tool'", () => {
    const r = classifyToolResultFailure({
      toolName: "write_file",
      isError: true,
      message: '"vite.config.ts" é ARQUIVO DE CONFIGURAÇÃO/BUILD e este pedido NÃO é sobre build/dependências.',
      readOnlyVerify: false,
    });
    expect(r.kind).toBe("guard");
  });

  it("guarda de encolhimento e de regressão estrutural também são 'guard'", () => {
    expect(classifyToolResultFailure({ toolName: "write_file", isError: true, message: 'EDITAR ≠ RECONSTRUIR: prefira "edit_file"', readOnlyVerify: false }).kind).toBe("guard");
    expect(classifyToolResultFailure({ toolName: "write_file", isError: true, message: "causaria REGRESSÃO estrutural (não é uma edição preservadora)", readOnlyVerify: false }).kind).toBe("guard");
  });

  it("erro REAL de ferramenta continua sendo 'tool' (não mascarar falha)", () => {
    expect(classifyToolResultFailure({ toolName: "edit_file", isError: true, message: "edit_file: ENOENT no such file", readOnlyVerify: false }).kind).toBe("tool");
    // e finish_task recusado continua 'guard'
    expect(classifyToolResultFailure({ toolName: "finish_task", isError: true, message: "verificação não comprovada", readOnlyVerify: false }).kind).toBe("guard");
  });
});
