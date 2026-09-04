import { memo, useEffect, useMemo, useState } from "react";
import { TrendingUp, MessageCircle, Target, DollarSign, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calculateLeadROI } from "@/lib/leadROI";
import type { Lead } from "@/data/types";

interface Stats {
  highRoi: number;
  waResponseRate: number;
  topNiche: { name: string; rate: number } | null;
  avgTicket: number;
}

const TICKET_MIN = 997;
const TICKET_MAX = 1497;
const AVG_TICKET = Math.round((TICKET_MIN + TICKET_MAX) / 2);

function AnalyticsCardsBase() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ highRoi: 0, waResponseRate: 0, topNiche: null, avgTicket: 0 });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .limit(2000);
      if (cancelled) return;
      if (error || !Array.isArray(data)) { setLoading(false); return; }
      const leads = data as unknown as Lead[];

      const highRoi = leads.reduce((acc, l) => acc + (calculateLeadROI(l).tier === "high" ? 1 : 0), 0);

      const contactedWa = leads.filter((l) => l.is_contacted && l.whatsapp).length;
      const respondedWa = leads.filter((l) => l.whatsapp && (l.crm_status === "negotiation" || l.crm_status === "proposal" || l.crm_status === "client")).length;
      const waResponseRate = contactedWa > 0 ? Math.round((respondedWa / contactedWa) * 100) : 0;

      const buckets: Record<string, { total: number; clients: number }> = {};
      for (const l of leads) {
        const key = (l.segment || l.category || "Outros").toString();
        if (!buckets[key]) buckets[key] = { total: 0, clients: 0 };
        buckets[key].total += 1;
        if (l.crm_status === "client") buckets[key].clients += 1;
      }
      let topNiche: Stats["topNiche"] = null;
      for (const [name, b] of Object.entries(buckets)) {
        if (b.total < 1) continue;
        const rate = Math.round((b.clients / b.total) * 100);
        if (!topNiche || rate > topNiche.rate) topNiche = { name, rate };
      }

      const clientsCount = leads.filter((l) => l.crm_status === "client").length;
      const avgTicket = clientsCount > 0 ? AVG_TICKET : 0;

      setStats({ highRoi, waResponseRate, topNiche, avgTicket });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const cards = useMemo(
    () => [
      {
        label: "Leads com alto ROI",
        value: loading ? "—" : String(stats.highRoi),
        icon: TrendingUp,
        accent: "from-emerald-500/20 to-emerald-500/0",
        hint: "🟢 Alto potencial (ROI ≥ 70)",
      },
      {
        label: "Taxa de resposta WhatsApp",
        value: loading ? "—" : `${stats.waResponseRate}%`,
        icon: MessageCircle,
        accent: "from-blue-500/20 to-blue-500/0",
        hint: "Contatados que avançaram no CRM",
      },
      {
        label: "Conversão por nicho",
        value: loading ? "—" : (stats.topNiche ? `${stats.topNiche.rate}%` : "—"),
        icon: Target,
        accent: "from-violet-500/20 to-violet-500/0",
        hint: stats.topNiche ? `Top: ${stats.topNiche.name}` : "Sem dados ainda",
      },
      {
        label: "Ticket médio fechado",
        value: loading ? "—" : (stats.avgTicket > 0 ? `R$ ${stats.avgTicket.toLocaleString("pt-BR")}` : "—"),
        icon: DollarSign,
        accent: "from-amber-500/20 to-amber-500/0",
        hint: "Estimado pelo plano sugerido",
      },
    ],
    [loading, stats],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-semibold">Indicadores analíticos</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className={`p-5 relative overflow-hidden glass glass-hover bg-gradient-to-br ${c.accent}`}>
            <div className="h-9 w-9 rounded-lg bg-background/60 border border-border/50 flex items-center justify-center">
              <c.icon className="h-4 w-4 text-foreground" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-display font-bold tracking-tight">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
              <div className="text-[10px] text-muted-foreground/80 mt-1">{c.hint}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const AnalyticsCards = memo(AnalyticsCardsBase);
