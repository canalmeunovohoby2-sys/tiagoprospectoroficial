/**
 * ANTI-REPETIÇÃO (histórico de estilos por segmento) — integração do pacote
 * `site-generator-pipeline` (antiRepetitionStore.ts) NO runtime do TiagoProspector.
 *
 * Por que existe: modelos convergem para a "resposta mais provável" quando não
 * sabem o que já foi usado. Instrução textual de "seja criativo" não resolve —
 * o que resolve é passar a lista CONCRETA do que já saiu (paleta, headline,
 * estrutura) e mandar NÃO repetir.
 *
 * Assinaturas mantidas como no pacote original (`salvarNoHistorico`,
 * `buscarUltimosRegistros`, `montarContextoAntiRepeticao`) para que nenhum
 * outro arquivo precise mudar. Store em arquivo JSON (sem migração/infra nova);
 * trocar por tabela no Supabase depois é substituir o corpo destas 2 funções.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RegistroHistorico {
  id: string;
  criadoEm: string;
  segmento: string;
  corPrimaria: string;
  corDestaque: string;
  estiloVisual: string;
  estruturaDeSecoes: string[];
  headlineDoHero: string;
  /** Comentário "ART-DIRECTION:" lido do código gerado, quando existir. */
  artDirection?: string;
}

export interface BriefingResumo {
  paleta?: { corPrimaria?: string; corDestaque?: string };
  estiloVisual?: { descricao?: string };
  estruturaDeSecoes?: string[];
  promessaCentral?: string;
}

const LIMITE = 200;

function caminhoArquivo(): string {
  return process.env.PROSPECTOR_STYLE_HISTORY ?? join(process.cwd(), "data", "historico-sites.json");
}

function lerTudo(): RegistroHistorico[] {
  const arquivo = caminhoArquivo();
  try {
    if (!existsSync(arquivo)) return [];
    const bruto = JSON.parse(readFileSync(arquivo, "utf8")) as unknown;
    return Array.isArray(bruto) ? (bruto as RegistroHistorico[]) : [];
  } catch {
    return [];
  }
}

function gravar(registros: RegistroHistorico[]): void {
  const arquivo = caminhoArquivo();
  try {
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, JSON.stringify(registros.slice(-LIMITE), null, 2), "utf8");
  } catch {
    /* histórico é otimização: nunca derruba a geração */
  }
}

/** Salva o resumo do site gerado (paleta/estilo/estrutura/headline). */
export function salvarNoHistorico(segmento: string, briefing: BriefingResumo, artDirection?: string): RegistroHistorico {
  const registros = lerTudo();
  const novo: RegistroHistorico = {
    id: randomUUID(),
    criadoEm: new Date().toISOString(),
    segmento: String(segmento ?? "").trim(),
    corPrimaria: briefing?.paleta?.corPrimaria ?? "",
    corDestaque: briefing?.paleta?.corDestaque ?? "",
    estiloVisual: briefing?.estiloVisual?.descricao ?? "",
    estruturaDeSecoes: Array.isArray(briefing?.estruturaDeSecoes) ? briefing.estruturaDeSecoes : [],
    headlineDoHero: briefing?.promessaCentral ?? "",
    ...(artDirection ? { artDirection: artDirection.slice(0, 400) } : {}),
  };
  registros.push(novo);
  gravar(registros);
  return novo;
}

/** Últimos N registros do MESMO segmento (ou dos últimos N gerados, se pedir global). */
export function buscarUltimosRegistros(segmento: string, quantidade = 5, global = false): RegistroHistorico[] {
  const alvo = String(segmento ?? "").trim().toLowerCase();
  const registros = lerTudo();
  const filtrados = global ? registros : registros.filter((r) => String(r.segmento ?? "").toLowerCase() === alvo);
  return filtrados.slice(-Math.max(1, quantidade));
}

/** Bloco pronto para o prompt: o que NÃO repetir. */
export function montarContextoAntiRepeticao(registros: RegistroHistorico[]): string {
  if (registros.length === 0) {
    return "Nenhum site anterior registrado para este segmento ainda — você tem liberdade total de escolha (mas NUNCA use a paleta default de framework).";
  }
  const linhas = registros.map((r, i) => {
    const secoes = (r.estruturaDeSecoes ?? []).join(" > ") || "(não registrada)";
    return `${i + 1}. Paleta: ${r.corPrimaria || "?"} / ${r.corDestaque || "?"} | Estilo: ${r.estiloVisual || "?"} | Headline: "${r.headlineDoHero || "?"}" | Seções: ${secoes}`;
  });
  return [
    "Sites JÁ gerados recentemente (NÃO REPITA a paleta, o headline nem a estrutura de seções abaixo — escolha algo VISIVELMENTE diferente):",
    ...linhas,
  ].join("\n");
}

/** Extrai o resumo do que foi realmente entregue (comentário ART-DIRECTION + CSS). */
export function extrairResumoDoCodigo(arquivos: Record<string, string>): { artDirection: string; hexes: string[] } {
  const tudo = Object.values(arquivos ?? {}).join("\n");
  const artDirection = tudo.match(/ART-DIRECTION:?\s*([^\n*]{10,400})/i)?.[1]?.trim() ?? "";
  const hexes = Array.from(new Set(tudo.match(/#[0-9a-f]{6}\b/gi)?.map((h) => h.toLowerCase()) ?? []));
  return { artDirection, hexes };
}
