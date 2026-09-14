// Helper VISUAL injetado na CÓPIA DE PREVIEW do app React (C3).
//
// Roda DENTRO do app React (WebContainer/Vite dev). Lê a origem real do
// componente via `_debugSource` do fiber React (dev build) e reporta a seleção
// ao Studio por postMessage, no MESMO envelope do bridgeProtocol.
//
// A injeção acontece SOMENTE na projeção enviada ao WebContainer — NUNCA é
// gravada em `generated_code`, publicação, ZIP ou arquivos finais.

import { STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION } from "./bridgeProtocol";

export interface ReactVisualHelperOptions {
  token: string;
}

const MARKER = "prospector-react-visual-helper";

export function buildReactVisualHelperScript({ token }: ReactVisualHelperOptions): string {
  const CHANNEL = JSON.stringify(STUDIO_BRIDGE_CHANNEL);
  const VERSION = JSON.stringify(STUDIO_BRIDGE_VERSION);
  const TOKEN = JSON.stringify(token);
  // Marcador para evitar dupla injeção.
  const MARK = JSON.stringify(MARKER);
  return `/* ${MARKER} */
(function(){
try{
  var CHANNEL=${CHANNEL},VERSION=${VERSION},TOKEN=${TOKEN};
  if(window.parent===window) return;
  function post(msg){ try{ msg.channel=CHANNEL; msg.version=VERSION; msg.token=TOKEN; window.parent.postMessage(msg,"*"); }catch(e){} }
  var HOVER="pf-visual-hover",SEL="pf-visual-selected",inspecting=false,hovered=null,selected=null;
  function ensureStyle(){ try{ if(document.getElementById("__pf_visual_style")) return; var s=document.createElement("style"); s.id="__pf_visual_style"; s.textContent="."+HOVER+"{outline:2px dashed #3b82f6 !important;outline-offset:-1px !important;}."+SEL+"{outline:2px solid #f59e0b !important;outline-offset:-1px !important;}"; (document.head||document.documentElement).appendChild(s); }catch(e){} }
  function clearHover(){ try{ if(hovered&&hovered.classList) hovered.classList.remove(HOVER); }catch(e){} hovered=null; }
  function clearSel(){ try{ if(selected&&selected.classList) selected.classList.remove(SEL); }catch(e){} selected=null; }
  function getFiber(el){ try{ for(var k in el){ if(k.indexOf("__reactFiber$")===0||k.indexOf("__reactInternalInstance$")===0) return el[k]; } }catch(e){} return null; }
  function getSource(el){ try{ var f=getFiber(el); while(f){ if(f._debugSource) return f._debugSource; f=f.return; } }catch(e){} return null; }
  function getComponentName(el){ try{ var f=getFiber(el); while(f){ var t=f.type||f.elementType; var n=t&&(t.displayName||t.name); if(typeof n==="string"&&n&&n.charAt(0)===n.charAt(0).toUpperCase()) return n; f=f.return; } }catch(e){} return null; }
  function nth(el){ try{ var p=el.parentElement; if(!p) return ""; var same=[]; for(var i=0;i<p.children.length;i++){ if(p.children[i].tagName===el.tagName) same.push(p.children[i]); } var n=same.indexOf(el)+1; return same.length>1?":nth-of-type("+n+")":""; }catch(e){ return ""; } }
  function selectorOf(el){ try{ if(el.id) return "#"+el.id; var parts=[]; var node=el; while(node&&node.nodeType===1&&node!==document.documentElement){ parts.unshift(node.tagName.toLowerCase()+nth(node)); node=node.parentElement; } return parts.join(" > "); }catch(e){ return (el&&el.tagName)?el.tagName.toLowerCase():"element"; } }
  function pathOf(el){ try{ var parts=[]; var node=el; while(node&&node.nodeType===1){ var p=node.parentElement; var idx=p?Array.prototype.indexOf.call(p.children,node)+1:1; parts.unshift(node.tagName.toLowerCase()+":"+idx); node=p; } return parts.join(">"); }catch(e){ return ""; } }
  function describe(el){ var r={x:0,y:0,width:0,height:0}; try{ var b=el.getBoundingClientRect(); r={x:Math.round(b.left),y:Math.round(b.top),width:Math.round(b.width),height:Math.round(b.height)}; }catch(e){} var attrs={}; try{ for(var i=0;i<el.attributes.length;i++){ var a=el.attributes[i]; if(a.name==="class"||a.name==="id") continue; attrs[a.name]=String(a.value).slice(0,200); } }catch(e){} var classes=[]; try{ classes=Array.prototype.slice.call(el.classList).slice(0,12); }catch(e){} var text=""; try{ text=(el.textContent||"").replace(/\\s+/g," ").trim().slice(0,120); }catch(e){} var src=getSource(el); var comp=getComponentName(el); var reactSource=src?{file:String(src.fileName||""),line:src.lineNumber,column:src.columnNumber,componentName:comp||undefined}:(comp?{file:"",componentName:comp}:undefined); return { tagName:(el.tagName||"").toLowerCase(), id:el.id||undefined, classes:classes, attributes:attrs, selector:selectorOf(el), path:pathOf(el), text:text||undefined, rect:r, reactSource:reactSource }; }
  function viewport(){ return { device:"desktop", width:(window.innerWidth||0), height:(window.innerHeight||0) }; }
  function setInspecting(active){ inspecting=!!active; ensureStyle(); if(!inspecting){ clearHover(); } try{ document.documentElement.style.cursor=inspecting?"crosshair":""; }catch(e){} post({type:"inspect_ack", active:inspecting}); }
  document.addEventListener("mousemove",function(ev){ if(!inspecting) return; var el=ev.target; if(!el||el.nodeType!==1) return; if(el===hovered) return; clearHover(); hovered=el; try{ el.classList.add(HOVER); }catch(e){} post({type:"inspect_hover",element:describe(el)}); },true);
  document.addEventListener("mouseleave",function(){ if(inspecting) clearHover(); },true);
  document.addEventListener("click",function(ev){ if(!inspecting) return; ev.preventDefault(); ev.stopPropagation(); var el=ev.target; if(!el||el.nodeType!==1) return; clearHover(); clearSel(); selected=el; try{ el.classList.add(SEL); }catch(e){} post({type:"element_selected",element:describe(el),viewport:viewport()}); },true);
  document.addEventListener("keydown",function(ev){ if(inspecting&&ev.key==="Escape"){ setInspecting(false); clearHover(); clearSel(); post({type:"inspect_clear"}); } },true);
  window.addEventListener("message",function(ev){ var d=ev.data; if(!d||typeof d!=="object") return; if(d.channel!==CHANNEL||d.version!==VERSION||d.token!==TOKEN) return; if(d.type==="inspect_set"){ setInspecting(!!d.active); } else if(d.type==="inspect_clear"){ clearHover(); clearSel(); } });
  ensureStyle();
  var CAPS=["visual-inspect","debug-source","hover","select"];
  post({type:"preview_ready",capabilities:CAPS});
  window.addEventListener("load",function(){ post({type:"preview_ready",capabilities:CAPS}); });
}catch(e){}
})();`;
}

/**
 * Injeta o helper no `index.html` da PROJEÇÃO (somente o mapa enviado ao
 * WebContainer). Idempotente; não altera outros arquivos.
 */
export function injectReactVisualHelper(
  files: Record<string, string>,
  options: ReactVisualHelperOptions,
): Record<string, string> {
  const html = files["index.html"];
  if (typeof html !== "string") return files;
  if (html.includes(MARKER)) return files;
  const script = `<script type="module">${buildReactVisualHelperScript(options)}</script>`;
  const closeBody = html.search(/<\/body\s*>/i);
  const injected = closeBody >= 0 ? html.slice(0, closeBody) + script + html.slice(closeBody) : html + script;
  return { ...files, "index.html": injected };
}
