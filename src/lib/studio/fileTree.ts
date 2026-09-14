// Utilidades do filesystem do Studio sobre o mapa plano `{ path: content }`
// (`site_projects.generated_code`). Sem I/O — funções puras e testáveis.

import type { StudioFileMap, StudioFileNode } from "./types";

export function baseName(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

export function normalizeStudioPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
}

/** Ordena diretórios antes de arquivos e, dentro de cada grupo, alfabeticamente. */
function sortNodes(nodes: StudioFileNode[]): StudioFileNode[] {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  for (const node of nodes) {
    if (node.isDir) sortNodes(node.children);
  }
  return nodes;
}

export function buildFileTree(paths: string[]): StudioFileNode[] {
  const root: StudioFileNode = { name: "", path: "", isDir: true, children: [] };
  const dirIndex = new Map<string, StudioFileNode>([["", root]]);

  for (const raw of paths) {
    const path = normalizeStudioPath(raw);
    if (!path) continue;
    const parts = path.split("/").filter(Boolean);
    let parent = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      if (isFile) {
        parent.children.push({ name: parts[i], path: acc, isDir: false, children: [] });
        continue;
      }
      let dir = dirIndex.get(acc);
      if (!dir) {
        dir = { name: parts[i], path: acc, isDir: true, children: [] };
        dirIndex.set(acc, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
  }
  return sortNodes(root.children);
}

const EXT_LANGUAGE: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  svg: "xml",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  txt: "plaintext",
  py: "python",
  sh: "shell",
  sql: "sql",
};

export function languageForPath(path: string): string {
  const name = baseName(path).toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return EXT_LANGUAGE[ext] ?? "plaintext";
}

export function createFilePath(files: StudioFileMap, path: string): StudioFileMap {
  const clean = normalizeStudioPath(path);
  if (!clean || files[clean] !== undefined) return files;
  return { ...files, [clean]: "" };
}

export function deleteFilePath(files: StudioFileMap, path: string): StudioFileMap {
  const clean = normalizeStudioPath(path);
  if (files[clean] === undefined) return files;
  const next: StudioFileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (k !== clean) next[k] = v;
  }
  return next;
}

/**
 * Renomeia a chave de um arquivo. O `generated_code` é um mapa plano, então
 * renomear = remover a chave antiga + criar a nova. Referências internas em
 * HTML/CSS NÃO são reescritas aqui de propósito (fase 3 trata referências e
 * avisa o usuário sobre possíveis links quebrados).
 */
export function renameFilePath(files: StudioFileMap, oldPath: string, newPath: string): StudioFileMap {
  const from = normalizeStudioPath(oldPath);
  const to = normalizeStudioPath(newPath);
  if (!from || !to || from === to || files[from] === undefined) return files;
  const next: StudioFileMap = {};
  for (const [k, v] of Object.entries(files)) {
    if (k === from) {
      next[to] = v;
    } else {
      next[k] = v;
    }
  }
  return next;
}

/**
 * Fonte ÚNICA do editor: aplica os rascunhos NÃO salvos (buffer do Monaco) sobre
 * o mapa persistido. Regras que evitam divergência:
 * - rascunho de arquivo REMOVIDO é descartado (não ressuscita arquivo);
 * - rascunho IGUAL ao salvo é ignorado (sem "dirty" fantasma);
 * - caminhos são normalizados.
 */
export function mergeEffectiveFiles(files: StudioFileMap, overrides: StudioFileMap): StudioFileMap {
  const out: StudioFileMap = { ...files };
  for (const [rawPath, content] of Object.entries(overrides ?? {})) {
    const path = normalizeStudioPath(rawPath);
    if (!path || files[path] === undefined) continue;
    if (files[path] === content) continue;
    out[path] = content;
  }
  return out;
}

/** Caminhos com alterações NÃO salvas (rascunho difere do arquivo persistido). */
export function computeDirtyPaths(overrides: StudioFileMap, files: StudioFileMap): string[] {
  return Object.keys(overrides ?? {}).filter((rawPath) => {
    const path = normalizeStudioPath(rawPath);
    return files[path] !== undefined && overrides[rawPath] !== files[path];
  });
}

export function hasUnsavedChanges(overrides: StudioFileMap, files: StudioFileMap): boolean {
  return computeDirtyPaths(overrides, files).length > 0;
}

