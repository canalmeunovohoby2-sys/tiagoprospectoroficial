import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MessageSquare, Trash2, Check, MapPin, Clock, ListChecks, Inbox, ChevronDown, ChevronUp, ExternalLink, Undo2, Sparkles, Loader2, Copy,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useWaitingQueue, type QueueItem } from "@/hooks/useWaitingQueue";
import { supabase } from "@/integrations/supabase/client";

function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function tierClass(tier: string | null) {
  const t = (tier ?? "").toLowerCase();
  if (t === "alta" || t === "high") return "border-emerald-500/40 text-emerald-500 bg-emerald-500/5";
  if (t === "média" || t === "media" || t === "medium") return "border-amber-500/40 text-amber-500 bg-amber-500/5";
  if (t === "baixa" || t === "low") return "border-red-500/40 text-red-500 bg-red-500/5";
  return "border-border text-muted-foreground";
}

function tierLabel(tier: string | null) {
  const t = (tier ?? "").toLowerCase();
  if (t === "high") return "Alta";
  if (t === "medium") return "Média";
  if (t === "low") return "Baixa";
  return tier ?? "";
}

export default function Queue() {
  const { items, remove, markSent, unmarkSent, clearPending } = useWaitingQueue();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pending = useMemo(
    () => items.filter((i) => i.status === "pending").sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );
  const sent = useMemo(
    () => items.filter((i) => i.status === "sent").sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0)),
    [items],
  );

  function handleClear() {
    clearPending();
    setConfirmOpen(false);
    toast.success("Fila limpa com sucesso");
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-primary" />
            Fila de Espera
          </h1>
          <p className="text-muted-foreground mt-1">
            Central de prospecção · {pending.length} pendente(s) · {sent.length} enviado(s)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={pending.length === 0}
          className="border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4 mr-1" /> Limpar Fila
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
          <Inbox className="h-4 w-4" /> Pendentes ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <p className="text-muted-foreground text-sm">
              Nenhum lead pendente. Use "Enviar para Fila" no modal do lead para adicionar.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {pending.map((it) => (
              <QueueCard key={it.id} item={it} onRemove={() => remove(it.id)} onSent={() => markSent(it.id)} onUnsent={() => unmarkSent(it.id)} />
            ))}
          </div>
        )}
      </section>

      {sent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
            <Check className="h-4 w-4" /> Enviados ({sent.length})
          </h2>
          <div className="grid gap-3">
            {sent.map((it) => (
              <QueueCard key={it.id} item={it} onRemove={() => remove(it.id)} onSent={() => markSent(it.id)} onUnsent={() => unmarkSent(it.id)} />
            ))}
          </div>
        </section>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar fila pendente?</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja limpar toda a fila? Essa ação não poderá ser desfeita. Os leads marcados como "Enviados" serão preservados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleClear}>Confirmar Limpeza</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueCard({ item, onRemove, onSent, onUnsent }: { item: QueueItem; onRemove: () => void; onSent: () => void; onUnsent: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState("");
  const sentBadge = item.status === "sent";

  function sendWhatsApp() {
    if (!item.whatsapp) { toast.error("Lead sem WhatsApp"); return; }
    const finalMsg = item.message.includes(item.landingUrl)
      ? item.message
      : `${item.message.trimEnd()}\n\nSegue o link da demonstração:\n${item.landingUrl}`;
    const phone = item.whatsapp.replace(/\D/g, "");
    const wa = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(finalMsg)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  async function generateScript() {
    setScriptOpen(true);
    if (script) return;
    setScriptLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-video-script", {
        body: {
          lead: {
            name: item.name,
            segment: item.segment,
            city: item.city,
            state: item.state,
            landingUrl: item.landingUrl,
          },
        },
      });
      if (error) throw error;
      const s = (data as { script?: string; error?: string })?.script ?? "";
      if (!s) throw new Error((data as { error?: string })?.error || "Roteiro vazio");
      setScript(s);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar roteiro");
      setScriptOpen(false);
    } finally {
      setScriptLoading(false);
    }
  }

  async function regenerate() {
    setScript("");
    setScriptLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-video-script", {
        body: {
          lead: {
            name: item.name, segment: item.segment, city: item.city, state: item.state, landingUrl: item.landingUrl,
          },
        },
      });
      if (error) throw error;
      const s = (data as { script?: string })?.script ?? "";
      setScript(s);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar roteiro");
    } finally {
      setScriptLoading(false);
    }
  }

  function copyScript() {
    if (!script) return;
    navigator.clipboard.writeText(script).then(
      () => toast.success("Roteiro copiado! Cole no CapCut."),
      () => toast.error("Não foi possível copiar"),
    );
  }

  return (
    <Card className={`p-4 border-border/50 transition-colors ${sentBadge ? "opacity-70" : "hover:border-primary/40"}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{item.name}</h3>
            {item.roiTier && (
              <Badge variant="outline" className={`text-[10px] ${tierClass(item.roiTier)}`}>
                ROI {tierLabel(item.roiTier)} {item.roiScore != null ? `· ${item.roiScore}` : ""}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">Template {item.template}</Badge>
            {sentBadge && (
              <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/40" variant="outline">
                ✓ Enviado
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {item.segment && <span>{item.segment}</span>}
            {item.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.city}/{item.state}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.createdAt)}</span>
            {item.whatsapp && <span>📱 {item.whatsapp}</span>}
          </div>
          <a
            href={item.landingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
          >
            <ExternalLink className="h-3 w-3" /> {item.landingUrl}
          </a>

          {expanded && (
            <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mensagem final</p>
              <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/90">{item.message}</pre>
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Recolher" : "Ver mensagem"}
          </button>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {item.whatsapp && (
              <Button size="sm" onClick={sendWhatsApp} className="bg-emerald-600 hover:bg-emerald-700">
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Enviar WhatsApp
              </Button>
            )}
            <Button
              size="sm"
              onClick={generateScript}
              title="Gerar roteiro de vídeo com IA (para CapCut/TTS)"
              className="bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 hover:text-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Roteiro IA
            </Button>
            {!sentBadge ? (
              <Button size="sm" variant="outline" onClick={onSent} title="Marcar como enviado">
                <Check className="h-3.5 w-3.5 mr-1" /> Marcar como Enviado
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onUnsent} title="Desmarcar como enviado" className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500">
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Desmarcar Enviado
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onRemove} title="Remover" className="text-red-500 hover:text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Roteiro de Vídeo · {item.name}
            </DialogTitle>
            <DialogDescription>
              Roteiro falado (25–40s) adaptado ao nicho. Cole no CapCut e use o TTS para gerar a voz do Reels/Status.
            </DialogDescription>
          </DialogHeader>

          {scriptLoading ? (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm">Gerando roteiro com IA…</span>
            </div>
          ) : (
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={10}
              className="font-sans text-sm leading-relaxed"
            />
          )}

          {!scriptLoading && script && (
            <p className="text-[11px] text-primary mt-1">
              {script.length} caracteres · ~{script.trim().split(/\s+/).filter(Boolean).length} palavras
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={regenerate} disabled={scriptLoading}>
              <Sparkles className="h-4 w-4 mr-1" /> Gerar outra versão
            </Button>
            <Button onClick={copyScript} disabled={!script || scriptLoading} className="bg-primary text-primary-foreground">
              <Copy className="h-4 w-4 mr-1" /> Copiar roteiro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
