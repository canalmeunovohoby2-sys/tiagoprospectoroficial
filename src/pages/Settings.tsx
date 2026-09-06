import { Card } from "@/components/ui/card";
import { AIProviderStatus } from "@/components/app/AIProviderStatus";
import { AiProvidersSettings } from "@/components/app/AiProvidersSettings";

export default function Settings() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status, diagnóstico e configuração dos provedores de IA. As chaves ficam somente no servidor (Supabase).
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Provedores de IA</h2>
        <Card className="p-5">
          <AiProvidersSettings />
        </Card>
      </section>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Status e diagnóstico</h2>
        <AIProviderStatus />
      </Card>
    </div>
  );
}
