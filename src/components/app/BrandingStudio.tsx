import { useState, type ReactNode } from "react";
import { Sparkles, RotateCcw, Send, ShieldCheck, ImagePlus, Loader2, AlertTriangle, FileText, Download, Eye, Archive, PlayCircle, Film } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { BrandView, BrandViewConcept } from "@/lib/brandingView";
import { realPreviewSvg } from "@/lib/brandingView";
import type { MockupView } from "@/lib/mockupView";
import { mockupPreviewUrl } from "@/lib/mockupView";
import type { BrandPdfView } from "@/lib/brandPdfView";
import type { BrandPackageView } from "@/lib/brandPackageView";
import type { SiteVideoView } from "@/lib/siteVideoView";

const VARIANT_LABELS: Record<string, string> = {
  primary: "Principal", horizontal: "Horizontal", vertical: "Vertical",
  symbol: "Símbolo", monoLight: "Monocromática (claro)", monoDark: "Negativa",
};

interface BrandingStudioProps {
  view: BrandView;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  mockup?: MockupView;
  brandPdf?: BrandPdfView;
  brandPackage?: BrandPackageView;
  siteVideo?: SiteVideoView;
  onGenerateMockup?: () => void;
  onGeneratePdf?: () => void;
  onGeneratePackage?: () => void;
  onGenerateVideo?: () => void;
  onSelect: (conceptId: string) => void;
  onReject: (conceptId: string) => void;
  onRevert: () => void;
  onSend: (text: string) => void;
  mockupBaseUrl?: string;
  mockupProjectId?: string;
}

function SvgPreview({ svg, className }: { svg: string; className?: string }) {
  if (!svg) return <div className={`text-xs text-muted-foreground flex items-center justify-center ${className ?? ""}`}>Sem SVG</div>;
  return <div className={`flex items-center justify-center ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function statusBadge(c: BrandViewConcept) {
  if (c.status === "selecionado") return <Badge variant="default">Selecionado</Badge>;
  if (c.status === "rejeitado") return <Badge variant="outline" className="text-muted-foreground line-through">Rejeitado</Badge>;
  return <Badge variant="outline">Disponível</Badge>;
}

function DeliveryRow(props: { icon: ReactNode; title: string; status: string; statusTone?: string; onAction?: () => void; loading?: boolean; actionLabel: string; ready?: boolean; readyContent?: ReactNode; help?: string; error?: string }) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {props.icon}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{props.title}</span>
            {props.status && <Badge variant={(props.statusTone as "default" | "outline" | "secondary" | "destructive") ?? "outline"}>{props.status}</Badge>}
          </div>
        </div>
        <Button size="sm" variant={props.ready ? "outline" : "default"} disabled={props.loading} onClick={props.onAction}>
          {props.loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          {props.actionLabel}
        </Button>
      </div>
      {props.help && <p className="text-xs text-muted-foreground mt-1">{props.help}</p>}
      {props.error && <p className="text-xs text-destructive mt-1">{props.error}</p>}
      {props.ready && props.readyContent && <div className="mt-2">{props.readyContent}</div>}
    </div>
  );
}

function renderHistoricRow(view: BrandView, onRevert: () => void) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Histórico</span>
        <Button size="sm" variant="outline" onClick={onRevert} disabled={!view.hasBrand || view.versions.length < 2}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Voltar versão anterior</Button>
      </div>
      {view.versions.length > 0 && (
        <ol className="mt-2 space-y-1">
          {view.versions.map((v) => (
            <li key={v.id} className={`flex items-center gap-2 text-xs ${v.current ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px]">{v.id}</span>
              {v.label}{v.current && <Badge variant="default" className="text-[9px]">atual</Badge>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function renderMockupRow(mockup: MockupView | undefined, loading: boolean | undefined, onGen: (() => void) | undefined, base?: string, pid?: string) {
  return (
    <DeliveryRow
      icon={<ImagePlus className="h-4 w-4 text-primary" />}
      title="Mockups (PSD Master real)"
      status={mockup?.isReady ? "Pronto" : mockup ? String(mockup.status) : "Não gerado"}
      statusTone={mockup?.isReady ? "default" : "outline"}
      onAction={onGen}
      loading={loading}
      ready={mockup?.isReady}
      actionLabel={mockup?.isReady ? "Gerar novamente" : "Gerar mockups"}
      help="Aplica a identidade aprovada no PSD Master e exporta os rasters reais das camadas."
      error={mockup && !mockup.isReady ? `A última execução não foi concluída (${mockup.status}): sem resultado falso.` : undefined}
      readyContent={mockup?.previews.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {mockup.previews.map((p) => {
            const src = (base && pid) ? mockupPreviewUrl(base, pid, p.applicationId) : p.dataUrl;
            return (
              <figure key={p.applicationId} className="rounded-lg border border-border/60 overflow-hidden">
                <img src={src} alt={`Mockup ${p.applicationId}`} className="w-full h-24 object-contain bg-card/60" />
                <figcaption className="text-[10px] text-center text-muted-foreground py-0.5">{p.applicationId}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : undefined}
    />
  );
}

function renderPdfRow(pdf: BrandPdfView | undefined, loading: boolean | undefined, onGen: (() => void) | undefined) {
  return (
    <DeliveryRow
      icon={<FileText className="h-4 w-4 text-primary" />}
      title="Manual da Identidade (PDF)"
      status={pdf?.state === "ready" ? "Pronto" : pdf?.state === "error" ? "Erro" : "Não gerado"}
      statusTone={pdf?.state === "ready" ? "default" : pdf?.state === "error" ? "destructive" : "outline"}
      onAction={onGen} loading={loading} ready={pdf?.state === "ready"}
      actionLabel={pdf?.state === "ready" ? "Gerar novamente" : "Gerar Proposta de PDF"}
      help="PDF exclusivo gerado a partir da identidade real e dos mockups reais persistidos."
      error={pdf?.state === "error" ? `A última geração falhou ou não foi validada${pdf.reason ? ` (${pdf.reason})` : ""}. Sem resultado falso.` : undefined}
      readyContent={pdf?.state === "ready" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Versão <strong>{pdf.versionId}</strong> · {pdf.pageCount} páginas · {pdf.createdAt ? new Date(pdf.createdAt).toLocaleString() : ""}</span>
          {pdf.pdfUrl && <Button size="sm" variant="outline" asChild><a href={pdf.pdfUrl} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5 mr-1" /> Visualizar</a></Button>}
          {pdf.pdfUrl && <Button size="sm" variant="outline" asChild><a href={pdf.pdfUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar</a></Button>}
        </div>
      )}
    />
  );
}

function renderPackageRow(pkg: BrandPackageView | undefined, loading: boolean | undefined, onGen: (() => void) | undefined) {
  return (
    <DeliveryRow
      icon={<Archive className="h-4 w-4 text-primary" />}
      title="Identidade completa (ZIP)"
      status={pkg?.state === "ready" ? "Pronto" : pkg?.state === "error" ? "Erro" : "Não gerado"}
      statusTone={pkg?.state === "ready" ? "default" : pkg?.state === "error" ? "destructive" : "outline"}
      onAction={onGen} loading={loading} ready={pkg?.state === "ready"}
      actionLabel={pkg?.state === "ready" ? "Gerar novamente" : "Baixar identidade completa"}
      help="Reúne identidade real, mockups reais, manual PDF e PSD final em um ZIP."
      error={pkg?.state === "error" ? `A geração falhou ou o pacote não foi validado${pkg.reason ? ` (${pkg.reason})` : ""}.` : undefined}
      readyContent={pkg?.state === "ready" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Versão <strong>{pkg.versionId}</strong> · {pkg.fileCount} arquivos · {pkg.zipSizeBytes ? Math.round(pkg.zipSizeBytes / 1024) : "—"} KB</span>
          {pkg.zipUrl && <Button size="sm" variant="outline" asChild><a href={pkg.zipUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar ZIP</a></Button>}
        </div>
      )}
    />
  );
}

function renderVideoRow(video: SiteVideoView | undefined, loading: boolean | undefined, onGen: (() => void) | undefined) {
  return (
    <DeliveryRow
      icon={<Film className="h-4 w-4 text-primary" />}
      title="Vídeo de apresentação"
      status={video?.state === "ready" ? "Pronto" : video?.state === "error" ? "Erro" : "Não gerado"}
      statusTone={video?.state === "ready" ? "default" : video?.state === "error" ? "destructive" : "outline"}
      onAction={onGen} loading={loading} ready={video?.state === "ready"}
      actionLabel={video?.state === "ready" ? "Gerar novamente" : "Gerar vídeo"}
      help="Vídeo real (~40–50s, 16:9) do site, com análise, roteiro e captura reais."
      error={video?.state === "error" ? `A última geração falhou ou o vídeo não foi validado${video.reason ? ` (${video.reason})` : ""}.` : undefined}
      readyContent={video?.state === "ready" && (
        <div className="space-y-2">
          <video className="w-full rounded-lg border border-border/60 max-h-56" controls poster={video.posterUrl ?? undefined} src={video.videoUrl ?? undefined} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Versão <strong>{video.versionId}</strong> · {video.duration ?? "—"}s · {video.width ?? "—"}×{video.height ?? "—"} · {video.sceneCount ?? "—"} cenas</span>
            {video.videoUrl && <Button size="sm" variant="outline" asChild><a href={video.videoUrl} target="_blank" rel="noreferrer"><PlayCircle className="h-3.5 w-3.5 mr-1" /> Assistir</a></Button>}
            {video.videoUrl && <Button size="sm" variant="outline" asChild><a href={video.videoUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar vídeo</a></Button>}
          </div>
        </div>
      )}
    />
  );
}

export function BrandingStudio({ view, messages, loading, error, empty, mockup, brandPdf, brandPackage, siteVideo, onGenerateMockup, onGeneratePdf, onGeneratePackage, onGenerateVideo, onSelect, onReject, onRevert, onSend, mockupBaseUrl, mockupProjectId }: BrandingStudioProps) {
  const [draft, setDraft] = useState("");
  const [previewVariant, setPreviewVariant] = useState("primary");

  if (error) {
    return <Card className="p-8 text-center text-sm text-destructive">Não foi possível carregar o projeto de identidade. {error}</Card>;
  }
  if (empty) {
    return (
      <Card className="p-10 text-center border-dashed border-border/60">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"><Sparkles className="h-6 w-6 text-primary" /></div>
        <h2 className="font-display font-semibold text-lg">Nenhum conceito ainda</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Descreva no chat a identidade que você quer criar (ex.: “Crie uma identidade visual premium para uma clínica chamada Movimento”). O agente gera os conceitos e os SVGs reais.</p>
      </Card>
    );
  }

  const selectedSvg = realPreviewSvg(view, previewVariant);
  const variants = Object.entries(view.variants).filter(([, svg]) => svg);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl font-bold tracking-tight">{view.projectName}</h1>
          {view.hasBrand && view.currentVersionId && <Badge variant="secondary">V{view.currentVersionId}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={onRevert} disabled={!view.hasBrand || view.versions.length < 2}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Voltar versão anterior
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* CONCEITOS */}
        <Card className="p-3 space-y-2 self-start">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Conceitos</p>
          {view.concepts.map((c) => (
            <div key={c.id} className={`rounded-xl border p-3 space-y-1 ${c.status === "selecionado" ? "border-primary/60 bg-primary/5" : "border-border/60"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{c.name}</span>
                {statusBadge(c)}
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{c.rationale}</p>
              <div className="flex gap-1.5 pt-1">
                {c.status !== "selecionado" && <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => onSelect(c.id)}>Selecionar</Button>}
                {c.status === "disponível" && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onReject(c.id)}>Rejeitar</Button>}
              </div>
            </div>
          ))}
        </Card>

        {/* PREVIEW + VARIAÇÕES + IDENTIDADE */}
        <div className="space-y-4 min-w-0">
          <Card className="p-6 bg-card/70">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Preview real (SVG)</p>
              {view.selectedConceptId && <Badge variant="outline">Conceito {view.selectedConceptId}</Badge>}
            </div>
            <SvgPreview svg={selectedSvg} className="min-h-[160px] bg-gradient-to-br from-card to-card/40 rounded-xl border border-border/40" />
            {/* variações */}
            {variants.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {variants.map(([key, svg]) => (
                  <button key={key} type="button" onClick={() => setPreviewVariant(key)} className={`rounded-lg border p-1 ${previewVariant === key ? "border-primary/70" : "border-border/50"}`} title={VARIANT_LABELS[key] ?? key}>
                    <span className="block h-12 w-20"><SvgPreview svg={svg} className="h-full" /></span>
                    <span className="block text-[9px] text-muted-foreground text-center mt-1">{VARIANT_LABELS[key] ?? key}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Identidade</p>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(view.palette).map(([k, hex]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]">
                  <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: hex }} /> {k}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              <p><strong>Tipografia:</strong> {view.typography.heading} {view.typography.weights} · {view.typography.body}</p>
              {view.identity.photoDirection && <p className="truncate"><strong>Direção:</strong> {view.identity.photoDirection}</p>}
            </div>
          </Card>
        </div>
      </div>

      {/* ENTREGÁVEIS — secundário/discreto (colapsado por padrão para não poluir) */}
      <Card className="p-2">
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer select-none px-2 py-1">
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground"><ImagePlus className="h-3.5 w-3.5 text-primary" /> Entregáveis &amp; mais ações</span>
            <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="mt-2 space-y-2 px-1">
            {renderHistoricRow(view, onRevert)}
            {renderMockupRow(mockup, loading, onGenerateMockup, mockupBaseUrl, mockupProjectId)}
            {renderPdfRow(brandPdf, loading, onGeneratePdf)}
            {renderPackageRow(brandPackage, loading, onGeneratePackage)}
            {renderVideoRow(siteVideo, loading, onGenerateVideo)}
          </div>
        </details>
      </Card>

      {/* CHAT */}
      <Card className="p-4">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2"><ShieldCheck className="h-3.5 w-3.5" /> Chat contextual</div>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-3">
          {messages.length === 0 && <p className="text-xs text-muted-foreground">Descreva alterações ou escolha um conceito. Ex.: “Gostei do conceito 2”, “muda só a tipografia”, “volta para a versão anterior”.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`text-[13px] ${m.role === "user" ? "text-foreground" : "text-muted-foreground"}`}>
              <span className="font-medium">{m.role === "user" ? "Você" : "Agente"}: </span>{m.text}
            </div>
          ))}
          {loading && <p className="text-xs text-muted-foreground animate-pulse">O agente está trabalhando…</p>}
        </div>
        <div className="flex gap-2">
          <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite uma alteração…" className="min-h-[56px] text-sm" />
          <Button onClick={() => { const t = draft.trim(); if (t) { onSend(t); setDraft(""); } }} disabled={loading || !draft.trim()}>
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </div>
      </Card>
    </div>
  );
}
