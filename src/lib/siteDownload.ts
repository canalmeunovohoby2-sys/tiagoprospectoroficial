import JSZip from "jszip";
import { collectSpecImages, sanitizeSlug, buildProjectFiles } from "./siteExportCore";

function extFrom(url: string, mime: string): string {
  if (mime === "image/png") return "png";
  const m = /\.(jpe?g|png|webp)/i.exec(url);
  return m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "jpg";
}

async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") && blob.size > 500 ? blob : null;
  } catch {
    return null;
  }
}

export async function exportProjectZip(spec: Record<string, unknown>): Promise<{ blob: Blob; name: string }> {
  const business = (spec.business && typeof spec.business === "object" ? spec.business : {}) as Record<string, unknown>;
  const company = typeof business.name === "string" ? business.name : "Meu Site";
  const root = sanitizeSlug(company, "meu-site");

  const urls = collectSpecImages(spec as never);
  const assetSrc: Record<string, string> = {};
  const external: string[] = [];
  const zip = new JSZip();
  const assets = zip.folder(`${root}/public/assets`)!;

  let index = 0;
  for (const url of urls) {
    const blob = await fetchImage(url);
    if (blob) {
      const ext = extFrom(url, blob.type);
      const path = `assets/img-${index}.${ext}`;
      assets.file(`img-${index}.${ext}`, blob);
      assetSrc[url] = `./${path}`;
    } else {
      external.push(url);
      assetSrc[url] = url;
    }
    index++;
  }

  const files = buildProjectFiles(spec as never, assetSrc, external);
  for (const [path, content] of Object.entries(files)) zip.file(path, content);

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, name: `${root}-site.zip` };
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await fetchImage(url);
    if (!blob) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function saveBlob(blob: Blob, fileName: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
