// PACK SENIOR (skills-pack-agente-senior) — RESTAURAÇÃO.
//
// O `DESIGN_FOUNDATIONS` condensou 01-core-design + 02-conversao-conteudo, mas os
// VERTICAIS (04-verticais) e as integrações NUNCA entraram no agente. São justamente
// os que trazem direção por nicho (seções, objeções, fotografia, provas) — a falta
// deles produzia site genérico e foto sem relação com o segmento.
//
// Aqui o pack (105 KB, 51 skills) fica DISPONÍVEL no repo: o índice leve entra no
// prompt e o texto completo é servido sob demanda pela ferramenta `design_skills`
// (prompt enxuto, técnica instalada — nada de reescrever skill antiga).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface PackSkill {
  id: string;
  title: string;
  group: string;
  body: string;
}

function packRoot(): string {
  const candidatos = [
    process.env.PROSPECTOR_SKILLS_PACK ?? "",
    join(process.cwd(), "skills-pack"),
    join(process.cwd(), "agent-runtime", "skills-pack"),
  ].filter(Boolean);
  return candidatos.find((p) => existsSync(p)) ?? "";
}

function load(): PackSkill[] {
  const root = packRoot();
  if (!root) return [];
  const out: PackSkill[] = [];
  const walk = (dir: string, group: string): void => {
    let entradas: Array<{ name: string; isDirectory(): boolean }> = [];
    try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const nome = String(e.name);
      if (e.isDirectory()) { walk(join(dir, nome), group || nome.replace(/^\d+-/, "")); continue; }
      if (!/\.md$/i.test(nome) || nome.toLowerCase() === "readme.md") continue;
      const pasta = dir.split(/[\\/]/).pop() ?? "";
      let body = "";
      try { body = readFileSync(join(dir, nome), "utf8").trim(); } catch { continue; }
      if (!body) continue;
      const titulo = (body.match(/^#\s+(.+)$/m)?.[1] ?? pasta).trim();
      out.push({ id: pasta, title: titulo, group: group || pasta, body });
    }
  };
  walk(root, "");
  return out;
}

export const PACK_SKILLS: PackSkill[] = load();

/** Verticais por segmento (as que faltavam) — lista curta para o índice do prompt. */
export const PACK_VERTICALS: PackSkill[] = PACK_SKILLS.filter((s) => s.group.includes("verticais"));

const normalizar = (v: unknown): string =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * APPS/SAAS/MOBILE (pack 07-mobile-saas-avancado) — quando o pedido é um PRODUTO
 * (não uma landing page), este é o conjunto certo de skills. Sem isso o agente
 * consultava só design de site e tratava SaaS/app como página comercial.
 */
const APP_SAAS_TOPICS: Array<{ match: RegExp; ids: string[] }> = [
  {
    match: /\b(saas|multi[- ]?tenant|dashboard|painel|assinatura|subscription|b2b|enterprise|crm|erp|plataforma|white[- ]?label)\b/,
    ids: [
      "white-label-multi-marca", "sso-enterprise-saml-oidc", "usage-based-billing-avancado",
      "audit-log-compliance", "api-rate-limiting-quotas", "webhooks-sistema-saida",
      "background-jobs-filas", "escalabilidade-multi-regiao-cache", "feature-flags-experimentacao",
    ],
  },
  {
    match: /\b(app|aplicativo|mobile|ios|android|celular|pwa|offline|push|loja de aplicativos)\b/,
    ids: [
      "cross-platform-framework-choice", "app-state-management", "offline-first-sync",
      "device-native-features", "push-notifications-avancado", "mobile-security-armazenamento-seguro",
      "app-store-aso-publicacao", "in-app-purchases-monetizacao", "ota-updates-versionamento",
      "deep-linking-universal-links", "crash-monitoring-observabilidade-mobile",
    ],
  },
];

function blocoAppSaas(t: string): string | null {
  const grupos = APP_SAAS_TOPICS.filter((g) => g.match.test(t));
  if (grupos.length === 0) return null;
  const ids = Array.from(new Set(grupos.flatMap((g) => g.ids)));
  const skills = ids
    .map((id) => PACK_SKILLS.find((s) => s.id === id))
    .filter((s): s is PackSkill => Boolean(s));
  if (skills.length === 0) return null;
  const corpo = skills.map((s) => `### SKILL: ${s.id}\n${s.body.slice(0, 1_400)}`).join("\n\n");
  return `SKILLS DE PRODUTO (SaaS/app/mobile) — este projeto é um PRODUTO, não uma landing page:\n\n${corpo}`;
}

/**
 * Busca uma skill do pack por id exato, parcial, ou pelo SEGMENTO do cliente
 * ("energia solar" → site-energia-solar; "academia" → site-academia-fitness).
 */
export function packSkillKnowledge(topic?: string | null): string | null {
  const t = normalizar(topic);
  if (!t || PACK_SKILLS.length === 0) return null;
  // Produto (SaaS/app/mobile) tem precedência: muda arquitetura, não só estética.
  const appSaas = blocoAppSaas(t);
  if (appSaas) return appSaas;
  const exato = PACK_SKILLS.find((s) => normalizar(s.id) === t);
  if (exato) return `${exato.title}\n\n${exato.body}`;
  const parcial = PACK_SKILLS.find((s) => normalizar(s.id).includes(t) || t.includes(normalizar(s.id)));
  if (parcial) return `${parcial.title}\n\n${parcial.body}`;
  // Segmento do cliente → vertical: id/título pesam MAIS que o corpo (senão um
  // segmento sem vertical casava com o primeiro arquivo que citasse a palavra).
  const palavras = t.split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
  const pontos = (s: PackSkill): number => {
    const cabeca = normalizar(`${s.id} ${s.title}`).replace(/-/g, " ");
    const corpo = normalizar(s.body);
    return palavras.reduce((acc, p) => acc + (cabeca.includes(p) ? 2 : 0) + (corpo.includes(p) ? 1 : 0), 0);
  };
  const melhor = PACK_SKILLS.map((s) => ({ s, p: pontos(s) })).sort((a, b) => b.p - a.p)[0];
  if (melhor && melhor.p > 0) return `${melhor.s.title}\n\n${melhor.s.body}`;
  return null;
}

/** Índice do pack para o prompt: compacto (o texto completo vem pela ferramenta). */
export function packIndexBlock(): string {
  if (PACK_SKILLS.length === 0) return "";
  const verticais = PACK_VERTICALS.map((s) => s.id).join(", ");
  return `SKILLS SENIOR DO SEGMENTO (skills-pack): CONHECIMENTO DISPONIVEL: consulte design_skills com o SEGMENTO do cliente quando ajudar (nao e obrigatorio) — o VERTICAL do nicho traz seções, objeções, PROVAS e DIREÇÃO FOTOGRÁFICA daquele negócio (nunca suponha).
Verticais: ${verticais}.
PRODUTO (SaaS, painel, app mobile, PWA, multi-tenant, cobrança, SSO, white-label): NÃO é landing page — chame design_skills com "saas" e/ou "mobile" para receber a arquitetura de produto (telas/rotas/estado/offline/monetização/publicação/segurança/escala). Regras de landing page (hero comercial, seção de contato, mapa embedado) NÃO se aplicam.
Demais skills do pack (design system, hierarquia, hero, copy, CRO, provas, motion, a11y, SEO, performance, mapas, WhatsApp, LGPD, testes): idem por topic.
O pack ORIENTA; a DIREÇÃO CRIATIVA do projeto decide composição, nº de seções, grid e tipografia.`;
}

export const PACK_INDEX_BLOCK = packIndexBlock();
