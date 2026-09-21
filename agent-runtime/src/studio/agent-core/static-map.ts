// MAPA estático (tiles OSM) — sem iframe e sem chave de API.
//
// POR QUÊ: o app é cross-origin isolated (COEP) para o WebContainer, e sob COEP
// QUALQUER iframe cross-origin sem CORP é bloqueado pelo Chromium
// (net::ERR_BLOCKED_BY_RESPONSE → "A conexão com maps.google.com foi recusada").
// Imagens, porém, carregam normalmente. Então o mapa do site é montado com tiles
// (imagens) + marcador + botão "Abrir no Google Maps" (link real do Google).
// Comprovado em Chromium: iframes bloqueados, tiles carregando sob credentialless.

import { buildMapEmbedUrl } from "./site-media.js";
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
    // MAPA ÚNICO E CONFIÁVEL: o mosaico OSM interativo (tiles + marcador + pan/zoom).
    // Removido o iframe do Google: ele dispara "load" mesmo quando o mapa NÃO
    // aparece (embed vazio/bloqueado) e o runtime escondia o mosaico por causa
    // disso — resultado: mapa invisível em todos os sites. Quem quiser o Google
    // Maps usa o botão "Abrir no Google Maps".
    var lat=parseFloat(el.getAttribute("data-lat")), lng=parseFloat(el.getAttribute("data-lng"));
    var z=parseInt(el.getAttribute("data-zoom")||"15",10);
    if(!isFinite(lat)||!isFinite(lng)) return;
    // GOOGLE MAPS REAL (embed interativo) POR CIMA do mosaico OSM, que fica por
    // baixo como FALLBACK: onde o Google for bloqueado (COEP do preview do editor)
    // o OSM aparece; no site publicado o mapa do Google domina. Criado em runtime
    // para valer também em sites antigos que não traziam o iframe no HTML.
    try {
      var host=el.parentElement;
      if (host && !host.querySelector("[data-pf-gmap]")) {
        var ifr=document.createElement("iframe");
        ifr.setAttribute("data-pf-gmap","1"); ifr.setAttribute("title","Mapa");
        ifr.setAttribute("loading","lazy"); ifr.setAttribute("referrerpolicy","no-referrer-when-downgrade");
        ifr.setAttribute("allowfullscreen","");
        // credentialless: permite embutir o Google Maps mesmo sob COEP (preview do
        // editor) — sem isso o Chrome devolve ERR_BLOCKED_BY_RESPONSE e sobra o OSM.
        ifr.setAttribute("credentialless","");
        ifr.src="https://maps.google.com/maps?q="+encodeURIComponent(lat+","+lng)+"&z=16&output=embed";
        ifr.style.cssText="position:absolute;inset:0;width:100%;height:100%;border:0;z-index:5;background:transparent";
        host.appendChild(ifr);
      }
    } catch(e){ /* nunca quebra o mapa por causa do embed */ }
    el.style.position="relative"; el.style.width="100%"; el.style.height="100%"; el.style.minHeight="240px"; el.style.overflow="hidden"; el.style.touchAction="none"; el.style.cursor="grab"; el.style.background="#e5e7eb";
    var stage=document.createElement("div"); stage.style.cssText="position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform"; el.appendChild(stage);
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
        // Tiles OSM carregam em modo NO-CORS: o tile.openstreetmap.org NÃO envia
        // Access-Control-Allow-Origin (só Cross-Origin-Resource-Policy: cross-origin).
        // Forçar crossOrigin="anonymous" (modo CORS) faz o navegador BLOQUEAR os
        // tiles → o mapa ficava só com o marcador. No-cors + CORP funciona sob COEP.
        img.src="https://tile.openstreetmap.org/"+z+"/"+X+"/"+Y+".png";
        img.style.cssText="position:absolute;left:"+(i*TILE)+"px;top:"+(j*TILE)+"px;width:"+TILE+"px;height:"+TILE+"px;max-width:none;max-height:none;display:block";
        stage.appendChild(img);
      }}
      var m=document.createElement("div");
      m.style.cssText="position:absolute;left:"+((c.x-sx)*TILE)+"px;top:"+((c.y-sy)*TILE)+"px;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:9999px;background:#dc2626;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.4)";
      stage.appendChild(m);
      el.setAttribute("data-pf-zoom",String(z));
    }
    // Re-renderiza quando o container ganhar/ mudar de tamanho (ex.: seção revelada
    // depois, ou layout que muda) — sem isso os tiles ficam posicionados com 0×0.
    var lastW=0,lastH=0;
    if (typeof ResizeObserver!=="undefined"){ try{ new ResizeObserver(function(){ var w=el.clientWidth,h=el.clientHeight; if(w===lastW&&h===lastH) return; lastW=w; lastH=h; render(); }).observe(el); }catch(e){} }
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
  if (!html) return html;
  const anyRuntime = /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?(?:prospector-map-runtime|data-pf-map-ready)(?:(?!<\/script>)[\s\S])*?<\/script>/gi;
  const encontrados = html.match(anyRuntime) ?? [];
  // Já existe UM runtime e ele é o ATUAL (não esconde o mapa) → nada a fazer.
  if (encontrados.length === 1 && !/visibility\s*=\s*["']?hidden/i.test(encontrados[0])) return html;
  const tag = `<script>${buildMapRuntimeScript()}</script>`;
  // Remove TODAS as cópias (versões antigas escondiam o mosaico e deixavam
  // data-pf-map-ready=1, o que fazia o script novo PULAR o elemento) e injeta UM
  // runtime atual no fim do body.
  const cleaned = html.replace(anyRuntime, "");
  const idx = cleaned.toLowerCase().lastIndexOf("</body>");
  return idx >= 0 ? `${cleaned.slice(0, idx)}${tag}\n${cleaned.slice(idx)}` : `${cleaned}\n${tag}`;
}

export interface StaticMapBlockOptions {
  /** Classe Tailwind do container (altura). Default h-[320px]. */
  heightClass?: string;
  /** Rota textual exibida acima/abaixo (ex.: endereço). */
  address?: string | null;
  /**
   * FASE 7.10 — sintaxe do destino: `jsx` (padrão, componentes .tsx) ou `html`
   * (index.html). Em HTML, `className`/`style={{}}` não existem e `<iframe />`
   * SEM `</iframe>` engole o resto do documento como texto (o mosaico nem
   * existia no DOM). Por isso o bloco é gerado na sintaxe correta.
   */
  syntax?: "jsx" | "html";
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
  // FASE 7.10 — HTML usa atributos nativos e fecha TODAS as tags (iframe incluído).
  if (opts.syntax === "html" && point) {
    const dirs = mapsDirectionsUrl(business);
    const embedHtml = buildMapEmbedUrl(business);
    const addr = address ? `<p style="margin:0 0 8px;font-size:13px">📍 ${esc(address)}</p>` : "";
    return [
      `<div class="relative w-full ${heightClass}" style="position:relative;width:100%;height:320px;overflow:hidden;border:1px solid rgba(0,0,0,.1);border-radius:12px;background:#e5e7eb">`,
      `  <div data-pf-map data-lat="${point.lat}" data-lng="${point.lng}" data-zoom="15" style="position:absolute;inset:0"></div>`,
      // GOOGLE MAPS REAL: iframe oficial (`output=embed`) POR CIMA do mosaico OSM,
      // que fica por baixo como fallback — quando o Google é bloqueado (COEP do
      // preview) o mapa OSM aparece; no site publicado o Google interativo domina.
      embedHtml ? `  <iframe data-pf-gmap title="Mapa do negocio" src="${esc(embedHtml)}" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" style="position:absolute;inset:0;width:100%;height:100%;border:0;z-index:5;background:transparent"></iframe>` : "",
      `  <div data-pf-zoom style="position:absolute;right:8px;top:8px;z-index:10;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.1);border-radius:8px;background:rgba(255,255,255,.95);box-shadow:0 1px 3px rgba(0,0,0,.15)">`,
      `    <button type="button" data-pf-zoom-step="1" data-pf-ui="1" aria-label="Aproximar" style="height:32px;width:32px;font-size:18px;line-height:1;color:#262626;background:transparent;border:0">+</button>`,
      `    <button type="button" data-pf-zoom-step="-1" data-pf-ui="1" aria-label="Afastar" style="height:32px;width:32px;font-size:18px;line-height:1;color:#262626;background:transparent;border:0;border-top:1px solid rgba(0,0,0,.1)">−</button>`,
      `  </div>`,
      dirs ? `  <a href="${esc(dirs)}" target="_blank" rel="noreferrer" data-pf-ui="1" style="position:absolute;bottom:8px;right:8px;z-index:10;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;padding:6px 10px;font-size:11px;font-weight:600;text-decoration:none">Abrir no Google Maps</a>` : "",
      `  <span style="position:absolute;bottom:4px;left:8px;z-index:10;font-size:9px;color:rgba(0,0,0,.6)">© OpenStreetMap</span>`,
      addr ? `  <div style="position:absolute;left:8px;top:8px;z-index:10;max-width:70%;border-radius:8px;background:rgba(255,255,255,.95);padding:8px 10px;box-shadow:0 1px 3px rgba(0,0,0,.15)">${addr}</div>` : "",
      `</div>`,
    ].filter(Boolean).join("\n");
  }

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
    // GOOGLE MAPS REAL por cima (mesma estratégia do bloco HTML): OSM por baixo.
    buildMapEmbedUrl(business) ? `  <iframe data-pf-gmap title="Mapa do negocio" src="${esc(buildMapEmbedUrl(business) ?? "")}" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 h-full w-full border-0" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 5, background: "transparent" }} />` : "",
    `  <div data-pf-zoom className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow">`,
    `    <button type="button" data-pf-zoom-step="1" data-pf-ui="1" aria-label="Aproximar" className="h-8 w-8 text-lg leading-none text-neutral-800 hover:bg-neutral-100">+</button>`,
    `    <button type="button" data-pf-zoom-step="-1" data-pf-ui="1" aria-label="Afastar" className="h-8 w-8 border-t border-black/10 text-lg leading-none text-neutral-800 hover:bg-neutral-100">−</button>`,
    `  </div>`,
    directions ? `  <a href="${esc(directions)}" target="_blank" rel="noreferrer" data-pf-ui="1" className="absolute bottom-2 right-2 z-10 rounded-lg bg-black/75 px-2.5 py-1.5 text-[11px] font-semibold text-white">Abrir no Google Maps</a>` : "",
    `  <span className="pointer-events-none absolute bottom-1 left-2 z-10 text-[9px] text-black/60">© OpenStreetMap</span>`,
    `</div>`,
  ].filter(Boolean).join("\n");
}
