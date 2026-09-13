import { memo, useEffect, useMemo, useState } from "react";
import { Phone, MessageCircle, Globe2, Search as SearchIcon, Globe, Briefcase, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ============================================================================
// INDICADORES REAIS — apenas contagens exatas com fonte rastreável.
// Cada número vem de uma contagem EXATA no Supabase (tabela indicada). Sem
// estimativas, sem valores fixos, sem projeções comerciais. Sem registros = 0.
// ============================================================================
interface RealStats {
  leads: number;
  phone: number;
  whatsapp: number;
  semSite: number;
  searches: number;
  projects: number;
  services: number;
}

export const REAL_METRIC_KEYS = ["phone", "whatsapp", "semSite", "searches", "projects", "services"] as const;

function AnalyticsCardsBase() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RealStats>({ leads: 0, phone: 0, whatsapp: 0, semSite: 0, searches: 0, projects: 0, services: 0 });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [leads, phone, whatsapp, withSite, searches, projects, services] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).not("phone", "is", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).not("whatsapp", "is", null),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("has_website", true),
        supabase.from("searches").select("*", { count: "exact", head: true }),
        supabase.from("site_projects").select("*", { count: "exact", head: true }),
        supabase.from("services").select("*", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      const total = leads.count ?? 0;
      const comSite = withSite.count ?? 0;
      setStats({
        leads: total,
        phone: phone.count ?? 0,
        whatsapp: whatsapp.count ?? 0,
        semSite: Math.max(0, total - comSite),
        searches: searches.count ?? 0,
        projects: projects.count ?? 0,
        services: services.count ?? 0,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const cards = useMemo(
    () => [
      { label: "Leads com telefone", value: stats.phone, hint: "leads.phone", icon: Phone, accent: "from-blue-500/20 to-blue-500/0" },
      { label: "Leads com WhatsApp", value: stats.whatsapp, hint: "leads.whatsapp", icon: MessageCircle, accent: "from-emerald-500/20 to-emerald-500/0" },
      { label: "Leads sem site", value: stats.semSite, hint: "leads totais − has_website", icon: Globe2, accent: "from-amber-500/20 to-amber-500/0" },
      { label: "Pesquisas realizadas", value: stats.searches, hint: "searches", icon: SearchIcon, accent: "from-violet-500/20 to-violet-500/0" },
      { label: "Sites criados", value: stats.projects, hint: "site_projects", icon: Globe, accent: "from-sky-500/20 to-sky-500/0" },
      { label: "Serviços cadastrados", value: stats.services, hint: "services", icon: Briefcase, accent: "from-pink-500/20 to-pink-500/0" },
    ],
    [stats],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-semibold">Dados reais da sua operação</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className={`p-5 relative overflow-hidden glass glass-hover bg-gradient-to-br ${c.accent}`}>
            <div className="h-9 w-9 rounded-lg bg-background/60 border border-border/50 flex items-center justify-center">
              <c.icon className="h-4 w-4 text-foreground" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-display font-bold tracking-tight">{loading ? "—" : c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{c.hint}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const AnalyticsCards = memo(AnalyticsCardsBase);
