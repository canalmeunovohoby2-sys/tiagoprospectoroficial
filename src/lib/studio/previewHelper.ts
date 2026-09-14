// Helper do bridge injetado NA CÓPIA DE PREVIEW (Fase 4).
//
// Roda DENTRO do iframe sandbox (origem opaca, sem `allow-same-origin`) e:
//  - anuncia `preview_ready`;
//  - ativa/desativa modo inspeção por mensagem do Studio;
//  - destaca (hover) e seleciona elemento, devolvendo um DESCRITOR estruturado
//    (tag, id, classes, atributos, seletor estável, path, rect, texto, pfsrc);
//  - captura console e erros e repassa como `console`/`preview_error`.
//
// NUNCA expõe filesystem/ferramentas/credenciais — é apenas um canal de leitura.

import { STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION } from "./bridgeProtocol";
import type { StudioDevice } from "./types";

export interface PreviewBridgeOptions {
  token: string;
  device: StudioDevice;
}

/** Token de sessão do bridge (invalida mensagens de previews antigos). */
export function makePreviewBridgeToken(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  } catch {
    /* fallback abaixo */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Script do bridge. Construído como string para ser injetado no `srcDoc`.
 * Contém apenas lógica de inspeção/observação (somente leitura do DOM).
 */
export function buildPreviewBridgeScript({ token, device }: PreviewBridgeOptions): string {
  const CHANNEL = JSON.stringify(STUDIO_BRIDGE_CHANNEL);
  const VERSION = JSON.stringify(STUDIO_BRIDGE_VERSION);
  const TOKEN = JSON.stringify(token);
  const DEVICE = JSON.stringify(device);
  return `(function(){
try{
  var CHANNEL=${CHANNEL},VERSION=${VERSION},TOKEN=${TOKEN},DEVICE=${DEVICE};
  if(window.parent===window) return;
  function post(msg){ try{ msg.channel=CHANNEL; msg.version=VERSION; msg.token=TOKEN; window.parent.postMessage(msg,"*"); }catch(e){} }
  var HOVER="pf-inspect-hover",SEL="pf-inspect-selected";
  function ensureStyle(){ try{ if(document.getElementById("__pf_inspect_style")) return; var s=document.createElement("style"); s.id="__pf_inspect_style"; s.textContent="."+HOVER+"{outline:2px solid #3b82f6 !important;outline-offset:-1px !important;cursor:crosshair !important;}."+SEL+"{outline:2px solid #f59e0b !important;outline-offset:-1px !important;}"; (document.head||document.documentElement).appendChild(s); }catch(e){} }
  var inspecting=false,hovered=null,selected=null;
  function clearHover(){ try{ if(hovered&&hovered.classList) hovered.classList.remove(HOVER); }catch(e){} hovered=null; }
  function clearSel(){ try{ if(selected&&selected.classList) selected.classList.remove(SEL); }catch(e){} selected=null; }
  function nth(el){ try{ var p=el.parentElement; if(!p) return ""; var same=[]; for(var i=0;i<p.children.length;i++){ if(p.children[i].tagName===el.tagName) same.push(p.children[i]); } var n=same.indexOf(el)+1; return same.length>1?":nth-of-type("+n+")":""; }catch(e){ return ""; } }
  function selectorOf(el){ try{ if(el.id) return "#"+el.id; var parts=[]; var node=el; while(node&&node.nodeType===1&&node!==document.documentElement){ parts.unshift(node.tagName.toLowerCase()+nth(node)); node=node.parentElement; } return parts.join(" > ")||(el.tagName?el.tagName.toLowerCase():"element"); }catch(e){ return el&&el.tagName?el.tagName.toLowerCase():"element"; } }
  function pathOf(el){ try{ var parts=[]; var node=el; while(node&&node.nodeType===1){ var p=node.parentElement; var idx=p?Array.prototype.indexOf.call(p.children,node)+1:1; parts.unshift(node.tagName.toLowerCase()+":"+idx); node=p; } return parts.join(">"); }catch(e){ return ""; } }
  function describe(el){ var r={x:0,y:0,width:0,height:0}; try{ var b=el.getBoundingClientRect(); r={x:Math.round(b.left),y:Math.round(b.top),width:Math.round(b.width),height:Math.round(b.height)}; }catch(e){} var attrs={}; try{ for(var i=0;i<el.attributes.length;i++){ var a=el.attributes[i]; if(a.name==="data-pfsrc"||a.name==="class"||a.name==="id") continue; attrs[a.name]=String(a.value).slice(0,200); } }catch(e){} var classes=[]; try{ classes=Array.prototype.slice.call(el.classList).slice(0,12); }catch(e){} var text=""; try{ text=(el.textContent||"").replace(/\\s+/g," ").trim().slice(0,120); }catch(e){} var pf=null; try{ pf=el.getAttribute("data-pfsrc"); }catch(e){} return { tagName:(el.tagName||"").toLowerCase(), id:el.id||undefined, classes:classes, attributes:attrs, selector:selectorOf(el), path:pathOf(el), text:text||undefined, rect:r, pfsrc:pf||undefined }; }
  function viewport(){ return { device:DEVICE, width:(window.innerWidth||0), height:(window.innerHeight||0) }; }
  function setInspecting(active){ inspecting=!!active; ensureStyle(); if(!inspecting) clearHover(); try{ document.documentElement.style.cursor=inspecting?"crosshair":""; }catch(e){} }
  document.addEventListener("mousemove",function(ev){ if(!inspecting) return; var el=ev.target; if(!el||el.nodeType!==1) return; if(el===hovered) return; clearHover(); hovered=el; try{ el.classList.add(HOVER); }catch(e){} post({type:"inspect_hover",element:describe(el)}); },true);
  document.addEventListener("mouseleave",function(){ if(inspecting) clearHover(); },true);
  document.addEventListener("click",function(ev){ if(!inspecting) return; ev.preventDefault(); ev.stopPropagation(); var el=ev.target; if(!el||el.nodeType!==1) return; clearHover(); clearSel(); selected=el; try{ el.classList.add(SEL); }catch(e){} post({type:"element_selected",element:describe(el),viewport:viewport()}); },true);
  document.addEventListener("keydown",function(ev){ if(inspecting&&ev.key==="Escape"){ setInspecting(false); clearHover(); clearSel(); post({type:"inspect_clear"}); } },true);
  window.addEventListener("message",function(ev){ var d=ev.data; if(!d||typeof d!=="object") return; if(d.channel!==CHANNEL||d.version!==VERSION||d.token!==TOKEN) return; if(d.type==="inspect_set"){ setInspecting(!!d.active); } else if(d.type==="inspect_clear"){ clearHover(); clearSel(); } else if(d.type==="viewport_set"){ DEVICE=d.device||DEVICE; } });
  ["log","warn","error"].forEach(function(level){ var orig=console[level]; console[level]=function(){ try{ var msg=Array.prototype.slice.call(arguments).map(function(a){ try{ return typeof a==="string"?a:JSON.stringify(a); }catch(e){ return String(a); } }).join(" ").slice(0,500); post({type:"console",level:level,message:msg}); }catch(e){} try{ return orig.apply(console,arguments); }catch(e){} }; });
  window.addEventListener("error",function(ev){ try{ post({type:"preview_error",message:String((ev&&ev.message)||"erro no preview"),source:(ev&&ev.filename)||undefined,line:(ev&&ev.lineno)||undefined,column:(ev&&ev.colno)||undefined}); }catch(e){} });
  window.addEventListener("unhandledrejection",function(ev){ try{ post({type:"preview_error",message:"Promise rejeitada: "+String((ev&&ev.reason)||"")}); }catch(e){} });
  ensureStyle();
  var CAPS=["inspect","hover","select","console","errors","source-map"];
  post({type:"preview_ready",capabilities:CAPS});
  window.addEventListener("load",function(){ post({type:"preview_ready",capabilities:CAPS}); });
}catch(e){}
})();`;
}

/** Injeta o bridge no documento preparado (antes de `</body>`). */
export function injectStudioBridge(html: string, options: PreviewBridgeOptions): string {
  const script = `<script>${buildPreviewBridgeScript(options)}</script>`;
  const closeBody = html.search(/<\/body\s*>/i);
  if (closeBody >= 0) return html.slice(0, closeBody) + script + html.slice(closeBody);
  return html + script;
}
