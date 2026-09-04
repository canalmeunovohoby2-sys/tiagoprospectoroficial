import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface OrvixPageProps {
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * Shell visual compartilhado por todas as páginas do módulo Orvix ERP.
 * Reaproveita o mesmo padrão visual das demais páginas (AppShell/AppSidebar já envolvem).
 * Sem lógica de negócio — apenas estrutura reservada para futuras implementações.
 */
export default function OrvixPage({ title, description, children }: OrvixPageProps) {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant shrink-0">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
            Orvix ERP
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      <Card className="p-12 text-center border-dashed border-border/60 bg-gradient-to-br from-card to-card/40">
        <h2 className="font-display font-semibold text-lg">Área reservada</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Este espaço será preenchido nas próximas fases do módulo Orvix ERP.
        </p>
        {children}
      </Card>
    </div>
  );
}
