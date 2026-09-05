import { Card } from "@/components/ui/card";
import { AIProviderStatus } from "@/components/app/AIProviderStatus";

export default function Settings() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status e diagnóstico dos provedores de IA usados pelo Prospector. As chaves ficam somente no Supabase.
        </p>
      </div>
      <Card className="p-5">
        <AIProviderStatus />
      </Card>
    </div>
  );
}
