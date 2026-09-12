// Mockups realistas de dispositivo para a PROPOSTA EM PDF.
//
// Estratégia (única): frames LOCAIS de dispositivo + composição LOCAL em canvas,
// exatamente como no projeto Alqemist-labs/mockup-studio (licença MIT):
//   1) recorta a área da tela (screen rect, com cantos arredondados no iPhone);
//   2) desenha a captura REAL do site, encaixada na largura da tela (sem distorcer);
//   3) desenha o frame do aparelho POR CIMA (a tela do frame é vazada/transparente).
//
// Características:
// - 100% determinístico (mesma captura + mesmo asset = mesmo resultado);
// - ZERO chamadas de IA e ZERO chamadas HTTP externas em tempo de geração;
// - assets fixos em `public/mockups/` (ver NOTICE.txt);
// - fallback: se a composição falhar, o chamador usa a captura original.
//
// Base: https://github.com/Alqemist-labs/mockup-studio (MIT).
// Coordenadas de tela copiadas de lá (mesmo enquadramento dos dispositivos).

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export interface DeviceFrame {
  /** caminho local servido pela app (public/) — nunca URL externa. */
  src: string;
  width: number;
  height: number;
  screen: ScreenRect;
}

/** MacBook Pro 14" — frame frontal (3944×2564). */
export const MACBOOK: DeviceFrame = {
  src: "/mockups/apple-macbookpro14-front.png",
  width: 3944,
  height: 2564,
  screen: { x: 461, y: 300, w: 3023, h: 1963 },
};

/** iPhone 15 Pro (titanium preto, retrato) — frame frontal (1419×2796). */
export const IPHONE: DeviceFrame = {
  src: "/mockups/apple-iphone-15-pro-black-titanium-portrait.png",
  width: 1419,
  height: 2796,
  screen: { x: 100, y: 121, w: 1200, h: 2582, radius: 110 },
};

export interface ScreenshotDrawPlan {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Calcula como a captura entra na tela do aparelho (função PURA, testável).
 * - encaixa pela LARGURA da tela (nunca estica);
 * - mantém a proporção original da captura;
 * - `offsetRatio` (0..1) desloca verticalmente quando a captura é mais alta
 *   que a tela (0 = topo da página, como queremos na proposta).
 */
export function planScreenshotDraw(
  screen: Pick<ScreenRect, "x" | "y" | "w" | "h">,
  shotW: number,
  shotH: number,
  offsetRatio = 0,
): ScreenshotDrawPlan {
  const safeW = shotW > 0 ? shotW : 1;
  const safeH = shotH > 0 ? shotH : 1;
  const scale = screen.w / safeW;
  const scaledH = safeH * scale;
  const overflow = Math.max(0, scaledH - screen.h);
  const shift = Math.max(0, Math.min(1, offsetRatio)) * overflow;
  return { dx: screen.x, dy: screen.y - shift, dw: screen.w, dh: scaledH };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (rr <= 0) { ctx.rect(x, y, w, h); return; }
  if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

/**
 * Compõe a captura real dentro do dispositivo e devolve um PNG (data URL).
 * Lança se não houver canvas/imagens — o chamador trata como falha → fallback.
 */
export async function composeDeviceMockup(
  frame: DeviceFrame,
  screenshotDataUrl: string,
  offsetRatio = 0,
  maxWidth = 1700,
): Promise<string> {
  if (typeof document === "undefined") throw new Error("Sem DOM para compor o mockup");
  const [frameImg, shotImg] = await Promise.all([loadImage(frame.src), loadImage(screenshotDataUrl)]);
  const shotW = shotImg.naturalWidth || shotImg.width;
  const shotH = shotImg.naturalHeight || shotImg.height;
  if (!shotW || !shotH) throw new Error("Captura sem dimensões");

  // Renderiza em resolução suficiente para o PDF (limita a largura para não pesar).
  const scale = Math.min(1, maxWidth / frame.width);
  const W = Math.max(1, Math.round(frame.width * scale));
  const H = Math.max(1, Math.round(frame.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.scale(scale, scale);

  const s = frame.screen;
  const plan = planScreenshotDraw(s, shotW, shotH, offsetRatio);

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, s.x, s.y, s.w, s.h, s.radius ?? 0);
  ctx.clip();
  ctx.drawImage(shotImg, plan.dx, plan.dy, plan.dw, plan.dh);
  ctx.restore();

  // Frame por cima (a tela do frame é transparente).
  ctx.drawImage(frameImg, 0, 0, frame.width, frame.height);

  return canvas.toDataURL("image/png");
}

export async function renderLaptopMockup(desktopScreenshot: string, offsetRatio = 0): Promise<string> {
  return composeDeviceMockup(MACBOOK, desktopScreenshot, offsetRatio);
}

export async function renderIphoneMockup(mobileScreenshot: string, offsetRatio = 0): Promise<string> {
  return composeDeviceMockup(IPHONE, mobileScreenshot, offsetRatio);
}

export interface ProposalMockups {
  /** PNG do notebook com a captura real; null = usar fallback (captura original). */
  laptop: string | null;
  /** PNG do iPhone com a captura real; null = usar fallback (captura original). */
  iphone: string | null;
}

/**
 * Renderiza os dois mockups da proposta. NUNCA lança: em falha devolve null no
 * item afetado, para o PDF seguir com a captura original (fallback).
 */
export async function renderProposalMockups(input: {
  desktopScreenshot?: string | null;
  mobileScreenshot?: string | null;
  desktopOffset?: number;
  mobileOffset?: number;
  onError?: (error: unknown) => void;
}): Promise<ProposalMockups> {
  const safe = async (fn: () => Promise<string>): Promise<string | null> => {
    try {
      return await fn();
    } catch (error) {
      input.onError?.(error);
      return null;
    }
  };
  const laptop = input.desktopScreenshot
    ? await safe(() => renderLaptopMockup(input.desktopScreenshot as string, input.desktopOffset ?? 0))
    : null;
  const iphone = input.mobileScreenshot
    ? await safe(() => renderIphoneMockup(input.mobileScreenshot as string, input.mobileOffset ?? 0))
    : null;
  return { laptop, iphone };
}
