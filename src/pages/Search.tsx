import { useNavigate } from "react-router-dom";
import { LeadSearchForm } from "@/components/app/LeadSearchForm";

/**
 * Página de busca de leads para o módulo Landing Pages.
 * Delega todo o fluxo ao componente reutilizável `LeadSearchForm`
 * e, ao concluir, navega para a listagem de Leads atual.
 */
export default function Search() {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Pesquisar Leads</h1>
        <p className="text-muted-foreground mt-1">
          Empresas reais de fontes públicas em tempo real — sem dados fictícios.
        </p>
      </div>

      <LeadSearchForm onComplete={(searchId) => navigate(`/leads?search=${searchId}`)} />
    </div>
  );
}
