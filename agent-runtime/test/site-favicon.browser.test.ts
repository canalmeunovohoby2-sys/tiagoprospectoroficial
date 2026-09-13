import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BrowserSession } from "../src/browser-session";
import { ensureClientFavicon } from "../src/site-favicon";

function buildWorkspace(root: string, name: string, segment: string, primary: string) {
  const site = {
    "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${name}</title></head><body><h1>${name}</h1></body></html>`,
    "src/site.css": "body{}",
  };
  const r = ensureClientFavicon(site, { name, segment }, { primary });
  for (const [p, c] of Object.entries(r.files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, c);
  }
}

describe("E2E (Chromium) — favicon do CLIENTE no site (isolado por projeto)", () => {
  let rootA = "";
  let rootB = "";
  beforeAll(() => {
    rootA = mkdtempSync(join(tmpdir(), "fav-a-"));
    rootB = mkdtempSync(join(tmpdir(), "fav-b-"));
    buildWorkspace(rootA, "Clínica Sorriso", "Odontologia", "#0ea5e9");
    buildWorkspace(rootB, "Pizzaria Bella", "Pizzaria", "#dc2626");
  });
  afterAll(() => {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  async function probe(root: string) {
    const session = new BrowserSession(root);
    try {
      const insp = await session.open("/?t=" + Date.now());
      const r = await session.evaluate(`(async () => {
        const link = document.querySelector('link[rel="icon"]');
        const href = link ? link.getAttribute('href') : null;
        let status = 0, body = "";
        if (href) { const res = await fetch(href); status = res.status; body = await res.text(); }
        return { href, status, body, title: document.title };
      })()`);
      return { value: r.value as { href: string | null; status: number; body: string; title: string }, insp };
    } finally {
      await session.close().catch(() => undefined);
    }
  }

  it("A e B recebem o favicon PRÓPRIO (200), nunca o do Prospector, sem 404", async () => {
    const a = await probe(rootA);
    const b = await probe(rootB);

    expect(a.value.href).toBe("./assets/favicon.svg");
    expect(a.value.status).toBe(200);
    expect(a.value.body).toContain("CS");
    expect(a.value.body).not.toMatch(/prospector|leadhunter/i);
    expect(a.insp.consoleErrors).toEqual([]);
    expect(a.insp.horizontalOverflow).toBe(false);
    expect(a.value.title).toBe("Clínica Sorriso");

    expect(b.value.href).toBe("./assets/favicon.svg");
    expect(b.value.status).toBe(200);
    expect(b.value.body).toContain("PB");
    expect(b.value.body).not.toMatch(/prospector|leadhunter/i);
    expect(b.insp.consoleErrors).toEqual([]);

    // Isolamento: o favicon de A é diferente do de B.
    expect(a.value.body).not.toBe(b.value.body);
  });
});
