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
 * Busca uma skill do pack por id exato, parcial, ou pelo SEGMENTO do cliente
 * ("energia solar" → site-energia-solar; "academia" → site-academia-fitness).
 */
export function packSkillKnowledge(topic?: string | null): string | null {
  const t = normalizar(topic);
  if (!t || PACK_SKILLS.length === 0) return null;
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
  return `SKILLS SENIOR DO SEGMENTO (skills-pack): OBRIGATÓRIO chamar design_skills com o SEGMENTO do cliente antes de compor — o VERTICAL do nicho traz seções, objeções, PROVAS e DIREÇÃO FOTOGRÁFICA daquele negócio (nunca suponha).
Verticais: ${verticais}.
Demais skills do pack (design system, hierarquia, hero, copy, CRO, provas, motion, a11y, SEO, performance, mapas, WhatsApp, LGPD, testes): idem por topic.
O pack ORIENTA; a DIREÇÃO CRIATIVA do projeto decide composição, nº de seções, grid e tipografia.`;
}

export const PACK_INDEX_BLOCK = packIndexBlock();
