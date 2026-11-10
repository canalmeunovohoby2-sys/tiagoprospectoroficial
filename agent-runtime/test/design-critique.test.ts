import { describe, it, expect } from "vitest";
import { fallbackArtDirection } from "../src/studio/agent-core/art-direction";
import { critiqueSignals, critiqueGeneratedSite, formatCritique } from "../src/studio/agent-core/design-critique";
import { runFirstGenQaCycle } from "../src/studio/agent-core/firstgen-qa";
import type { VisualVerification } from "../src/studio/agent-core/visual-verify";

const business = {
  name: "OdontoVitta",
  segment: "odontologia",
  category: "clínica odontológica",
  city: "Campinas",
  state: "SP",
  services: ["Implantes", "Ortodontia", "Clareamento"],
};

const spec = fallbackArtDirection(business as never);

function goodFiles(s: ReturnType<typeof fallbackArtDirection>): Record<string, string> {
  const sections = s.sectionPlan.map((x) => `<section id="${x.id}"><h2>${x.purpose}</h2></section>`).join("\n");
  const hexes = s.palette.tokens.slice(0, 3).map((t) => t.hex).join(" ");
  return {
    "src/App.tsx": [
      `export default function App() {`,
      `  return (<div style={{ background: "${hexes}" }}>`,
      `    <nav>menu</nav>`,
      `    <h1>${s.concept}</h1>`,
      sections,
      `    <img src="/ambiente.jpg" alt="ambiente da clínica" />`,
      `    <a className="rounded-sm font-semibold">Agendar</a>`,
      `    <footer>contato</footer>`,
      `  </div>);`,
      `}`,
    ].join("\n"),
    "src/index.css": `:root{--f1:"${s.typography.heading}";--f2:"${s.typography.body}";} h1{font-family:var(--f1)} body{font-family:var(--f2)}`,
  };
}

function badFiles(): Record<string, string> {
  return {
    "src/App.tsx": [
      `<div className="min-h-screen text-center">`,
      `<h2>Bem-vindo</h2>`,
      `<div className="grid grid-cols-3"><div className="rounded-2xl">a</div></div>`,
      `<div className="grid grid-cols-3"><div className="rounded-2xl">b</div></div>`,
      `<div className="grid grid-cols-3"><div className="rounded-2xl">c</div></div>`,
      `<section className="text-center bg-gradient-to-r from-amber-100 to-white backdrop-blur-lg">`,
      `<a className="rounded-full">A</a><section className="text-center">mais</section><section className="text-center">mais</section><a className="rounded-full">B</a>`,
      `</section>`,
      `</div>`,
    ].join("\n"),
  };
}

const passVerification: VisualVerification = {
  verdict: "PASS", objective: "", viewports: [], problems: [], cssLeftovers: [],
  brokenElements: 0, criticalErrors: [], screenshots: [], report: "VISUAL VERIFICATION: PASS",
};

describe("design-critique — sinais objetivos", () => {
  it("detecta fontes da direção ausentes, centralização e repetição de 3 cards", () => {
    const f = critiqueSignals(spec, badFiles());
    expect(f.some((x) => x.severity === "high" && /Tipografia/i.test(x.area))).toBe(true);
    expect(f.some((x) => /centralizada|text-center/i.test(x.issue))).toBe(true);
    expect(f.some((x) => /3 colunas|3 cards/i.test(x.issue))).toBe(true);
    expect(f.some((x) => x.severity === "high" && /h1/i.test(x.issue))).toBe(true);
  });

  it("site coerente com a direção não gera problemas altos/médios", async () => {
    const files = goodFiles(spec);
    const c = await critiqueGeneratedSite({ spec, files });
    expect(c.checked).toBe(true);
    expect(c.verdict).toBe("PASS");
    expect(c.findings.filter((f) => f.severity === "high")).toHaveLength(0);
    expect(c.findings.filter((f) => f.severity === "medium")).toHaveLength(0);
  });

  it("não aprova site que viola a direção", async () => {
    const c = await critiqueGeneratedSite({ spec, files: badFiles(), verification: passVerification });
    expect(c.verdict).toBe("REVISE");
    const formatted = formatCritique(c);
    expect(formatted.pass).toBe(false);
    expect(formatted.issues.length).toBeGreaterThan(0);
  });

  it("sinais objetivos funcionam sem modelo e sem verificação", async () => {
    const c = await critiqueGeneratedSite({ spec, files: goodFiles(spec), verification: null });
    expect(c.checked).toBe(true);
    expect(c.reason).toContain("sinais objetivos");
  });
});

describe("design-critique — integração no QA (1 rodada, sem aprovação automática)", () => {
  const baseOpts = {
    root: process.cwd(),
    instruction: "Crie o site",
    business: business as never,
    buildProject: async () => ({ ok: true, html: "<h1>ok</h1>" }),
    runVisualVerification: async () => passVerification,
    correctWithAgent: async () => true,
  };

  it("crítica REVISE força a rodada de correção", async () => {
    let calls = 0;
    const r = await runFirstGenQaCycle({
      ...baseOpts,
      critique: async () => { calls++; return { pass: false, issues: ["[high] Tipografia: fontes da direção não aplicadas"] }; },
    });
    expect(calls).toBe(2);
    expect(r.correctionRound).toBe(true);
    expect(r.pass).toBe(false);
  });

  it("correção que resolve a crítica aprova (crítica reavaliada sem novo modelo)", async () => {
    let n = 0;
    const r = await runFirstGenQaCycle({
      ...baseOpts,
      critique: async () => {
        n++;
        return n === 1 ? { pass: false, issues: ["[high] Estrutura: seções ausentes"] } : { pass: true, issues: [] };
      },
    });
    expect(r.correctionRound).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("QA técnico aprovado + crítica aprovada não abre rodada", async () => {
    const r = await runFirstGenQaCycle({ ...baseOpts, critique: async () => ({ pass: true, issues: [] }) });
    expect(r.correctionRound).toBe(false);
    expect(r.pass).toBe(true);
  });
});
