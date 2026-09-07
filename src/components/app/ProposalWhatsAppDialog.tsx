import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  buildProposalMessage,
  businessLabel,
  publicSiteUrl,
  resolveProposalTarget,
  whatsappProposalUrl,
  type ProposalLeadLike,
} from "@/lib/proposalWhatsApp";

interface SiteProjectLite {
  id: string;
  slug: string | null;
  status: string | null;
}

// Enviar proposta pelo WhatsApp — interface interna de vendas.
// Abre o WhatsApp do LEAD (número comprovado), com a mensagem EDITÁVEL e o
// link da proposta/site correspondente quando o projeto já existir.
export function ProposalWhatsAppDialog({
  lead, open, onOpenChange, projectSite,
}: {
  lead: ProposalLeadLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projeto/site conhecido (tela do projeto). Quando informado, não busca de novo. */
  projectSite?: { slug: string | null; status: string | null } | null;
}) {
  const [message, setMessage] = useState("");
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [siteStatus, setSiteStatus] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  const target = resolveProposalTarget(lead ?? {});
  const label = businessLabel(lead?.name, lead?.city);

  useEffect(() => {
    if (!open || !lead?.id) return;
    let cancelled = false;
    setLoadingProject(true);
    setMessage("");
    setSiteUrl(null);
    setSiteStatus(null);
    (async () => {
      let slug: string | null = null;
      let status: string | null = null;
      if (projectSite && projectSite.slug) {
        slug = projectSite.slug;
        status = projectSite.status ?? null;
      } else {
        const { data } = await supabase
          .from("site_projects")
          .select("id, slug, status")
          .eq("lead_id", String(lead.id))
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const project = data as SiteProjectLite | null;
        slug = project?.slug ?? null;
        status = project?.status ?? null;
      }
      if (cancelled) return;
      const url = slug ? publicSiteUrl(window.location.origin, slug) : null;
      // Só coloca o link na mensagem quando o site do projeto existe de fato.
      const usable = url && (status === "generated" || status === "published") ? url : null;
      setSiteUrl(url);
      setSiteStatus(status);
      setMessage(buildProposalMessage({ name: lead.name, segment: lead.segment, city: lead.city, siteUrl: usable }));
      setLoadingProject(false);
    })();
    return () => { cancelled = true; };
  }, [open, lead?.id, projectSite?.slug, projectSite?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function send() {
    if (!lead || !target.hasWhatsapp || !target.phoneNumber) {
      toast.error("Este lead não possui WhatsApp comprovado para envio de proposta.");
      return;
    }
    const text = message.trim();
    if (!text) { toast.error("Escreva a mensagem antes de enviar."); return; }
    const url = whatsappProposalUrl(target.phoneNumber, text);
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success(`Abrindo WhatsApp para ${label}`);
  }

  const disabled = !lead || !target.hasWhatsapp || !target.phoneNumber || !message.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-emerald-500" /> Enviar proposta pelo WhatsApp</DialogTitle>
          <DialogDescription>
            Mensagem vai para o WhatsApp comprovado do lead — nunca para telefone fixo nem para o seu número.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              {target.hasWhatsapp && target.whatsapp ? `WhatsApp do lead: ${target.whatsapp}` : "Sem WhatsApp comprovado"}
            </p>
            {siteUrl && (
              <p className="mt-1 text-xs break-words text-emerald-600">
                Link da proposta/site: <span className="font-mono">{siteUrl}</span>
                {siteStatus ? ` · status: ${siteStatus}` : ""}
              </p>
            )}
          </div>

          {!target.hasWhatsapp ? (
            <p className="text-xs text-amber-600">
              Este lead não tem WhatsApp comprovado (apenas telefone ou nada). O envio de proposta está indisponível até existir um WhatsApp real confirmado.
            </p>
          ) : (
            <>
              <label className="block text-xs font-medium text-muted-foreground">
                Mensagem (edite à vontade antes de enviar)
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={9}
                className="text-sm"
                placeholder="Sua proposta para o lead…"
              />
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={send} disabled={disabled || loadingProject}>
            {loadingProject ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
