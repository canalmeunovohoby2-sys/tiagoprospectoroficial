// MAPA estático (tiles OSM) — sem iframe e sem chave de API.
//
// POR QUÊ: o app é cross-origin isolated (COEP) para o WebContainer, e sob COEP
// QUALQUER iframe cross-origin sem CORP é bloqueado pelo Chromium
// (net::ERR_BLOCKED_BY_RESPONSE → "A conexão com maps.google.com foi recusada").
// Imagens, porém, carregam normalmente. Então o mapa do site é montado com tiles
// (imagens) + marcador + botão "Abrir no Google Maps" (link real do Google).
// Comprovado em Chromium: iframes bloqueados, tiles carregando sob credentialless.

import type { BusinessContext } from "../../tools.js";

interface Point { lat: number; lng: number }

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Coordenadas do negócio (só lat/lng; sem geocodificação não há marcador). */
export function businessPoint(business: BusinessContext): Point | null {
  const lat = num(business.latitude);
  const lng = num(business.longitude);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Converte lat/lng em coordenada de tile (fracionária) no zoom Z. */
export function tileCoords(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export interface StaticMap {
  /** URLs dos 4 tiles (2x2) em ordem [topo-esq, topo-dir, baixo-esq, baixo-dir]. */
  tiles: string[];
  /** Posição do marcador em px dentro do bloco 512x512. */
  marker: { x: number; y: number };
}

const TILE = 256;

/** Monta o mapa 2x2 (512px) centrado no ponto, com o marcador na posição exata. */
export function buildStaticMap(point: Point, zoom = 15): StaticMap {
  const { x, y } = tileCoords(point.lat, point.lng, zoom);
  const startX = Math.floor(x - 0.5);
  const startY = Math.floor(y - 0.5);
  const max = 2 ** zoom - 1;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const tiles: string[] = [];
  for (const dy of [0, 1]) {
    for (const dx of [0, 1]) {
      tiles.push(`https://tile.openstreetmap.org/${zoom}/${clamp(startX + dx)}/${clamp(startY + dy)}.png`);
    }
  }
  return { tiles, marker: { x: Math.round((x - startX) * TILE), y: Math.round((y - startY) * TILE) } };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** URL de rota (Google Maps) — o link REAL do Google para o cliente. */
export function mapsDirectionsUrl(business: BusinessContext): string | null {
  const p = businessPoint(business);
  if (p) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const addr = typeof business.address === "string" ? business.address.trim() : "";
  const place = [business.city, business.state].filter((v) => typeof v === "string" && v.trim()).join("/");
  const q = [addr, place].filter(Boolean).join(", ");
  if (!q) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

/**
 * RUNTIME do mapa INTERATIVO (vanilla JS, SEM dependências e SEM iframe).
 *
 * Por que assim: o site roda em contexto COEP (isolamento do WebContainer) e ali
 * QUALQUER iframe cross-origin é bloqueado — então um embed do Google não é
 * navegável. Este runtime monta os tiles (imagens, permitidas sob COEP) e dá
 * interatividade real: arrastar (pan), roda do mouse e botões (+/−) para zoom,
 * marcador e atribuição. Funciona no preview E no publicado.
 */
export function buildMapRuntimeScript(): string {
  return `/* prospector-map-runtime */
(function(){
  var TILE=256, MINZ=3, MAXZ=19;
  function tileXY(lat,lng,z){ var n=Math.pow(2,z); var x=(lng+180)/360*n; var r=lat*Math.PI/180; var y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n; return {x:x,y:y}; }
  function lngLatFromTile(x,y,z){ var n=Math.pow(2,z); var lng=x/n*360-180; var lat=Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI; return {lat:lat,lng:lng}; }
  function init(el){
    if(el.getAttribute("data-pf-map-ready")==="1") return; el.setAttribute("data-pf-map-ready","1");
    var lat=parseFloat(el.getAttribute("data-lat")), lng=parseFloat(el.getAttribute("data-lng"));
    var z=parseInt(el.getAttribute("data-zoom")||"15",10);
    if(!isFinite(lat)||!isFinite(lng)) return;
    el.style.position="relative"; el.style.width="100%"; el.style.height="100%"; el.style.minHeight="240px"; el.style.overflow="hidden"; el.style.touchAction="none"; el.style.cursor="grab"; el.style.background="#e5e7eb";
    var stage=document.createElement("div"); stage.style.cssText="position:absolute;left:0;top:0;will-change:transform"; el.appendChild(stage);
    var dx=0, dy=0, dragging=false, moved=false, startX=0, startY=0;
    function render(){
      stage.innerHTML="";
      var c=tileXY(lat,lng,z); var n=Math.pow(2,z);
      var w=el.clientWidth||640, h=el.clientHeight||320;
      var cols=Math.ceil(w/TILE)+2, rows=Math.ceil(h/TILE)+2;
      var sx=Math.floor(c.x-cols/2), sy=Math.floor(c.y-rows/2);
      var baseX=-((c.x-sx)*TILE-w/2), baseY=-((c.y-sy)*TILE-h/2);
      stage.style.transform="translate("+(baseX+dx)+"px,"+(baseY+dy)+"px)";
      for(var j=0;j<rows;j++){ for(var i=0;i<cols;i++){
        var X=sx+i, Y=sy+j; if(X<0||Y<0||X>=n||Y>=n) continue;
        var img=document.createElement("img"); img.alt=""; img.loading="lazy"; img.draggable=false;
        // COEP (o site roda isolado por COOP/COEP no Vercel): imagens no-cors são
        // BLOQUEADAS. O tile do OSM manda Access-Control-Allow-Origin:*, então
        // carregar em modo CORS (crossOrigin=anonymous) faz o mapa aparecer.
        img.crossOrigin="anonymous";
        img.src="https://tile.openstreetmap.org/"+z+"/"+X+"/"+Y+".png";
        img.style.cssText="position:absolute;left:"+(i*TILE)+"px;top:"+(j*TILE)+"px;width:"+TILE+"px;height:"+TILE+"px";
        stage.appendChild(img);
      }}
      var m=document.createElement("div");
      m.style.cssText="position:absolute;left:"+((c.x-sx)*TILE)+"px;top:"+((c.y-sy)*TILE)+"px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:9999px;background:#dc2626;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.4)";
      stage.appendChild(m);
      el.setAttribute("data-pf-zoom",String(z));
    }
    function apply(){ var c=tileXY(lat,lng,z); var sx=c.x-dx/TILE, sy=c.y-dy/TILE; var p=lngLatFromTile(sx,sy,z); lat=p.lat; lng=p.lng; dx=0; dy=0; render(); }
    el.addEventListener("pointerdown",function(e){ if(e.target&&e.target.getAttribute&&e.target.getAttribute("data-pf-ui")) return; dragging=true; moved=false; startX=e.clientX; startY=e.clientY; try{ el.setPointerCapture(e.pointerId); }catch(_){ } el.style.cursor="grabbing"; });
    el.addEventListener("pointermove",function(e){ if(!dragging) return; dx=e.clientX-startX; dy=e.clientY-startY; if(Math.abs(dx)+Math.abs(dy)>3) moved=true; stage.style.transform=stage.style.transform.replace(/translate\\([^)]*\\)/,"translate(0px,0px)"); var c=tileXY(lat,lng,z); var w=el.clientWidth||640,h=el.clientHeight||320; var cols=Math.ceil(w/TILE)+2,rows=Math.ceil(h/TILE)+2; var sx=Math.floor(c.x-cols/2),sy=Math.floor(c.y-rows/2); var baseX=-((c.x-sx)*TILE-w/2),baseY=-((c.y-sy)*TILE-h/2); stage.style.transform="translate("+(baseX+dx)+"px,"+(baseY+dy)+"px)"; });
    function end(){ if(!dragging) return; dragging=false; el.style.cursor="grab"; if(moved) apply(); }
    el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end); el.addEventListener("pointerleave",end);
    el.addEventListener("wheel",function(e){ e.preventDefault(); var d=e.deltaY<0?1:-1; z=Math.max(MINZ,Math.min(MAXZ,z+d)); render(); },{passive:false});
    function controls(){ return el.parentElement?el.parentElement.querySelectorAll("[data-pf-zoom-step]"):[]; }
    function wire(){ var bs=controls(); for(var i=0;i<bs.length;i++){ (function(b){ if(b.getAttribute("data-pf-wired")==="1") return; b.setAttribute("data-pf-wired","1"); b.addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation(); var s=parseInt(b.getAttribute("data-pf-zoom-step"),10)||1; z=Math.max(MINZ,Math.min(MAXZ,z+s)); render(); }); })(bs[i]); } }
    render(); wire();
    new MutationObserver(function(){ if(!el.isConnected) return; render(); wire(); }).observe(el.parentElement||el,{childList:true});
  }
  function boot(){ var els=document.querySelectorAll("[data-pf-map]"); for(var i=0;i<els.length;i++){ try{ init(els[i]); }catch(e){} } }
  if(document.readyState!=="loading") boot(); else document.addEventListener("DOMContentLoaded",boot);
  window.addEventListener("load",boot);
  try{ new MutationObserver(function(){ boot(); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
})();`;
}

/** Injeta o runtime do mapa no index.html (idempotente). */
export function injectMapRuntimeIntoHtml(html: string): string {
  if (!html || html.includes("prospector-map-runtime")) return html;
  const tag = `<script>${buildMapRuntimeScript()}</script>`;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  return idx >= 0 ? `${html.slice(0, idx)}${tag}\n${html.slice(idx)}` : `${html}\n${tag}`;
}

export interface StaticMapBlockOptions {
  /** Classe Tailwind do container (altura). Default h-[320px]. */
  heightClass?: string;
  /** Rota textual exibida acima/abaixo (ex.: endereço). */
  address?: string | null;
}

/**
 * Bloco JSX do mapa: um contêiner interativo (`data-pf-map`) + controles de zoom,
 * marcador, atribuição e botão "Abrir no Google Maps". O runtime (script acima)
 * torna o mapa navegável — sem iframe e sem chave.
 */
export function buildStaticMapBlock(business: BusinessContext, opts: StaticMapBlockOptions = {}): string | null {
  const directions = mapsDirectionsUrl(business);
  const point = businessPoint(business);
  const heightClass = opts.heightClass ?? "h-[320px]";
  const address = (opts.address ?? (typeof business.address === "string" ? business.address : "")) || "";

  if (!point) {
    if (!directions) return null;
    return [
      `<div className="relative w-full ${heightClass} overflow-hidden rounded-xl border border-black/10 bg-neutral-100" style={{ position: "relative", width: "100%", height: "320px", overflow: "hidden" }}>`,
      `  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center" style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px", textAlign: "center" }}>`,
      address ? `    <p className="text-sm font-medium text-neutral-800">${esc(address)}</p>` : "",
      `    <a href="${esc(directions)}" target="_blank" rel="noreferrer" className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white">Abrir no Google Maps</a>`,
      `  </div>`,
      `</div>`,
    ].filter(Boolean).join("\n");
  }

  return [
    `<div className="relative w-full ${heightClass} overflow-hidden rounded-xl border border-black/10 bg-neutral-200" style={{ position: "relative", width: "100%", height: "320px", overflow: "hidden" }}>`,
    `  <div data-pf-map data-lat="${point.lat}" data-lng="${point.lng}" data-zoom="15" className="absolute inset-0" style={{ position: "absolute", inset: 0 }} />`,
    `  <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow">`,
    `    <button type="button" data-pf-zoom-step="1" data-pf-ui="1" aria-label="Aproximar" className="h-8 w-8 text-lg leading-none text-neutral-800 hover:bg-neutral-100">+</button>`,
    `    <button type="button" data-pf-zoom-step="-1" data-pf-ui="1" aria-label="Afastar" className="h-8 w-8 border-t border-black/10 text-lg leading-none text-neutral-800 hover:bg-neutral-100">−</button>`,
    `  </div>`,
    directions ? `  <a href="${esc(directions)}" target="_blank" rel="noreferrer" data-pf-ui="1" className="absolute bottom-2 right-2 z-10 rounded-lg bg-black/75 px-2.5 py-1.5 text-[11px] font-semibold text-white">Abrir no Google Maps</a>` : "",
    `  <span className="pointer-events-none absolute bottom-1 left-2 z-10 text-[9px] text-black/60">© OpenStreetMap</span>`,
    `</div>`,
  ].filter(Boolean).join("\n");
}
