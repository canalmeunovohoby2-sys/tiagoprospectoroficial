import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Launcher unico do stack local (Windows): sobe Agent Runtime (8787), Maps (8788)
// e Photos (8789) sem duplicar quem ja estiver no ar. Nada aqui pode citar Railway.
const ROOT = process.cwd();
const bat = () => readFileSync(join(ROOT, "INICIAR-TIAGOPROSPECTOR.bat"), "utf8");
const parar = () => readFileSync(join(ROOT, "PARAR-TIAGOPROSPECTOR.bat"), "utf8");

describe("INICIAR-TIAGOPROSPECTOR.bat — launcher dos tres motores locais", () => {
  it("existe na raiz e e portatil (usa o proprio diretorio)", () => {
    expect(existsSync(join(ROOT, "INICIAR-TIAGOPROSPECTOR.bat"))).toBe(true);
    expect(bat()).toContain("%~dp0");
    expect(bat()).not.toMatch(/C:\\Users\\/i);
  });

  it("cobre as tres portas do stack local", () => {
    const src = bat();
    expect(src).toContain("8787");
    expect(src).toContain("8788");
    expect(src).toContain("8789");
    expect(src).toContain("agent-runtime");
    expect(src).toContain("mapscraper-service");
    expect(src).toContain("gmapsphotos-service");
  });

  it("confere o health ANTES de iniciar (nao cria duplicata)", () => {
    const src = bat();
    expect(src).toContain(":esperar");
    expect(src).toContain("ja estava ativo - reutilizando");
    expect(src).toContain("/health");
  });

  it("instala dependencias somente quando faltam", () => {
    const src = bat();
    expect(src).toContain("if not exist \"%ROOT%\\agent-runtime\\node_modules\"");
    expect(src).toContain(".deps-ok");
  });

  it("nao depende do Railway", () => {
    expect(bat().toLowerCase()).not.toContain("railway");
  });
});

describe("PARAR-TIAGOPROSPECTOR.bat — encerra so o stack local", () => {
  it("mata apenas os PIDs que escutam nas portas do stack", () => {
    const src = parar();
    expect(src).toContain("netstat -ano");
    expect(src).toContain("taskkill /PID");
    expect(src).toContain("8787");
    expect(src).toContain("8788");
    expect(src).toContain("8789");
    expect(src.toLowerCase()).not.toContain("railway");
  });
});
