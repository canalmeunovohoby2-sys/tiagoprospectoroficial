import { memo } from "react";
import { Button } from "@/components/ui/button";

export type WaTemplate = "A" | "B" | "C" | "D";

export const TEMPLATE_B_TEXT = `Olá! Tudo bem?

Analisei rapidamente a presença digital da empresa de vocês e identifiquei algumas oportunidades interessantes de captação online.

Inclusive montei uma demonstração visual personalizada mostrando como vocês poderiam melhorar a conversão de visitantes em clientes.

Segue o link da demonstração:
[LINK_DA_LANDING_PAGE]

Se fizer sentido, posso te mostrar sem compromisso.

— Tiago`;

export const TEMPLATE_C_TEXT = `Olá! Aqui é o Tiago 👋

Estou ajudando empresas como a sua a atrair mais clientes pela internet com landing pages modernas e otimizadas para conversão.

Para mostrar o que é possível, preparei uma demonstração 100% personalizada inspirada no negócio de vocês — pode dar uma olhada sem compromisso:

Segue o link da demonstração:
[LINK_DA_LANDING_PAGE]

Posso ajustar cores, textos, layout e tudo mais conforme a sua preferência.

Fico à disposição.
Tiago`;

export const TEMPLATE_D_TEXT = `Oi! Tudo certo? Aqui é o Tiago.

Vou ser direto: hoje muita gente busca empresas como a sua pelo Google e pelo Instagram antes de fechar negócio. Uma página bem feita aumenta MUITO a chance dessa pessoa entrar em contato.

Por isso já adiantei uma demonstração para vocês olharem — sem custo e sem compromisso:

Segue o link da demonstração:
[LINK_DA_LANDING_PAGE]

Se curtir, a gente conversa sobre os ajustes e deixa do jeitinho que vocês imaginam.

Abraço,
Tiago`;

export const TEMPLATE_TEXTS: Record<Exclude<WaTemplate, "A">, string> = {
  B: TEMPLATE_B_TEXT,
  C: TEMPLATE_C_TEXT,
  D: TEMPLATE_D_TEXT,
};

const OPTIONS: { id: WaTemplate; label: string; title: string }[] = [
  { id: "A", label: "A · IA atual", title: "Template A — Mensagem gerada com IA" },
  { id: "B", label: "B · Curiosity", title: "Template B — Curiosity-based" },
  { id: "C", label: "C · Consultivo", title: "Template C — Tom consultivo e direto" },
  { id: "D", label: "D · Direto", title: "Template D — Direto ao ponto, conversacional" },
];

interface Props {
  value: WaTemplate;
  onSelect: (t: WaTemplate) => void;
}

function WhatsAppTemplatePickerBase({ value, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <span className="text-[11px] text-muted-foreground">Template:</span>
      {OPTIONS.map((o) => (
        <Button
          key={o.id}
          type="button"
          size="sm"
          variant={value === o.id ? "default" : "outline"}
          onClick={() => onSelect(o.id)}
          className="h-7 px-2 text-[11px]"
          title={o.title}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export const WhatsAppTemplatePicker = memo(WhatsAppTemplatePickerBase);
