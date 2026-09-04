import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-1 mb-8">{subtitle}</p>
      <Card className="p-12 text-center border-dashed border-border/60">
        <Construction className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
        <h2 className="font-display font-semibold text-lg">Em construção</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Esta seção entra na próxima fase do build. A fundação (auth, banco, tema, layout) já está pronta.
        </p>
      </Card>
    </div>
  );
}
