import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  syncWorkspaceFromClient,
  bumpWorkspaceRevision,
  currentWorkspaceRevision,
  isStaleSnapshot,
  readWorkspace,
  withWorkspaceLock,
  resolveWorkspaceRoot,
} from "../src/workspace";
import { honestRunResult, reactRunKind } from "../src/server";
import { intentCoverage, distinctiveTerms } from "../src/work-evidence";

// FASE 2 — WORKSPACE COMO SOURCE OF TRUTH + RESULTADO HONESTO.
// Testes determinísticos: verificam o ESTADO FINAL dos arquivos (não apenas
// "não lançou exceção").

let base = "";
const origWorkspaces = process.env.PROSPECTOR_WORKSPACES;
const pid = (n: string) => `fase2-${n}-${process.pid}`;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "prospector-fase2-"));
  process.env.PROSPECTOR_WORKSPACES = base;
});
afterEach(() => {
  if (origWorkspaces === undefined) delete process.env.PROSPECTOR_WORKSPACES;
  else process.env.PROSPECTOR_WORKSPACES = origWorkspaces;
  rmSync(base, { recursive: true, force: true });
});

describe("FASE 2 · workspace é a fonte de verdade", () => {
  it("A) alteração do agente persiste no workspace e incrementa a revisão", () => {
    const project = pid("a");
    const first = syncWorkspaceFromClient(project, { "index.html": "<h1>antes</h1>", "src/App.tsx": "export default () => null;" });
    const rev1 = first.revision;

    // O AGENTE escreve direto no disco (como as tools fazem)…
    const root = resolveWorkspaceRoot(project);
    writeFileSync(join(root, "index.html"), "<h1>DEPOIS (agente)</h1>", "utf8");
    const rev2 = bumpWorkspaceRevision(project);

    expect(rev2).toBeGreaterThan(rev1);
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain("DEPOIS (agente)");
    expect(readWorkspace(root)["index.html"]).toContain("DEPOIS (agente)");
  });

  it("D) snapshot ANTIGO não sobrescreve o trabalho novo do agente", () => {
    const project = pid("d");
    const snapshotAntigo = { "index.html": "<h1>A</h1>" };
    const s1 = syncWorkspaceFromClient(project, snapshotAntigo); // cliente em dia
    const root = resolveWorkspaceRoot(project);

    // agente produz B
    writeFileSync(join(root, "index.html"), "<h1>B</h1>", "utf8");
    bumpWorkspaceRevision(project);

    // cliente atrasado manda A de novo (rev antiga)
    const s2 = syncWorkspaceFromClient(project, snapshotAntigo, s1.revision);
    expect(s2.stale).toBe(true);
    expect(s2.materialized).toBe(false);
    // ESTADO FINAL continua B (a sobrescrita silenciosa não acontece)
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain("<h1>B</h1>");
  });

  it("cliente EM DIA pode materializar normalmente (edições do editor chegam)", () => {
    const project = pid("fresh");
    const s1 = syncWorkspaceFromClient(project, { "index.html": "<h1>A</h1>" });
    const s2 = syncWorkspaceFromClient(project, { "index.html": "<h1>A+editor</h1>" }, s1.revision);
    expect(s2.stale).toBe(false);
    expect(readFileSync(join(resolveWorkspaceRoot(project), "index.html"), "utf8")).toContain("A+editor");
  });

  it("B/C) RUN → BUILD/GIT com snapshot pré-run NÃO restaura o estado anterior", () => {
    const project = pid("bc");
    const preRun = { "index.html": "<h1>antes</h1>" };
    const s1 = syncWorkspaceFromClient(project, preRun);
    const root = resolveWorkspaceRoot(project);

    // run do agente → B
    writeFileSync(join(root, "index.html"), "<h1>depois da run</h1>", "utf8");
    bumpWorkspaceRevision(project);

    // /build e /git chegam com o snapshot pré-run (rev antiga)
    const build = syncWorkspaceFromClient(project, preRun, s1.revision);
    const git = syncWorkspaceFromClient(project, preRun, s1.revision);
    expect(build.stale).toBe(true);
    expect(git.stale).toBe(true);
    // o que o build/commit leem agora é o estado ATUAL (B), nunca A
    expect(readWorkspace(root)["index.html"]).toContain("depois da run");
  });

  it("build não contamina o estado editável (dist/ não faz parte do projeto)", () => {
    const project = pid("dist");
    syncWorkspaceFromClient(project, { "index.html": "<h1>x</h1>" });
    const root = resolveWorkspaceRoot(project);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "index.html"), "<html>build</html>", "utf8");
    expect(readWorkspace(root)["dist/index.html"]).toBeUndefined();
    expect(readWorkspace(root)["index.html"]).toBeDefined();
  });

  it("isStaleSnapshot: sem revisão o cliente é aceito (compatibilidade)", () => {
    const project = pid("compat");
    bumpWorkspaceRevision(project);
    expect(isStaleSnapshot(project, undefined)).toBe(false);
    expect(isStaleSnapshot(project, null)).toBe(false);
    expect(isStaleSnapshot(project, currentWorkspaceRevision(project))).toBe(false);
    expect(isStaleSnapshot(project, currentWorkspaceRevision(project) - 1)).toBe(true);
  });
});

describe("FASE 2 · lock por projeto (serialização real)", () => {
  it("E) duas mutações no MESMO projeto são serializadas (sem interleaving)", async () => {
    const order: string[] = [];
    const run = (label: string, ms: number) =>
      withWorkspaceLock(pid("lock"), async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${label}:end`);
      });
    await Promise.all([run("mut1", 40), run("mut2", 5)]);
    expect(order).toEqual(["mut1:start", "mut1:end", "mut2:start", "mut2:end"]);
  });

  it("F) projetos DIFERENTES executam em paralelo (lock de A não trava B)", async () => {
    const order: string[] = [];
    const a = withWorkspaceLock(pid("projA"), async () => {
      order.push("A:start");
      await new Promise((r) => setTimeout(r, 60));
      order.push("A:end");
    });
    const b = withWorkspaceLock(pid("projB"), async () => {
      order.push("B:start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("B:end");
    });
    await Promise.all([a, b]);
    // B termina ANTES de A: não há serialização entre projetos distintos.
    expect(order.indexOf("B:end")).toBeLessThan(order.indexOf("A:end"));
  });

  it("o lock é liberado mesmo em erro (próxima operação roda)", async () => {
    const order: string[] = [];
    await withWorkspaceLock(pid("err"), async () => { throw new Error("falha simulada"); }).catch(() => undefined);
    await withWorkspaceLock(pid("err"), async () => { order.push("rodou"); });
    expect(order).toEqual(["rodou"]);
  });
});

describe("FASE 2 · resultado honesto (touched ≠ changed ≠ verified)", () => {
  it("G) tool executou e touched>0 mas SEM validação → NUNCA 'completed_verified'", () => {
    expect(honestRunResult({ ok: true, touched: ["index.html"], verified: false, intentConfirmed: true })).toBe("completed_unverified");
  });

  it("H) nada mudou → no_change", () => {
    expect(honestRunResult({ ok: true, touched: [], verified: false, intentConfirmed: true })).toBe("no_change");
  });

  it("I) alteração real + validação + pedido coberto → completed_verified", () => {
    expect(honestRunResult({ ok: true, touched: ["index.html"], verified: true, intentConfirmed: true })).toBe("completed_verified");
  });

  it("J) alteração real sem validação → completed_unverified", () => {
    expect(honestRunResult({ ok: true, touched: ["src/App.tsx"], verified: false, intentConfirmed: true })).toBe("completed_unverified");
  });

  it("K) falha real → failed (mesmo com arquivos tocados)", () => {
    expect(honestRunResult({ ok: false, touched: ["index.html"], verified: true, intentConfirmed: true })).toBe("failed");
  });

  it("L) conversa pura continua sendo conversa (sem edição)", () => {
    expect(reactRunKind({ firstGen: true, instruction: "Oi, boa tarde. Tudo bem?" })).toBe("conversation");
    expect(reactRunKind({ firstGen: false, instruction: "obrigado!" })).toBe("conversation");
  });
});

describe("FASE 2 · caso real 'disse que fez, mas não fez' (vermelho → azul)", () => {
  const antes = { "index.html": "<style>.btn{color:vermelho;background:#e11d48}</style><h1>Site</h1>", "src/App.tsx": "export default () => null;" };

  it("tool rodou + touched>0 mas o diff NÃO cobre o pedido → não verificado", () => {
    // alteração irrelevante (comentário), o vermelho continua no arquivo
    const depois = { "index.html": antes["index.html"] + "\n<!-- ajuste -->", "src/App.tsx": antes["src/App.tsx"] };
    const coverage = intentCoverage("troque todo vermelho do site para azul", antes, depois, ["index.html"]);
    expect(coverage.checked).toBe(true);
    expect(coverage.confirmed).toBe(false);
    const state = honestRunResult({ ok: true, touched: ["index.html"], verified: true, intentConfirmed: coverage.confirmed });
    expect(state).not.toBe("completed_verified");
    expect(state).toBe("completed_unverified");
  });

  it("alteração REAL (vermelho→azul) + validação → completed_verified", () => {
    const depois = { "index.html": "<style>.btn{color:azul;background:#2563eb}</style><h1>Site</h1>", "src/App.tsx": antes["src/App.tsx"] };
    const coverage = intentCoverage("troque todo vermelho do site para azul", antes, depois, ["index.html"]);
    expect(coverage.checked).toBe(true);
    expect(coverage.confirmed).toBe(true);
    expect(coverage.matched).toContain("azul");
    const state = honestRunResult({ ok: true, touched: ["index.html"], verified: true, intentConfirmed: coverage.confirmed });
    expect(state).toBe("completed_verified");
  });

  it("pedido sem termo distintivo não bloqueia (não inventa verificação)", () => {
    const coverage = intentCoverage("deixe o hero mais sofisticado", antes, { ...antes, "index.html": antes["index.html"] + "\n<section class='hero'>x</section>" }, ["index.html"]);
    expect(coverage.checked).toBe(false);
    expect(coverage.confirmed).toBe(true);
  });

  it("extrai termos verificáveis (cores, hex, trechos entre aspas)", () => {
    expect(distinctiveTerms("troque o vermelho por #2563eb")).toEqual(expect.arrayContaining(["vermelho", "#2563eb"]));
    expect(distinctiveTerms('mude o texto "Fale conosco"')).toContain("fale conosco");
    expect(distinctiveTerms("melhore o layout")).toEqual([]);
  });
});
