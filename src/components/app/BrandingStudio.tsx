import { useState } from "react";
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
            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              <p><strong>Tipografia:</strong> {view.typography.heading} {view.typography.weights} · {view.typography.body} (hierarquia: {view.identity.hierarchy || "—"})</p>
              {view.identity.photoDirection && <p><strong>Direção fotográfica:</strong> {view.identity.photoDirection}</p>}
              {view.identity.applicationRules && <p><strong>Regras:</strong> {view.identity.applicationRules}</p>}
            </div>
          </Card>

          {view.versions.length > 0 && (
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Histórico</p>
              <ol className="space-y-1">
                {view.versions.map((v) => (
                  <li key={v.id} className={`flex items-center gap-2 text-xs ${v.current ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px]">{v.id}</span>
                    {v.label}{v.current && <Badge variant="default" className="text-[9px]">atual</Badge>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>

      {/* MOCKUPS (FASE 10.10) */}
      <Card className="p-4 border-dashed border-border/70">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mockups (PSD Master real)</p>
            {mockup?.isReady && <Badge variant="default">pronto</Badge>}
            {mockup && !mockup.isReady && <Badge variant="outline">{mockup.status}</Badge>}
          </div>
          <Button size="sm" variant={mockup?.isReady ? "outline" : "default"} disabled={loading} onClick={onGenerateMockup}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 mr-1" />}
            {mockup?.isReady ? "Gerar novamente" : "Gerar mockups"}
          </Button>
        </div>

        {!mockup?.hasMockup ? (
          <p className="text-xs text-muted-foreground">
            A identidade está pronta para virar mockup. Clique em <strong>Gerar mockups</strong> para aplicar a identidade aprovada
            no PSD Master (aplicações contextuais) e exportar os rasters reais.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span><strong>Identidade:</strong> {mockup.identityName || "—"} {mockup.versionId && <Badge variant="secondary" className="text-[9px]">v{mockup.versionId}</Badge>}</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border" style={{ backgroundColor: mockup.primary }} /> primary</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border" style={{ backgroundColor: mockup.secondary }} /> secondary</span>
            </div>

            {mockup.previews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {mockup.previews.map((p) => {
                  const src = (mockupBaseUrl && mockupProjectId) ? mockupPreviewUrl(mockupBaseUrl, mockupProjectId, p.applicationId) : p.dataUrl;
                  return (
                    <figure key={p.applicationId} className="rounded-lg border border-border/60 overflow-hidden">
                      <img src={src} alt={`Mockup ${p.applicationId}`} className="w-full h-32 object-contain bg-card/60" />
                      <figcaption className="text-[10px] text-center text-muted-foreground py-1">{p.applicationId}</figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Previews = rasters reais das camadas modificadas (exportLayerRasterPng). Não é preview embutido do PSD.</p>

            {mockup.applicationsUnsupported.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Não suportadas: {mockup.applicationsUnsupported.map((u) => `${u.applicationId} (${u.reason})`).join(", ")}</span>
              </div>
            )}
            {!mockup.isReady && (
              <p className="text-xs text-destructive">A última execução não foi concluída com sucesso ({mockup.status}): sem resultado falso.</p>
            )}
          </div>
        )}
      </Card>

      {/* MANUAL DA IDENTIDADE (FASE 11) */}
      <Card className="p-4 border-dashed border-border/70">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Manual da Identidade (PDF)</p>
            {brandPdf?.state === "ready" && <Badge variant="default">Pronto</Badge>}
            {brandPdf?.state === "error" && <Badge variant="outline">Erro</Badge>}
            {brandPdf?.state === "none" && <Badge variant="outline">Não gerado</Badge>}
          </div>
          <Button size="sm" variant={brandPdf?.state === "ready" ? "outline" : "default"} disabled={loading} onClick={onGeneratePdf}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
            {brandPdf?.state === "ready" ? "Gerar novamente" : "Gerar manual"}
          </Button>
        </div>

        {brandPdf?.state === "none" && (
          <p className="text-xs text-muted-foreground">O PDF será gerado a partir da identidade real e dos mockups reais persistidos. Clique em <strong>Gerar manual</strong>.</p>
        )}
        {brandPdf?.state === "error" && (
          <p className="text-xs text-destructive">A última geração falhou ou não foi validada{brandPdf.reason ? ` (${brandPdf.reason})` : ""}. Sem resultado falso.</p>
        )}
        {brandPdf?.state === "ready" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Versão <strong>{brandPdf.versionId}</strong> · {brandPdf.pageCount} páginas · {brandPdf.createdAt ? new Date(brandPdf.createdAt).toLocaleString() : ""}</span>
            {brandPdf.pdfUrl && (
              <>
                <Button size="sm" variant="outline" asChild><a href={brandPdf.pdfUrl} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5 mr-1" /> Visualizar</a></Button>
                <Button size="sm" variant="outline" asChild><a href={brandPdf.pdfUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar</a></Button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* IDENTIDADE COMPLETA (FASE 12) */}
      <Card className="p-4 border-dashed border-border/70">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Identidade completa (ZIP)</p>
            {brandPackage?.state === "ready" && <Badge variant="default">Pronto</Badge>}
            {brandPackage?.state === "error" && <Badge variant="outline">Erro</Badge>}
            {brandPackage?.state === "none" && <Badge variant="outline">Não gerado</Badge>}
          </div>
          <Button size="sm" variant={brandPackage?.state === "ready" ? "outline" : "default"} disabled={loading} onClick={onGeneratePackage}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
            {brandPackage?.state === "ready" ? "Gerar novamente" : "Baixar identidade completa"}
          </Button>
        </div>

        {brandPackage?.state === "none" && <p className="text-xs text-muted-foreground">Reúne a identidade real, mockups reais, manual PDF e PSD final em um ZIP profissional.</p>}
        {brandPackage?.state === "error" && <p className="text-xs text-destructive">A geração falhou ou o pacote não foi validado{brandPackage.reason ? ` (${brandPackage.reason})` : ""}. Sem resultado falso.</p>}
        {brandPackage?.state === "ready" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Versão <strong>{brandPackage.versionId}</strong> · {brandPackage.fileCount} arquivos · {brandPackage.zipSizeBytes ? Math.round(brandPackage.zipSizeBytes / 1024) : "—"} KB · {brandPackage.createdAt ? new Date(brandPackage.createdAt).toLocaleString() : ""}</span>
            {brandPackage.zipUrl && (
              <Button size="sm" variant="outline" asChild><a href={brandPackage.zipUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar ZIP</a></Button>
            )}
          </div>
        )}
      </Card>

      {/* VÍDEO DE APRESENTAÇÃO (FASE 13) */}
      <Card className="p-4 border-dashed border-border/70">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Vídeo de apresentação</p>
            {siteVideo?.state === "ready" && <Badge variant="default">Pronto</Badge>}
            {siteVideo?.state === "error" && <Badge variant="outline">Erro</Badge>}
            {siteVideo?.state === "none" && <Badge variant="outline">Não gerado</Badge>}
          </div>
          <Button size="sm" variant={siteVideo?.state === "ready" ? "outline" : "default"} disabled={loading} onClick={onGenerateVideo}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1" />}
            {siteVideo?.state === "ready" ? "Gerar novamente" : "Gerar vídeo"}
          </Button>
        </div>

        {siteVideo?.state === "none" && <p className="text-xs text-muted-foreground">Vídeo profissional (~40–50s, 16:9) do site real, com análise, roteiro e captura reais.</p>}
        {siteVideo?.state === "error" && <p className="text-xs text-destructive">A última geração falhou ou o vídeo não foi validado{siteVideo.reason ? ` (${siteVideo.reason})` : ""}. Sem resultado falso.</p>}
        {siteVideo?.state === "ready" && (
          <div className="space-y-2">
            <video className="w-full rounded-lg border border-border/60 max-h-72" controls poster={siteVideo.posterUrl ?? undefined} src={siteVideo.videoUrl ?? undefined} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Versão <strong>{siteVideo.versionId}</strong> · {siteVideo.duration ?? "—"}s · {siteVideo.width ?? "—"}×{siteVideo.height ?? "—"} · {siteVideo.sceneCount ?? "—"} cenas · {siteVideo.createdAt ? new Date(siteVideo.createdAt).toLocaleString() : ""}</span>
              {siteVideo.videoUrl && (
                <Button size="sm" variant="outline" asChild><a href={siteVideo.videoUrl} target="_blank" rel="noreferrer"><PlayCircle className="h-3.5 w-3.5 mr-1" /> Assistir</a></Button>
              )}
              {siteVideo.videoUrl && (
                <Button size="sm" variant="outline" asChild><a href={siteVideo.videoUrl} download><Download className="h-3.5 w-3.5 mr-1" /> Baixar vídeo</a></Button>
              )}
            </div>
          </div>
        )}
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
