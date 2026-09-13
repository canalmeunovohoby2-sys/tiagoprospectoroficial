import { useMemo, useState } from "react";
import { Sparkles, Copy, RefreshCw, Eraser, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  buildPremiumPrompt,
  OBJECTIVE_OPTIONS,
  STYLE_OPTIONS,
  type PromptInput,
} from "@/lib/promptGenerator";

/**
 * CRIADOR DE PROMPT PREMIUM — dentro do Studio. Determinístico (sem IA/API):
 * transforma poucas informações do cliente em um briefing completo e executável
 * para o gerador de sites existente. Não gera site; gera o PROMPT.
 */
export function PromptCreator({ onUseInGenerator }: { onUseInGenerator?: (prompt: string) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [segment, setSegment] = useState("");
  const [location, setLocation] = useState("");
  const [offers, setOffers] = useState("");
  const [audience, setAudience] = useState("");
  const [differentials, setDifferentials] = useState("");
  const [objectives, setObjectives] = useState<string[]>(["Gerar leads"]);
  const [styles, setStyles] = useState<string[]>(["Premium"]);
  const [reference, setReference] = useState("");
  const [variantSeed, setVariantSeed] = useState(0);
  const [output, setOutput] = useState("");

  const canGenerate = companyName.trim().length >= 2 && segment.trim().length >= 2;
  const input: PromptInput = useMemo(
    () => ({ companyName, segment, location, offers, audience, differentials, objectives, styles, reference, variantSeed }),
    [companyName, segment, location, offers, audience, differentials, objectives, styles, reference, variantSeed],
  );

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function generate(nextSeed = variantSeed) {
    if (!canGenerate) { toast.error("Preencha Nome da empresa e Segmento."); return; }
    setOutput(buildPremiumPrompt({ ...input, variantSeed: nextSeed }));
  }

  function regenerate() {
    const s = variantSeed + 1;
    setVariantSeed(s);
    generate(s);
    toast.success("Prompt regenerado");
  }

  async function copy() {
    if (!output.trim()) { toast.error("Gere o prompt primeiro."); return; }
    try { await navigator.clipboard.writeText(output); toast.success("Prompt copiado"); }
    catch { toast.error("Não foi possível copiar. Selecione e copie manualmente."); }
  }

  function clearAll() {
    setOutput("");
    setCompanyName(""); setSegment(""); setLocation(""); setOffers(""); setAudience("");
    setDifferentials(""); setReference(""); setObjectives(["Gerar leads"]); setStyles(["Premium"]); setVariantSeed(0);
    toast.success("Formulário limpo");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h2 className="font-display font-semibold">Criador de Prompt Premium</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Preencha o mínimo. O sistema monta o briefing completo (estratégia, arquitetura, direção de arte, copy, motion, mobile, SEO e tracking) para você usar no gerador de sites.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nome da empresa *</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex.: Studio Aurora" />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento *</Label>
            <Input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="Ex.: clínica odontológica" />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade/Região (opcional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: São Paulo/SP" />
          </div>
          <div className="space-y-1.5">
            <Label>Público-alvo (opcional)</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex.: famílias e empresas de médio porte" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>O que a empresa oferece? (opcional)</Label>
          <Input value={offers} onChange={(e) => setOffers(e.target.value)} placeholder="Ex.: instalação de energia solar residencial e comercial" />
        </div>
        <div className="space-y-1.5">
          <Label>Diferenciais (opcional)</Label>
          <Input value={differentials} onChange={(e) => setDifferentials(e.target.value)} placeholder="Ex.: atendimento rápido, 12 anos de experiência, garantia" />
        </div>

        <div className="space-y-2">
          <Label>Objetivo do site (pode escolher vários)</Label>
          <div className="flex flex-wrap gap-1.5">
            {OBJECTIVE_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => toggle(objectives, o, setObjectives)}>
                <Badge variant={objectives.includes(o) ? "default" : "outline"} className="cursor-pointer">{o}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Estilo desejado</Label>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_OPTIONS.map((s) => (
              <button key={s} type="button" onClick={() => toggle(styles, s, setStyles)}>
                <Badge variant={styles.includes(s) ? "default" : "outline"} className="cursor-pointer">{s}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Referência ou observação adicional (opcional)</Label>
          <Textarea rows={3} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Alguma preferência, referência ou informação importante?" className="resize-y text-sm" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => generate()} disabled={!canGenerate} className="bg-gradient-primary hover:opacity-95">
            <Sparkles className="h-4 w-4 mr-1" /> GERAR PROMPT PREMIUM
          </Button>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={!canGenerate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerar
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        </div>
        {!canGenerate && <p className="text-[11px] text-muted-foreground">* Obrigatório: nome da empresa e segmento.</p>}
      </Card>

      <Card className="p-5 space-y-3 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold">Prompt gerado</h2>
          {output && <Badge variant="outline" className="text-[10px]">{output.length} caracteres</Badge>}
        </div>
        <Textarea
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="O prompt premium aparecerá aqui — pronto para revisar, editar e copiar."
          className="flex-1 min-h-[420px] font-mono text-[12px] leading-relaxed resize-y"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={copy} disabled={!output.trim()}>
            <Copy className="h-3.5 w-3.5 mr-1" /> COPIAR PROMPT
          </Button>
          {onUseInGenerator && (
            <Button size="sm" variant="outline" onClick={() => { onUseInGenerator(output.trim()); }} disabled={!output.trim()}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> Usar no gerador de site
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
