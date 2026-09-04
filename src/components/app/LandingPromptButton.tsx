import { useState } from "react";
import { Rocket, Sparkles, Loader2, Check, Download, Clipboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/data/types";

export function LandingPromptButton({ lead, variant = "icon" }: { lead: Lead; variant?: "icon" | "full" }) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [promptTecnico, setPromptTecnico] = useState("");
  const [copied, setCopied] = useState(false);

  const trigger =
    variant === "icon" ? (
      <Button size="icon" variant="ghost" title="Gerar Super Prompt R$ 10k" onClick={() => setOpen(true)}>
        <Rocket className="h-4 w-4 text-primary" />
      </Button>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Rocket className="h-3.5 w-3.5 mr-1" /> Gerar Super Prompt
      </Button>
    );

  async function generate() {
    setIsLoading(true);
    setPromptTecnico("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-code", { body: { lead } });
      if (error) throw error;
      if (!data?.prompt_tecnico_criacao) throw new Error("Resposta vazia da IA");
      setPromptTecnico(data.prompt_tecnico_criacao);
      toast.success("Super Prompt gerado");
    } catch (e: any) {
      toast.error(`Erro ao gerar: ${e?.message ?? "desconhecido"}`);
    } finally {
      setIsLoading(false);
    }
  }

  function slugify(s: string) {
    return (s || "lead")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lead";
  }

  const leadSlug = slugify(lead.name || (lead as any).company_name || "lead");
  const filename = `receita-${leadSlug}.txt`;

  async function handleCopy() {
    if (!promptTecnico) return;
    try {
      await navigator.clipboard.writeText(promptTecnico);
      setCopied(true);
      toast.success("Prompt copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  function handleDownload() {
    if (!promptTecnico) return;
    const blob = new Blob([promptTecnico], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filename} baixado`);
  }

  const hasContent = Boolean(promptTecnico);

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Super Prompt R$ 10k — {lead.name}
            </DialogTitle>
            <DialogDescription>
              Receita técnica ultra-personalizada pronta para colar no Lovable ({lead.segment || lead.category || "segmento"}).
            </DialogDescription>
          </DialogHeader>

          {!hasContent && !isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500/20 to-emerald-500/20 flex items-center justify-center border border-primary/30">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                Clique em <strong>Gerar Super Prompt com Gemini</strong> para receber a receita técnica completa.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-emerald-500/30 bg-background overflow-hidden mt-2">
            <div className="flex items-center justify-between bg-slate-950 px-5 py-3.5 border-b border-slate-800 select-none">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex gap-1.5 mr-2 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5 truncate">
                  <Sparkles className="text-indigo-400 shrink-0" size={12} />
                  <span className="truncate">receita-tecnica.txt</span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!promptTecnico}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-slate-700/50 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copied ? <Check className="text-emerald-400" size={14} /> : <Clipboard size={14} />}
                  <span>{copied ? "Copiado!" : "📋 Copiar"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!promptTecnico}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-slate-700/50 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={14} />
                  <span>📥 Baixar .txt</span>
                </button>
              </div>
            </div>

            <div className="max-h-[520px] overflow-auto">
              {isLoading && !promptTecnico ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Gerando Super Prompt... (pode levar até 40s)</span>
                </div>
              ) : (
                <pre className="p-5 whitespace-pre-wrap text-sm leading-relaxed font-sans">
                  {promptTecnico || "— Clique em Gerar Super Prompt para preencher esta área —"}
                </pre>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button
              onClick={generate}
              disabled={isLoading}
              className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 text-white hover:from-violet-500 hover:via-fuchsia-500 hover:to-indigo-500 shadow-lg shadow-violet-500/40 px-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> ✨ {hasContent ? "Gerar Novamente" : "Gerar Super Prompt com Gemini"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
