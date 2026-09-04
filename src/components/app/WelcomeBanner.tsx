import { memo, useMemo } from "react";
import { Sparkles } from "lucide-react";

const MESSAGES = [
  "Hoje é um ótimo dia para encontrar novos clientes.",
  "Cada lead é uma nova oportunidade de crescimento.",
  "Foque nos resultados — o próximo cliente pode estar a um clique.",
  "Prospectar bem hoje é vender mais amanhã.",
  "Sua próxima conversão pode estar aqui agora.",
  "Disciplina diária, resultados extraordinários. Bora prospectar!",
  "Pequenos passos consistentes constroem grandes carteiras de clientes.",
  "Quem prospecta todo dia nunca fica sem oportunidades.",
  "Cada contato de hoje é um contrato em potencial amanhã.",
  "Energia, foco e ação — a fórmula de quem vende muito.",
  "Comece agora: a meta do mês passa por mais uma boa conversa hoje.",
  "Acredite no processo, refine a abordagem e os clientes virão.",
  "Hoje é dia de transformar prospecção em faturamento.",
  "Movimento gera oportunidade. Vamos começar?",
  "Excelência é repetir o básico todos os dias com qualidade.",
];

function pickMessage(): string {
  // Varia por sessão (a cada novo carregamento da página)
  const idx = Math.floor(Math.random() * MESSAGES.length);
  return MESSAGES[idx];
}

export const WelcomeBanner = memo(function WelcomeBanner() {
  const message = useMemo(pickMessage, []);

  return (
    <div className="glass glass-hover rounded-2xl p-5 lg:p-6 flex items-center gap-4 animate-fade-in">
      <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-primary/20 border border-primary/40 flex items-center justify-center shadow-elegant">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="font-display text-2xl lg:text-3xl font-semibold tracking-tight">
          Olá, Tiago <span aria-hidden>👋</span>
        </h2>
        <p className="text-muted-foreground mt-1 text-sm lg:text-base">{message}</p>
      </div>
    </div>
  );
});
