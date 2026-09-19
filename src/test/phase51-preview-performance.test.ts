import { describe, it, expect, beforeEach } from "vitest";
import { createWebContainerService, type WebContainerAdapter, type WCInstance } from "@/lib/studio/webcontainer";
import { PERF, getPerfSummary, markPerf, resetPerf } from "@/lib/studio/perf";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FASE 5.1 — performance do Studio/Preview: reuso do WebContainer, deps só quando
// mudam, Vite sem reinício desnecessário, sync correto e isolamento entre projetos.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function fakeAdapter() {
  const calls = { boot: 0, mount: 0, install: 0, dev: 0, teardown: 0, written: [] as string[] };
  const serverHandlers: Array<(port: number, url: string) => void> = [];
  const instance = {
    on: (evt: string, cb: (port: number, url: string) => void) => { if (evt === "server-ready") serverHandlers.push(cb); },
    mount: async () => { calls.mount += 1; },
    spawn: async (cmd: string, args: string[]) => {
      if (cmd === "npm" && args[0] === "install") {
        calls.install += 1;
        return { output: new ReadableStream(), exit: Promise.resolve(0), kill: () => undefined };
      }
      calls.dev += 1;
      setTimeout(() => serverHandlers.forEach((cb) => cb(5173, "http://localhost:5173/")), 0);
      return { output: new ReadableStream(), exit: new Promise<number>(() => undefined), kill: () => undefined };
    },
    fs: {
      writeFile: async (p: string) => { calls.written.push(p); },
      rm: async () => undefined,
      mkdir: async () => undefined,
    },
    teardown: async () => { calls.teardown += 1; },
  } as unknown as WCInstance;
  const adapter: WebContainerAdapter = { boot: async () => { calls.boot += 1; return instance; } };
  return { adapter, calls };
}

const filesV1 = {
  "package.json": JSON.stringify({ name: "site", dependencies: { react: "18.3.1" } }),
  "index.html": "<h1>v1</h1>",
  "src/App.tsx": "export default () => <h1>v1</h1>;",
};

describe("FASE 5.1 · WebContainer: reuso e dependências", () => {
  beforeEach(() => resetPerf());

  it("A/C/F) abrir o mesmo projeto 2x NÃO reinicia container, Vite nem deps", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createWebContainerService(adapter);
    const url1 = await service.load(filesV1, undefined, "projeto-A");
    const url2 = await service.load(filesV1, undefined, "projeto-A");
    expect(url1).toBe(url2);
    expect(calls.boot).toBe(1);
    expect(calls.mount).toBe(1);   // não remonta arquivos
    expect(calls.install).toBe(1); // não reinstala
    expect(calls.dev).toBe(1);     // Vite inicia UMA vez
  });

  it("B) alteração só de código NÃO reinstala dependências", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createWebContainerService(adapter);
    await service.load(filesV1, undefined, "projeto-A");
    await service.syncFiles({ ...filesV1, "src/App.tsx": "export default () => <h1>v2</h1>;" });
    expect(calls.install).toBe(1);
    expect(calls.written).toContain("src/App.tsx");
  });

  it("B/F) mudança REAL de package.json sinaliza deps e NÃO reinstala sozinho", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createWebContainerService(adapter);
    await service.load(filesV1, undefined, "projeto-A");
    const v2 = { ...filesV1, "package.json": JSON.stringify({ name: "site", dependencies: { react: "18.3.1", clsx: "2.1.1" } }) };
    const r1 = await service.syncFiles(v2);
    expect(r1.depsChanged).toBe(true);
    expect(calls.install).toBe(1); // nenhum install silencioso no sync
    const r2 = await service.syncFiles(v2); // sem nova mudança
    expect(r2.depsChanged).toBe(false);
    expect(calls.install).toBe(1);
    // recarregar o preview É o momento em que as novas deps instalam (1x)
    await service.teardown();
    await service.load(v2, undefined, "projeto-A");
    expect(calls.install).toBe(2);
  });

  it("H) projeto diferente NUNCA reutiliza instância do anterior (isolamento)", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createWebContainerService(adapter);
    await service.load(filesV1, undefined, "projeto-A");
    await service.load({ ...filesV1, "index.html": "<h1>B</h1>" }, undefined, "projeto-B");
    expect(calls.teardown).toBe(1);
    expect(calls.boot).toBe(2);
    expect(service.getProjectId()).toBe("projeto-B");
  });

  it("G) sync por DIFF: só arquivos realmente alterados são escritos", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createWebContainerService(adapter);
    await service.load(filesV1, undefined, "projeto-A");
    const before = calls.written.length;
    const r = await service.syncFiles({ ...filesV1, "src/App.tsx": "export default () => <h1>v3</h1>;" });
    expect(r.updated).toBe(1);
    expect(calls.written.length - before).toBe(1);
  });

  it("instrumentação T3–T7 registra o fluxo real (uma vez por etapa)", async () => {
    const { adapter } = fakeAdapter();
    const service = createWebContainerService(adapter);
    await service.load(filesV1, undefined, "projeto-A");
    await service.syncFiles(filesV1);
    const names = getPerfSummary().map((m) => m.name);
    expect(names).toContain(PERF.T3);
    expect(names).toContain(PERF.T4);
    expect(names).toContain(PERF.T5);
    expect(names).toContain(PERF.T6);
    expect(names).toContain(PERF.T7);
    // idempotente: repetir load não duplica marcas
    await service.load(filesV1, undefined, "projeto-A");
    expect(getPerfSummary().filter((m) => m.name === PERF.T3)).toHaveLength(1);
    const total = getPerfSummary().at(-1)?.totalMs ?? 0;
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("D/E/I) preview e chat são independentes: pagar caro só na 1ª montagem", () => {
    const preview = read("src/components/sites/studio/WebContainerPreview.tsx");
    const hook = read("src/hooks/studio/useWebContainerPreview.ts");
    // O preview (componente) nunca derruba o container.
    expect(preview).not.toMatch(/teardown\(/);
    // Atualizações de arquivo vão por syncFiles (diff/HMR), não por remontagem.
    expect(hook).toContain("syncFiles");
    // Teardown só em caminhos EXPLÍCITOS (troca de projeto / botão reiniciar) — no
    // máximo 2 ocorrências, nunca por evento de chat/streaming.
    expect((hook.match(/service\.teardown\(/g) ?? []).length).toBeLessThanOrEqual(2);
    // O reload do refresh acontece no IFRAME (bump de key), não no WebContainer
    expect(preview).toMatch(/setFrameKey\(\(k\) => k \+ 1\)/);
    // e é debounced (não remonta várias vezes na mesma execução)
    expect(preview).toMatch(/setTimeout\(\(\) => setFrameKey/);
    expect(preview).toContain("700");
  });

  it("payload do Studio não baixa published_code (colunas explícitas)", () => {
    const api = read("src/lib/siteProjectsApi.ts");
    expect(api).toContain("STUDIO_PROJECT_COLUMNS");
    expect(api).toMatch(/const STUDIO_PROJECT_COLUMNS = \[/);
    expect(api).not.toMatch(/from\("site_projects"\)\s*\.select\("\*"\)/);
    expect(api).not.toContain('"published_code"');
  });

  it("desktop usa TODO o painel (sem sobra lateral e sem upscale borrado)", () => {
    const preview = read("src/components/sites/studio/WebContainerPreview.tsx");
    const panel = read("src/components/sites/studio/StudioPreviewPanel.tsx");
    // Desktop: largura/altura do container real, escala 1 (sem borrão)
    expect(preview).toContain('if (device === "desktop")');
    expect(preview).toMatch(/setBox\(\{ w: cw, h: ch, scale: 1 \}\)/);
    // O conteúdo interno acompanha o frame no desktop (iframe preenche a largura)
    expect(preview).toMatch(/device === "desktop"\s*\n?\s*\? \{ width: box\.w, height: box\.h \}/);
    // Mobile/tablet continuam com o tamanho REAL do aparelho
    expect(preview).toMatch(/fitDeviceScale\(cw \+ 16, ch \+ 16, size\)/);
    // Preview estático (legado): desktop também ocupa 100% da largura
    expect(panel).toMatch(/maxWidth: device === "desktop" \? "100%" : DEVICE_WIDTH\[device\]/);
  });
});
