import { describe, it, expect } from "vitest";
import { PACK_SKILLS, PACK_INDEX_BLOCK, packSkillKnowledge } from "../src/studio/agent-core/skills-pack";
import { assertGenerationQuality } from "../src/generation-gate";

// Pacote 07-mobile-saas-avancado (20 skills) + correÃ§Ãµes que impediam o agente de
// criar PRODUTO (SaaS/app/mobile) em vez de sÃ³ landing page.
describe("pack mobile/saas Â· instalado e roteÃ¡vel", () => {
  it("carrega as 20 skills de produto (pack >= 100)", () => {
    expect(PACK_SKILLS.length).toBeGreaterThanOrEqual(100);
    for (const id of [
      "cross-platform-framework-choice",
      "app-state-management",
      "offline-first-sync",
      "device-native-features",
      "in-app-purchases-monetizacao",
      "app-store-aso-publicacao",
      "push-notifications-avancado",
      "mobile-security-armazenamento-seguro",
      "sso-enterprise-saml-oidc",
      "white-label-multi-marca",
      "usage-based-billing-avancado",
      "audit-log-compliance",
      "background-jobs-filas",
      "webhooks-sistema-saida",
      "api-rate-limiting-quotas",
      "escalabilidade-multi-regiao-cache",
      "feature-flags-experimentacao",
      "deep-linking-universal-links",
      "ota-updates-versionamento",
      "crash-monitoring-observabilidade-mobile",
    ]) {
      expect(PACK_SKILLS.some((s) => s.id === id), `faltou ${id}`).toBe(true);
    }
  });

  it("pedido de SaaS devolve arquitetura de PRODUTO (SSO, white-label, cobranÃ§a por uso)", () => {
    const r = packSkillKnowledge("saas multi-tenant com painel e assinatura") ?? "";
    expect(r).toContain("SKILLS DE PRODUTO");
    expect(r).toMatch(/white-label-multi-marca/);
    expect(r).toMatch(/sso-enterprise-saml-oidc/);
    expect(r).toMatch(/usage-based-billing-avancado/);
  });

  it("pedido de app/mobile devolve stack, estado, offline, loja e push", () => {
    const r = packSkillKnowledge("app mobile offline para iOS e Android") ?? "";
    expect(r).toContain("SKILLS DE PRODUTO");
    expect(r).toMatch(/cross-platform-framework-choice/);
    expect(r).toMatch(/app-state-management/);
    expect(r).toMatch(/offline-first-sync/);
    expect(r).toMatch(/app-store-aso-publicacao/);
  });

  it("o Ã­ndice do prompt avisa que PRODUTO nÃ£o segue regras de landing page", () => {
    expect(PACK_INDEX_BLOCK).toMatch(/PRODUTO \(SaaS/);
    expect(PACK_INDEX_BLOCK).toMatch(/landing page/);
  });

  it("nÃ£o quebra o roteamento de vertical de site (regressÃ£o)", () => {
    expect(packSkillKnowledge("energia solar")).toMatch(/Energia Solar/i);
    expect(packSkillKnowledge("odontologia")).toMatch(/Odontol/i);
  });
});

describe("gate Â· mapa sÃ³ Ã© exigido de SITE (landing), nunca de PRODUTO", () => {
  const DASH = `<div class="sidebar"><h1>Painel do assinante</h1><button>Fazer login</button><section id="router"><p>VisÃ£o geral do uso do plano</p></section></div>`;
  const LANDING = `<header><nav>Menu</nav></header><section class="hero"><h1>ClÃ­nica Sorriso</h1><a href="#contato">Agendar</a></section><section id="contato"><p>Fale conosco</p><p>Rua das Flores, 120 - Bertioga/SP</p></section>`;

  it("dashboard/app sem mapa NÃƒO Ã© reprovado por falta de Google Maps", () => {
    const r = assertGenerationQuality({ "index.html": DASH }, {});
    expect(r.issues.join(" | ")).not.toMatch(/Sem Google Maps embutido/);
  });

  it("landing page sem mapa CONTINUA sendo reprovada (qualidade preservada)", () => {
    const r = assertGenerationQuality({ "index.html": LANDING }, {});
    expect(r.issues.join(" | ")).toMatch(/Sem Google Maps embutido/);
  });

  it("produto COM seÃ§Ã£o de contato e sem mapa recebe orientaÃ§Ã£o especÃ­fica", () => {
    const comContato = `${DASH}<section id="contato"><p>Fale conosco</p><p>contato@empresa.com</p></section>`;
    const r = assertGenerationQuality({ "index.html": comContato }, {});
    expect(r.issues.join(" | ")).toMatch(/contato\/localiza/i);
  });
});
