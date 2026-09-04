import { memo } from "react";
import { Sparkles, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const OFFER_TEXT = `Plano Starter — Landing Page Premium

• Landing page responsiva
• Botão WhatsApp integrado
• Copy persuasiva
• SEO local básico

Investimento sugerido: R$ 997 a R$ 1.497`;

function OfferCardBase() {
  return (
    <Card className="p-3 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-primary flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Oferta Recomendada
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => { navigator.clipboard.writeText(OFFER_TEXT); toast.success("Oferta copiada"); }}
        >
          <Copy className="h-3 w-3 mr-1" /> Copiar
        </Button>
      </div>
      <div className="text-sm font-semibold">Plano Starter — Landing Page Premium</div>
      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
        <li>Landing page responsiva</li>
        <li>Botão WhatsApp integrado</li>
        <li>Copy persuasiva</li>
        <li>SEO local básico</li>
      </ul>
      <div className="text-xs mt-2">
        <span className="text-muted-foreground">Investimento sugerido: </span>
        <span className="font-semibold text-foreground">R$ 997 a R$ 1.497</span>
      </div>
    </Card>
  );
}

export const OfferCard = memo(OfferCardBase);
