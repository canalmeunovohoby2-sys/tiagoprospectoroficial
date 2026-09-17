// Enquadramento do preview por dispositivo: NUNCA aumenta (zoom) o dispositivo.
//
// Histórico do bug: a escala era `min(2.5, cw/deviceW)` → no Mobile/Tablet o site
// era AMPLIADO (até 2,5×) e ficava gigante. O correto é mostrar o viewport no
// tamanho REAL quando couber e apenas REDUZIR quando não couber (desktop em
// painel estreito). Altura é limitada ao painel; o site rola por dentro.

export interface DeviceSize { width: number; height: number }

export function fitDeviceScale(containerWidth: number, containerHeight: number, device: DeviceSize): number {
  const cw = Math.max(160, containerWidth - 16);
  const ch = Math.max(160, containerHeight - 16);
  const byWidth = cw / device.width;
  const byHeight = ch / device.height;
  const scale = Math.min(1, byWidth, byHeight);   // teto 1: nunca amplia
  return Number.isFinite(scale) && scale > 0.05 ? scale : 1;
}
