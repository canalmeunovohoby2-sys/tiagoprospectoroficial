import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { LeadSearchForm } from "@/components/app/LeadSearchForm";
import { ORVIX_SEGMENTS } from "@/data/orvixSegments";

/**
 * Orvix ERP — Prospectar.
 * Reutiliza integralmente o formulário de busca da plataforma (mesma edge
 * function, mesmo scoring, mesma persistência). Ao concluir, abre a listagem
 * exclusiva do módulo Orvix em vez da tela de Leads padrão.
 *
 * Diferencial: usa uma lista curada de segmentos (ORVIX_SEGMENTS) voltada
 * para empresas que fazem sentido para venda de ERP/PDV.
 */
export default function OrvixProspectar() {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant shrink-0">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
            Orvix ERP
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Prospectar</h1>
          <p className="text-muted-foreground mt-1">
            Módulo especializado em prospecção para venda do sistema Orvix.
          </p>
        </div>
      </div>

      <LeadSearchForm
        segments={ORVIX_SEGMENTS}
        module="orvix"
        onComplete={(searchId) => navigate(`/orvix/prospectar/resultados?search=${searchId}`)}
      />
    </div>
  );
}

