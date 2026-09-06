import { useState, useRef, type ChangeEvent, type ReactNode } from "react";
import { ChevronDown, ArrowUp, ArrowDown, Plus, Trash2, Palette, Type, LayoutGrid, MousePointerClick, AlignLeft, Sparkles, RotateCcw, Loader2, AlertTriangle, Mic, Paperclip, Send, X } from "lucide-react";
import type { SiteSpec, SiteCta } from "@/data/siteProjects";
import { normalizeSpec } from "@/data/siteProjects";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type AnyDict = Record<string, any>;

export const SECTION_TYPES = ["hero", "about", "services", "testimonials", "cta", "contact"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

const SECTION_LABEL: Record<SectionType, string> = {
  hero: "Hero (destaque)",
  about: "Sobre",
  services: "Serviços",
  testimonials: "Depoimentos",
  cta: "Chamada para ação",
  contact: "Contato",
};

const MOOD_OPTIONS = ["minimal", "editorial", "bold", "organic", "premium", "playful"];
const CTA_TYPES = ["whatsapp", "tel", "scroll", "link"];

export const FONT_OPTIONS = [
  "Inter", "Montserrat", "Open Sans", "Poppins", "Roboto", "Lato", "Raleway",
  "DM Sans", "Playfair Display", "Lora", "Merriweather", "Source Sans 3",
  "Oswald", "Bebas Neue", "Cormorant Garamond", "Nunito Sans", "Space Grotesk",
  "Outfit", "Sora", "Work Sans",
];

const COLOR_LABEL: Record<string, string> = {
  primary: "Cor primária",
  secondary: "Cor secundária",
  accent: "Cor de destaque",
  background: "Cor de fundo",
  surface: "Cor dos cartões",
  on_surface: "Cor do texto",
};

const DEFAULT_COLORS: Record<string, string> = {
  primary: "#2563eb", secondary: "#1e293b", accent: "#0f766e",
  background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a",
};

export function cloneSpec<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function produce(spec: SiteSpec, fn: (draft: SiteSpec) => void): SiteSpec {
  const draft = cloneSpec(spec);
  fn(draft);
  return normalizeSpec(draft);
}

function block(content: SiteSpec["content"] | undefined, key: string): AnyDict {
  const c = content ?? {};
  const b = c[key];
  return b && typeof b === "object" ? (b as AnyDict) : {};
}

function ensureBlock(content: SiteSpec["content"] | undefined, key: string): AnyDict {
  const target = (content ?? {}) as AnyDict;
  if (!target[key] || typeof target[key] !== "object") target[key] = {};
  return target[key] as AnyDict;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/* ---------- UI primitivas ---------- */

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-sm"
    />
  );
}

function TextAreaInput({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="text-sm"
    />
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_COLORS.primary}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 cursor-pointer rounded-md border border-border bg-transparent p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 font-mono text-xs uppercase"
          aria-label={`${label} (hex)`}
        />
      </div>
    </div>
  );
}

function SelectNative({ value, options, onChange, placeholder, ariaLabel }: { value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {!value && placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Panel({ title, icon, children, defaultOpen = true }: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border/60 bg-card/40">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-primary">{icon}</span>
          {title}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 py-3 space-y-3">{children}</div>
    </details>
  );
}

/* ---------- Editor principal ---------- */

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  image?: string;
  fileLabel?: string;
}

export interface AiPanelProps {
  running: boolean;
  error: string | null;
  proposed: boolean;
  messages?: ChatMsg[];
  canUndo?: boolean;
  onApply: (instruction: string, attachment?: { dataUrl: string; label: string }) => void;
  onRevert: () => void;
}

export interface SiteEditorProps {
  spec: SiteSpec;
  onChange: (next: SiteSpec) => void;
  aiPanel?: AiPanelProps;
}

export function SiteEditor({ spec, onChange, aiPanel }: SiteEditorProps) {
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiAttachment, setAiAttachment] = useState<{ dataUrl: string; label: string } | null>(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const keepMicRef = useRef(false);
  const lastFinalRef = useRef("");

  const chatMsgs = aiPanel?.messages ?? [];

  // Preserva o arquivo EXATAMENTE como enviado (transparência/formato/SVG/vídeo).
  // NENHUMA conversão/canvas: leitura direta como data URL.
  function fileToDataUrl(file: File): Promise<{ dataUrl: string; label: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), label: file.name });
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAiAttachment(await fileToDataUrl(file));
    } catch (err) {
      setAiAttachment({ dataUrl: "", label: file.name });
    }
  }

  function stopMic() {
    keepMicRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* já parado */ }
    }
    setListening(false);
  }

  // Gravação contínua: grava ao clicar e SÓ PARA quando clicar de novo. Se o
  // navegador encerrar a sessão após uma fala, ela reinicia automaticamente.
  function toggleMic() {
    if (keepMicRef.current) { stopMic(); return; }
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { if (aiPanel) { /* sem suporte */ } return; }
    const Rec = SR as new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      onresult: (ev: unknown) => void; onend: () => void; onerror: (e: { error?: string }) => void;
      start: () => void; stop: () => void;
    };
    lastFinalRef.current = "";
    keepMicRef.current = true;

    const startSession = () => {
      if (!keepMicRef.current) return;
      try {
        const rec = new Rec();
        rec.lang = "pt-BR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev: unknown) => {
          const results = (ev as { results?: ArrayLike<ArrayLike<{ transcript?: string }> & { isFinal?: boolean }> }).results;
          if (!results) return;
          const finals = Array.from(results).filter((r) => r?.isFinal).map((r) => r[0]?.transcript ?? "").join(" ").trim();
          if (finals && finals !== lastFinalRef.current) {
            lastFinalRef.current = finals;
            setAiInstruction((prev) => (prev ? `${prev} ${finals}` : finals).trim());
          }
        };
        rec.onend = () => {
          if (keepMicRef.current) startSession();
          else { recRef.current = null; setListening(false); }
        };
        rec.onerror = (e) => {
          const err = e?.error ?? "";
          if (err === "not-allowed" || err === "service-not-allowed" || err === "not-supported") {
            stopMic();
          } else if (keepMicRef.current) {
            startSession();
          }
        };
        recRef.current = rec;
        rec.start();
        setListening(true);
      } catch {
        stopMic();
      }
    };
    startSession();
  }

  function handleAiSend() {
    if (!aiPanel || aiPanel.running) return;
    const value = aiInstruction.trim();
    if (!value && !aiAttachment) return;
    aiPanel.onApply(value || "Aplique a alteração considerando o anexo.", aiAttachment ?? undefined);
    setAiInstruction("");
    setAiAttachment(null);
  }

  const design = spec.design_system ?? {};
  const colors = design.colors ?? {};
  const colorValue = (k: string) => str(colors[k]) || DEFAULT_COLORS[k] || "";
  const setColor = (k: string, v: string) => onChange(produce(spec, (d) => {
    const c = d.design_system!.colors ?? {};
    c[k] = v.trim() || DEFAULT_COLORS[k];
    d.design_system!.colors = c;
  }));

  const fontOf = (k: "heading_font" | "body_font") => str(design.typography?.[k]) || (k === "heading_font" ? "Plus Jakarta Sans" : "Inter");
  const setFont = (k: "heading_font" | "body_font", v: string) => onChange(produce(spec, (d) => {
    const t = d.design_system!.typography ?? {};
    t[k] = v;
    d.design_system!.typography = t;
  }));

  return (
    <div className="space-y-2.5">
      {aiPanel && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/8 to-transparent p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Editar com IA
            </p>
            <div className="flex items-center gap-2">
              {aiPanel.canUndo && !aiPanel.running && (
                <button type="button" onClick={aiPanel.onRevert} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors" title="Volta para antes da última alteração">
                  <RotateCcw className="h-3 w-3" /> Desfazer
                </button>
              )}
              {aiPanel.running && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Editando…
                </span>
              )}
            </div>
          </div>

          {chatMsgs.length > 0 && (
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {chatMsgs.map((m, i) => (
                <div key={i} className={`max-w-[92%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${m.role === "user" ? "ml-auto bg-primary/12 border border-primary/20" : "bg-card border border-border/60"}`}>
                  {m.image && m.image.startsWith("data:image") && (
                    <img src={m.image} alt="anexo" className="mb-1.5 max-h-28 rounded-lg border border-border/60 object-cover" />
                  )}
                  {m.fileLabel && !(m.image && m.image.startsWith("data:image")) && <p className="mb-1 text-[11px] text-muted-foreground">📎 {m.fileLabel}</p>}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ))}
              {aiPanel.running && (
                <div className="max-w-[70%] rounded-xl px-3 py-2 text-[12.5px] bg-card border border-border/60 inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> editando o site…
                </div>
              )}
            </div>
          )}

          {aiPanel.error && (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{aiPanel.error}</span>
            </p>
          )}

          {aiAttachment && (
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs text-muted-foreground">
              {aiAttachment.dataUrl.startsWith("data:image") ? (
                <img src={aiAttachment.dataUrl} alt="anexo" className="h-10 w-10 rounded object-cover" />
              ) : (
                <span>📎</span>
              )}
              <span className="flex-1 truncate">{aiAttachment.label || "Anexo"}</span>
              <button type="button" onClick={() => setAiAttachment(null)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <TextAreaInput
            value={aiInstruction}
            onChange={setAiInstruction}
            placeholder="Ex.: Deixe o hero mais sofisticado. / Deixe mais escuro. / Troca o botão para WhatsApp. / Volta para antes da última alteração."
            rows={2}
          />

          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx" className="hidden" onChange={handleFileChange} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Anexar foto ou arquivo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleMic}
              title={listening ? "Parar gravação" : "Gravar com voz"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${listening ? "border-red-400/70 bg-red-500/10 text-red-500" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}
            >
              {listening ? (
                <span className="voice-bars" aria-hidden>
                  <span style={{ animationDelay: "0ms" }} />
                  <span style={{ animationDelay: "160ms" }} />
                  <span style={{ animationDelay: "320ms" }} />
                  <span style={{ animationDelay: "80ms" }} />
                </span>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <Button size="sm" className="h-8 flex-1" disabled={aiPanel.running || (!aiInstruction.trim() && !aiAttachment)} onClick={handleAiSend}>
              {aiPanel.running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Enviar
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Anexos ficam visíveis nesta conversa (apenas na sessão) e são tratados como referência. Gravação de voz usa o reconhecimento de fala do navegador.</p>
        </div>
      )}

      <Panel title="Conteúdo" icon={<AlignLeft className="h-4 w-4" />}>
        <ContentEditor spec={spec} onChange={onChange} />
      </Panel>

      <Panel title="Identidade visual" icon={<Palette className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["primary", "secondary", "accent", "background", "surface", "on_surface"] as const).map((k) => (
            <ColorInput key={k} label={COLOR_LABEL[k] ?? k} value={colorValue(k)} onChange={(v) => setColor(k, v)} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fonte dos títulos">
            <SelectNative ariaLabel="Fonte dos títulos" value={fontOf("heading_font")} options={FONT_OPTIONS} onChange={(v) => setFont("heading_font", v)} />
          </Field>
          <Field label="Fonte do corpo">
            <SelectNative ariaLabel="Fonte do corpo" value={fontOf("body_font")} options={FONT_OPTIONS} onChange={(v) => setFont("body_font", v)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Mood / clima visual">
            <SelectNative ariaLabel="Mood visual" value={str(design.layout_mood)} options={MOOD_OPTIONS} onChange={(v) => onChange(produce(spec, (d) => { d.design_system!.layout_mood = v; }))} placeholder="Escolha um mood…" />
          </Field>
          <Field label="Estilo visual (descrição)">
            <TextAreaInput value={str(design.visual_style)} onChange={(v) => onChange(produce(spec, (d) => { d.design_system!.visual_style = v; }))} rows={2} />
          </Field>
        </div>
      </Panel>

      <Panel title="Seções" icon={<LayoutGrid className="h-4 w-4" />}>
        <SectionsEditor spec={spec} onChange={onChange} />
      </Panel>

      <Panel title="CTAs e contato" icon={<MousePointerClick className="h-4 w-4" />}>
        <CtaEditor spec={spec} onChange={onChange} />
      </Panel>
    </div>
  );
}

/* ---------- Conteúdo ---------- */

function ContentEditor({ spec, onChange }: { spec: SiteSpec; onChange: (s: SiteSpec) => void }) {
  const setContent = (fn: (c: AnyDict) => void) => onChange(produce(spec, (d) => fn(d.content ?? (d.content = {}))));

  const hero = block(spec.content, "hero");
  const about = block(spec.content, "about");
  const services = block(spec.content, "services");
  const testimonials = block(spec.content, "testimonials");
  const ctaBlock = block(spec.content, "cta");
  const contact = block(spec.content, "contact");
  const footer = block(spec.content, "footer");
  const business = spec.business ?? {};

  const heroDest = str(hero.primary_cta_type);
  const heroValue = str(hero.primary_cta_value);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Field label="Nome exibido da empresa">
          <TextInput
            value={str(business.name) || str(spec.business?.name)}
            onChange={(v) => onChange(produce(spec, (d) => { d.business!.name = v; }))}
            placeholder="Nome da empresa"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hero</p>
        <Field label="Título do Hero">
          <TextInput value={str(hero.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "hero").title = v; })} placeholder="Título principal" />
        </Field>
        <Field label="Subtítulo do Hero">
          <TextAreaInput value={str(hero.subtitle)} onChange={(v) => setContent((c) => { ensureBlock(c, "hero").subtitle = v; })} rows={2} placeholder="Frase de apoio" />
        </Field>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Texto do botão principal">
            <TextInput value={str(hero.primary_cta)} onChange={(v) => setContent((c) => { ensureBlock(c, "hero").primary_cta = v; })} placeholder="Ex.: Falar no WhatsApp" />
          </Field>
          <Field label="Destino do botão (tipo)" hint="whatsapp/tel pedem número no campo abaixo; scroll/link pedem o destino.">
            <SelectNative ariaLabel="Destino do botão" value={heroDest} options={["whatsapp", "tel", "scroll", "link"]} onChange={(v) => setContent((c) => { ensureBlock(c, "hero").primary_cta_type = v; })} placeholder="Sem ação definida" />
          </Field>
          {(heroDest === "whatsapp" || heroDest === "tel" || heroDest === "link" || heroDest === "scroll") && (
            <Field label={heroDest === "whatsapp" ? "Número do WhatsApp (com DDD)" : heroDest === "tel" ? "Número de telefone" : "Destino (link ou âncora #…)"}>
              <TextInput value={heroValue} onChange={(v) => setContent((c) => { ensureBlock(c, "hero").primary_cta_value = v; })} placeholder={heroDest === "scroll" ? "#servicos" : "11 90000-0000"} />
            </Field>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sobre</p>
        <Field label="Título da seção Sobre">
          <TextInput value={str(about.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "about").title = v; })} placeholder="Sobre" />
        </Field>
        <Field label="Texto da seção Sobre">
          <TextAreaInput value={str(about.body)} onChange={(v) => setContent((c) => { ensureBlock(c, "about").body = v; })} rows={4} placeholder="Texto institucional editável…" />
        </Field>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Serviços</p>
        <Field label="Título da seção Serviços">
          <TextInput value={str(services.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "services").title = v; })} placeholder="Nossos serviços" />
        </Field>
        {Array.isArray(services.items) && services.items.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhum serviço adicionado. Use “Adicionar serviço”.</p>
        )}
        {Array.isArray(services.items) && services.items.map((item: AnyDict, i: number) => (
          <div key={i} className="space-y-1.5 rounded-md border border-border/40 p-2">
            <TextInput value={str(item.title)} onChange={(v) => setContent((c) => { const items = ensureBlock(c, "services").items ?? (ensureBlock(c, "services").items = []); if (items[i]) items[i].title = v; })} placeholder="Nome do serviço" />
            <TextAreaInput value={str(item.description)} onChange={(v) => setContent((c) => { const items = ensureBlock(c, "services").items; if (items?.[i]) items[i].description = v; })} rows={2} placeholder="Descrição (opcional)" />
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setContent((c) => { const items = ensureBlock(c, "services").items; if (Array.isArray(items)) items.splice(i, 1); })}>
              <Trash2 className="h-3 w-3 mr-1" /> Remover serviço
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setContent((c) => { const items = ensureBlock(c, "services").items ?? (ensureBlock(c, "services").items = []); items.push({ title: "", description: "" }); })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar serviço
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Depoimentos</p>
        <Field label="Título da seção">
          <TextInput value={str(testimonials.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "testimonials").title = v; })} placeholder="Depoimentos" />
        </Field>
        {Array.isArray(testimonials.items) && testimonials.items.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Nenhum depoimento adicionado.</p>
        )}
        {Array.isArray(testimonials.items) && testimonials.items.map((item: AnyDict, i: number) => (
          <div key={i} className="space-y-1.5 rounded-md border border-border/40 p-2">
            <TextAreaInput value={str(item.quote)} onChange={(v) => setContent((c) => { const items = ensureBlock(c, "testimonials").items; if (items?.[i]) items[i].quote = v; })} rows={2} placeholder="Texto do depoimento" />
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={str(item.author)} onChange={(v) => setContent((c) => { const items = ensureBlock(c, "testimonials").items; if (items?.[i]) items[i].author = v; })} placeholder="Autor" />
              <TextInput value={str(item.role)} onChange={(v) => setContent((c) => { const items = ensureBlock(c, "testimonials").items; if (items?.[i]) items[i].role = v; })} placeholder="Cargo/contexto" />
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setContent((c) => { const items = ensureBlock(c, "testimonials").items; if (Array.isArray(items)) items.splice(i, 1); })}>
              <Trash2 className="h-3 w-3 mr-1" /> Remover depoimento
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setContent((c) => { const items = ensureBlock(c, "testimonials").items ?? (ensureBlock(c, "testimonials").items = []); items.push({ quote: "", author: "" }); })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar depoimento
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chamada para ação (CTA)</p>
        <Field label="Título do CTA">
          <TextInput value={str(ctaBlock.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "cta").title = v; })} placeholder="Fale conosco" />
        </Field>
        <Field label="Texto do CTA">
          <TextAreaInput value={str(ctaBlock.body)} onChange={(v) => setContent((c) => { ensureBlock(c, "cta").body = v; })} rows={2} />
        </Field>
        <Field label="Texto do botão do CTA">
          <TextInput value={str(ctaBlock.button_label)} onChange={(v) => setContent((c) => { ensureBlock(c, "cta").button_label = v; })} placeholder="Falar agora" />
        </Field>
      </div>

      <div className="rounded-lg border border-border/50 p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato e rodapé</p>
        <Field label="Título da seção de contato">
          <TextInput value={str(contact.title)} onChange={(v) => setContent((c) => { ensureBlock(c, "contact").title = v; })} placeholder="Contato" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Telefone">
            <TextInput value={str(contact.phone)} onChange={(v) => setContent((c) => { ensureBlock(c, "contact").phone = v; })} placeholder="(11) 99999-0000" />
          </Field>
          <Field label="WhatsApp">
            <TextInput value={str(contact.whatsapp)} onChange={(v) => setContent((c) => { ensureBlock(c, "contact").whatsapp = v; })} placeholder="(11) 99999-0000" />
          </Field>
        </div>
        <Field label="Rodapé (tagline)">
          <TextInput value={str(footer.tagline)} onChange={(v) => setContent((c) => { ensureBlock(c, "footer").tagline = v; })} placeholder="Frase curta do rodapé" />
        </Field>
      </div>
    </div>
  );
}

/* ---------- Seções ---------- */

function SectionsEditor({ spec, onChange }: { spec: SiteSpec; onChange: (s: SiteSpec) => void }) {
  const sections = spec.sections ?? [];
  const activeTypes = new Set(sections.map((s) => s.type));
  const available = SECTION_TYPES.filter((t) => !activeTypes.has(t));

  const reorder = (index: number, dir: -1 | 1) => onChange(produce(spec, (d) => {
    const arr = d.sections ?? [];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    const copy = [...arr];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    d.sections = copy.map((s, i) => ({ ...s, order: i + 1 }));
  }));

  const remove = (index: number) => onChange(produce(spec, (d) => {
    const copy = [...(d.sections ?? [])];
    copy.splice(index, 1);
    d.sections = copy.map((s, i) => ({ ...s, order: i + 1 }));
  }));

  const add = (type: SectionType) => onChange(produce(spec, (d) => {
    const arr = d.sections ?? [];
    const order = arr.length + 1;
    d.sections = [...arr, { id: `${type}-${Date.now()}`, type, order }];
  }));

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Defina quais seções aparecem e em que ordem. O conteúdo de cada seção é preservado ao desativar.</p>
      {sections.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma seção ativa.</p>}
      {sections.map((s, i) => (
        <div key={s.id ?? i} className="flex items-center gap-1.5 rounded-lg border border-border/50 px-2 py-1.5 bg-background/60">
          <span className="flex-1 text-xs font-medium truncate">
            {(SECTION_TYPES as readonly string[]).includes(s.type) ? SECTION_LABEL[s.type as SectionType] : s.type}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover para cima" disabled={i === 0} onClick={() => reorder(i, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover para baixo" disabled={i === sections.length - 1} onClick={() => reorder(i, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remover seção" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {available.map((t) => (
            <Button key={t} variant="outline" size="sm" className="h-7 text-xs" onClick={() => add(t)}>
              <Plus className="h-3 w-3 mr-1" /> {SECTION_LABEL[t]}
            </Button>
          ))}
        </div>
      )}
      {available.length === 0 && <p className="text-[11px] text-muted-foreground pt-1">Todas as seções suportadas já estão ativas.</p>}
    </div>
  );
}

/* ---------- CTAs e contato ---------- */

function CtaEditor({ spec, onChange }: { spec: SiteSpec; onChange: (s: SiteSpec) => void }) {
  const ctas: SiteCta[] = Array.isArray(spec.calls_to_action) ? spec.calls_to_action : [];

  const updateCta = (i: number, patch: Partial<SiteCta>) => onChange(produce(spec, (d) => {
    const list = Array.isArray(d.calls_to_action) ? [...d.calls_to_action] : [];
    if (!list[i]) return;
    list[i] = { ...list[i], ...patch };
    d.calls_to_action = list;
  }));

  const removeCta = (i: number) => onChange(produce(spec, (d) => {
    const list = Array.isArray(d.calls_to_action) ? [...d.calls_to_action] : [];
    list.splice(i, 1);
    d.calls_to_action = list;
  }));

  const addCta = () => onChange(produce(spec, (d) => {
    const list = Array.isArray(d.calls_to_action) ? [...d.calls_to_action] : [];
    list.push({ label: "Falar agora", type: "whatsapp", value: "" });
    d.calls_to_action = list;
  }));

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Botões de ação do site. Não use números ou links falsos — deixe o valor vazio se não tiver o contato real.</p>
      {ctas.length === 0 && <p className="text-xs text-muted-foreground">Nenhum CTA configurado.</p>}
      {ctas.map((cta, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border/50 p-2">
          <div className="grid grid-cols-2 gap-2">
            <TextInput value={str(cta.label)} onChange={(v) => updateCta(i, { label: v })} placeholder="Texto do botão" />
            <SelectNative value={cta.type} options={CTA_TYPES} onChange={(v) => updateCta(i, { type: v as SiteCta["type"] })} />
          </div>
          {(cta.type === "whatsapp" || cta.type === "tel") && (
            <TextInput value={str(cta.value)} onChange={(v) => updateCta(i, { value: v })} placeholder={cta.type === "whatsapp" ? "Número do WhatsApp (com DDD)" : "Número de telefone"} />
          )}
          {cta.type === "link" && (
            <TextInput value={str(cta.value)} onChange={(v) => updateCta(i, { value: v })} placeholder="https://…" />
          )}
          {cta.type === "scroll" && (
            <TextInput value={str(cta.value)} onChange={(v) => updateCta(i, { value: v })} placeholder="#contato" />
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => removeCta(i)}>
            <Trash2 className="h-3 w-3 mr-1" /> Remover CTA
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={addCta}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar CTA
      </Button>
    </div>
  );
}
