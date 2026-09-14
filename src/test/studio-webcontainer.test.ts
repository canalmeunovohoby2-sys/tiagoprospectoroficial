import { describe, it, expect, vi } from "vitest";
import { createWebContainerService, toFileSystemTree, type WCInstance, type WCProcess } from "@/lib/studio/webcontainer";

interface FakeWC {
  instance: WCInstance;
  bootSpy: ReturnType<typeof vi.fn>;
  spawned: string[];
  writes: Array<[string, string]>;
  removed: string[];
  mountTree: () => unknown;
  teardownCount: () => number;
}

function makeFake(options: { autoReady?: boolean; exitCode?: number; neverReady?: boolean } = {}): FakeWC {
  const spawned: string[] = [];
  const writes: Array<[string, string]> = [];
  const removed: string[] = [];
  let mountTree: unknown = null;
  let teardownCount = 0;

  const instance: WCInstance = {
    async mount(tree) { mountTree = tree; },
    async spawn(command, args): Promise<WCProcess> {
      spawned.push([command, ...args].join(" "));
      return { output: null, exit: Promise.resolve(options.exitCode ?? 0), kill: vi.fn() };
    },
    on(_event, cb) {
      if (options.autoReady !== false && !options.neverReady) setTimeout(() => cb(5173, "http://localhost:5173"), 0);
      return () => { /* noop */ };
    },
    fs: {
      async writeFile(path, content) { writes.push([path, content]); },
      async rm(path) { removed.push(path); },
      async readFile() { return ""; },
    },
    async teardown() { teardownCount += 1; },
  };

  const bootSpy = vi.fn(async () => instance);
  return { instance, bootSpy, spawned, writes, removed, mountTree: () => mountTree, teardownCount: () => teardownCount };
}

describe("C0 · webcontainer (serviço)", () => {
  it("boot único + um único dev server mesmo com load concorrente", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { serverTimeoutMs: 2000 });
    const files = { "package.json": "{}", "src/App.tsx": "export default function App(){return null}" };
    const [url1, url2] = await Promise.all([service.load(files), service.load(files)]);
    expect(url1).toBe("http://localhost:5173");
    expect(url2).toBe("http://localhost:5173");
    expect(fake.bootSpy).toHaveBeenCalledTimes(1);
    expect(fake.spawned.filter((s) => s.includes("run dev")).length).toBe(1);
    expect(fake.spawned.some((s) => s.includes("npm install"))).toBe(true);
  });

  it("skipInstall não executa npm install", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 2000 });
    await service.load({ "index.html": "<div/>" });
    expect(fake.spawned.some((s) => s.includes("npm install"))).toBe(false);
    expect(fake.spawned.some((s) => s.includes("run dev"))).toBe(true);
  });

  it("monta a árvore de arquivos corretamente", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 2000 });
    await service.load({ "package.json": "{}", "src/App.tsx": "x" });
    const tree = fake.mountTree() as Record<string, { directory?: Record<string, unknown> }>;
    expect(tree["package.json"]).toEqual({ file: { contents: "{}" } });
    const src = tree["src"] as { directory?: Record<string, unknown> };
    expect(src.directory?.["App.tsx"]).toEqual({ file: { contents: "x" } });
  });

  it("syncFiles aplica diff (add/update/remove) e é no-op sem mudança", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 2000 });
    await service.load({ "a.tsx": "1", "b.tsx": "2" });
    fake.writes.length = 0;

    const noop = await service.syncFiles({ "a.tsx": "1", "b.tsx": "2" });
    expect(noop).toEqual({ updated: 0, removed: 0 });
    expect(fake.writes.length).toBe(0);

    const changed = await service.syncFiles({ "a.tsx": "1b", "c.tsx": "3" });
    expect(changed.updated).toBe(2);
    expect(changed.removed).toBe(1);
    expect(fake.writes.map((w) => w[0]).sort()).toEqual(["a.tsx", "c.tsx"]);
    expect(fake.removed).toEqual(["b.tsx"]);

    // cache atualizado → segunda passada não reescreve
    fake.writes.length = 0;
    const again = await service.syncFiles({ "a.tsx": "1b", "c.tsx": "3" });
    expect(again).toEqual({ updated: 0, removed: 0 });
  });

  it("teardown limpa e permite novo boot", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 2000 });
    await service.load({ "index.html": "<div/>" });
    expect(service.isReady()).toBe(true);
    await service.teardown();
    expect(service.isReady()).toBe(false);
    expect(service.getUrl()).toBeNull();
    expect(fake.teardownCount()).toBe(1);
    await service.load({ "index.html": "<div/>" });
    expect(fake.bootSpy).toHaveBeenCalledTimes(2);
  });

  it("isola por projectId: trocar de projeto recria o container (nunca reusa o anterior)", async () => {
    const fake = makeFake();
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 2000 });
    await service.load({ "index.html": "<div>A</div>" }, undefined, "proj-A");
    expect(service.getProjectId()).toBe("proj-A");
    await service.load({ "index.html": "<div>B</div>" }, undefined, "proj-B");
    expect(service.getProjectId()).toBe("proj-B");
    expect(fake.bootSpy).toHaveBeenCalledTimes(2);
  });

  it("rejeita quando o dev server não fica pronto (timeout)", async () => {
    const fake = makeFake({ neverReady: true });
    const service = createWebContainerService({ boot: fake.bootSpy }, { skipInstall: true, serverTimeoutMs: 50 });
    await expect(service.load({ "index.html": "<div/>" })).rejects.toThrow(/dev server/i);
  });

  it("propaga falha do npm install", async () => {
    const fake = makeFake({ exitCode: 1 });
    const service = createWebContainerService({ boot: fake.bootSpy }, { serverTimeoutMs: 2000 });
    await expect(service.load({ "package.json": "{}" })).rejects.toThrow(/npm install falhou/i);
  });
});

describe("C0 · toFileSystemTree", () => {
  it("converte caminhos aninhados e ignora vazios", () => {
    const tree = toFileSystemTree({ "src/a/b.ts": "x", "": "y", "z.css": "c" });
    const src = (tree["src"] as { directory: Record<string, unknown> }).directory;
    const a = (src["a"] as { directory: Record<string, unknown> }).directory;
    expect(a["b.ts"]).toEqual({ file: { contents: "x" } });
    expect(tree["z.css"]).toEqual({ file: { contents: "c" } });
  });
});
