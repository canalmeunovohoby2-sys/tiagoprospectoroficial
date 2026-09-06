// Captura do site NO NAVEGADOR DO CLIENTE (sem custo/servidor). Renderiza o
// código REAL do workspace num iframe srcdoc (desktop 1280×800 e mobile
// 390×760) e captura via html2canvas. Não usa Canvas para "compor" sobre fundo
// preto: o html2canvas renderiza o documento como exibido.
import html2canvas from "html2canvas";
import { prepareProjectPreview } from "@/lib/projectPreviewRuntime";

function waitLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { resolve(); };
    if (iframe.contentDocument?.readyState === "complete") { setTimeout(done, 60); return; }
    iframe.addEventListener("load", () => setTimeout(done, 60), { once: true });
  });
}

async function waitImages(doc: Document, timeoutMs = 4000): Promise<void> {
  const images = Array.from(doc.images ?? []);
  const wait: Promise<void>[] = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(() => res(), timeoutMs);
      img.addEventListener("load", () => { clearTimeout(t); res(); }, { once: true });
      img.addEventListener("error", () => { clearTimeout(t); res(); }, { once: true });
    });
  });
  await Promise.all(wait);
  await new Promise((r) => setTimeout(r, 450));
}

async function renderShot(html: string, width: number, height: number): Promise<string | null> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  try {
    await waitLoad(iframe);
    const doc = iframe.contentDocument;
    if (!doc?.body) return null;
    await waitImages(doc);
    const scale = width >= 1000 ? 0.6 : 1.4;
    const canvas = await html2canvas(doc.body as HTMLElement, {
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const quality = width >= 1000 ? 0.9 : 0.92;
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  } finally {
    try { iframe.remove(); } catch { /* noop */ }
  }
}

export async function captureWorkspaceScreenshotsClient(files: Record<string, string>): Promise<{ desktop?: string; mobile?: string }> {
  const prep = prepareProjectPreview(files);
  if (!prep.ok || !prep.document) return {};
  const html = prep.document;
  const desktop = await renderShot(html, 1280, 800);
  const mobile = await renderShot(html, 390, 760);
  if (!desktop && !mobile) return {};
  return { desktop: desktop ?? undefined, mobile: mobile ?? undefined };
}
