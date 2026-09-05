// Attachments (5.26) — materializa anexos do chat no workspace do projeto com
// segurança, para o Cline acessar/ler/analisar de verdade (não só dataURL).
//
// O workspace é um mapa de TEXTO (persistido em generated_code). Imagens/binários
// são guardados como DATA URL (string base64) no arquivo do workspace — assim o
// conteúdo sobrevive ao persistir/carregar, o Cline pode ler e, se quiser usar
// a imagem no site, embuti-la inline (funciona em preview/export/standalone).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ChatAttachment {
  name?: string;
  mediaType?: string;
  dataUrl?: string;
  label?: string;
}

export interface MaterializedAttachment {
  name: string;
  path: string;      // caminho real dentro do workspace (ex.: assets/meu-pet.png)
  mediaType: string;
  bytes: number;     // tamanho decodificado (para validação)
  dataUrl: string;   // conteúdo materializado (texto) — guardado no arquivo
}

const MAX_BYTES = 2_200_000; // ~2MB

function isAllowedName(name: string): boolean {
  if (!name) return false;
  const clean = name.replace(/\\/g, "/");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length !== 1) return false; // sem subpastas/.. / absoluto
  if (/\.env($|\.)/i.test(name)) return false;
  if (/\.(exe|bat|cmd|sh|ps1|dll|so|dylib|apk|js|ts|mjs|html?)$/i.test(name)) return false;
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}

function extFor(mediaType: string): string {
  if (/^image\/png$/i.test(mediaType)) return "png";
  if (/^image\/jpe?g$/i.test(mediaType)) return "jpg";
  if (/^image\/webp$/i.test(mediaType)) return "webp";
  if (/^image\/gif$/i.test(mediaType)) return "gif";
  if (/^image\/svg\+xml$/i.test(mediaType)) return "svg";
  if (/^text\/plain$/i.test(mediaType)) return "txt";
  if (/^text\/markdown$/i.test(mediaType)) return "md";
  if (/^application\/json$/i.test(mediaType)) return "json";
  if (/^application\/pdf$/i.test(mediaType)) return "pdf";
  return "";
}

export interface MaterializeResult {
  ok: boolean;
  attachments: MaterializedAttachment[];
  errors: string[];
}

// Materializa anexos no workspace (ex.: assets/<slug>-<nome>). Seguro.
export function materializeAttachments(
  workspaceRoot: string,
  attachments: ChatAttachment[] | undefined | null,
): MaterializeResult {
  const out: MaterializedAttachment[] = [];
  const errors: string[] = [];
  if (!Array.isArray(attachments) || attachments.length === 0) return { ok: true, attachments: [], errors };

  const assetsDir = join(workspaceRoot, "assets");
  mkdirSync(assetsDir, { recursive: true });

  attachments.forEach((att, idx) => {
    if (!att || typeof att !== "object") { errors.push(`Anexo ${idx}: inválido.`); return; }
    const rawName = (att.name ?? att.label ?? "anexo").trim();
    const dataUrl = typeof att.dataUrl === "string" ? att.dataUrl.trim() : "";
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): dados inválidos.`); return; }
    const mediaType = (att.mediaType && extFor(att.mediaType)) ? (att.mediaType || "") : (m[1] || "");
    if (!extFor(mediaType)) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): tipo não permitido (${mediaType || "desconhecido"}).`); return; }
    const approx = Math.round((m[3].length * 3) / 4);
    if (approx === 0 || approx > MAX_BYTES) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): vazio ou grande demais (>~2MB).`); return; }

    const base = (rawName || `anexo-${idx + 1}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const slug = (base.split(".")[0] || `anexo-${idx + 1}`).slice(0, 40);
    const ext = extFor(mediaType);
    const safeName = `${slug}-${idx + 1}.${ext}`;
    if (!isAllowedName(safeName)) { errors.push(`Anexo ${idx}: nome não permitido.`); return; }

    // Garante dataUrl com mediaType correto e grava como TEXTO no workspace.
    const normalizedDataUrl = dataUrl.startsWith("data:") ? dataUrl : `data:${mediaType};base64,${m[3]}`;
    const filePath = join(assetsDir, safeName);
    writeFileSync(filePath, normalizedDataUrl, "utf8");
    out.push({
      name: safeName,
      path: `assets/${safeName}`,
      mediaType,
      bytes: approx,
      dataUrl: normalizedDataUrl,
    });
  });

  return { ok: errors.length === 0, attachments: out, errors };
}
