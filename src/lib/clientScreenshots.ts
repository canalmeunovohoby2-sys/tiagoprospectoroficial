// Captura do site NO NAVEGADOR DO CLIENTE (fallback sem servidor).
// Renderiza o código REAL num iframe srcdoc (desktop 1280 e mobile 390) e
// captura via html2canvas APENAS como último recurso (o caminho principal é o
// Chromium do Agent Runtime). Regras de fidelidade:
//  - nunca forçar fundo branco (sites com tema escuro ficariam errados);
//  - aguardar fontes/imagens/estabilização antes de capturar;
//  - rejeitar captura em branco/uniforme (nunca inserir imagem vazia no PDF).
import html2canvas from "html2canvas";
import { prepareProjectPreview } from "@/lib/projectPreviewRuntime";

function waitLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { setTimeout(resolve, 80); };
    if (iframe.contentDocument?.readyState === "complete") { setTimeout(done, 60); return; }
    iframe.addEventListener("load", () => setTimeout(done, 60), { once: true });
  });
}

async function waitReady(doc: Document, timeoutMs = 5000): Promise<void> {
  const images = Array.from(doc.images ?? []);
  const waits: Promise<void>[] = images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(() => res(), timeoutMs);
      img.addEventListener("load", () => { clearTimeout(t); res(); }, { once: true });
      img.addEventListener("error", () => { clearTimeout(t); res(); }, { once: true });
    });
  });
  await Promise.all(waits);
  try {
    const fonts = (doc as unknown as { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) await Promise.race([fonts.ready, new Promise((r) => setTimeout(r, timeoutMs))]);
  } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 600)); // estabiliza animações/layout
}

// Rejeita captura "vazia/uniforme" (tela branca/preta sem conteúdo).
function isMeaningful(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    const { width, height } = canvas;
    const step = Math.max(2, Math.floor(Math.max(width, height) / 40));
    const buckets = new Set<number>();
    let count = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        const bucket = ((d[0] >> 5) << 6) | ((d[1] >> 5) << 3) | (d[2] >> 5);
        buckets.add(bucket);
        count += 1;
      }
    }
    return count > 0 && buckets.size >= 2;
  } catch {
    return true; // não consegue validar → não bloqueia por segurança
  }
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
    await waitReady(doc);
    const scale = width >= 1000 ? 0.6 : 1.6;
    const canvas = await html2canvas(doc.body as HTMLElement, {
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scale,
      backgroundColor: "rgba(0,0,0,0)", // preserva o fundo REAL do tema (claro ou escuro)
      useCORS: true,
      allowTaint: false,
      imageTimeout: 6000,
      logging: false,
    });
    if (!isMeaningful(canvas)) return null; // tela em branco → não gera PDF com imagem falsa
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
  const desktop = await renderShot(html, 1280, 850);
  const mobile = await renderShot(html, 390, 844);
  if (!desktop && !mobile) return {};
  return { desktop: desktop ?? undefined, mobile: mobile ?? undefined };
}
