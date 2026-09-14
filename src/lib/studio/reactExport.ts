// Export ZIP do projeto React (C5) — o ZIP contém o CÓDIGO-FONTE editável
// (não o `dist`). Reutiliza o filtro seguro de `siteDownload` (bloqueia
// node_modules/.git/.env/dist/build/supabase/segredos) e ainda remove artefatos
// internos do Studio (helper de preview/screenshot e pasta .prospector).

import JSZip from "jszip";
import { filterWorkspaceFiles } from "@/lib/siteDownload";

/** Artefatos internos que NUNCA fazem parte do projeto do cliente. */
const INTERNAL_ARTIFACT = /(^|\/)(?:\.prospector|prospector-react-visual-helper|screenshot-helper|visual-editor-helper)(?:\/|\.|$)|prospector-react-visual-helper|data-pfsrc/i;

export function filterReactProjectFiles(files: Record<string, string>): Record<string, string> {
  const cleaned = filterWorkspaceFiles(files);
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(cleaned)) {
    if (INTERNAL_ARTIFACT.test(path)) continue;
    out[path] = content;
  }
  return out;
}

function slugify(value: string): string {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** Gera o ZIP do projeto React (código-fonte). Nunca inclui dist/node_modules/.git/segredos. */
export async function exportReactProjectZip(
  files: Record<string, string>,
  name: string,
): Promise<{ blob: Blob; name: string; bytes: Uint8Array }> {
  const cleaned = filterReactProjectFiles(files);
  const slug = slugify(name) || "projeto-react";
  const zip = new JSZip();
  const folder = zip.folder(slug)!;
  for (const [path, content] of Object.entries(cleaned)) folder.file(path, content);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const blob = new Blob([bytes], { type: "application/zip" });
  return { blob, name: `${slug}.zip`, bytes };
}
