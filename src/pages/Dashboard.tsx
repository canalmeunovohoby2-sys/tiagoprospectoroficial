import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Users, Star, Phone, Send, TrendingUp, Search as SearchIcon, ArrowUpRight, Trash2 } from "lucide-react";
import { ParticleNetwork } from "@/components/app/ParticleNetwork";
import { WelcomeBanner } from "@/components/app/WelcomeBanner";
import { AnalyticsCards } from "@/components/app/AnalyticsCards";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useOptionalSidebar } from "@/components/ui/sidebar";

interface Stats {
  total: number;
  favorites: number;
  contacted: number;
  proposals: number;
  clients: number;
}

interface RecentSearch { id: string; state: string; city: string; segment: string; results_count: number; created_at: string }
interface RecentLead { id: string; name: string; city: string | null; segment: string | null; updated_at: string }

type MetricKey = "total" | "favorites" | "contacted" | "proposals" | "conversion";
const OFFSETS_KEY = "dashboard.metric.offsets.v1";

function loadOffsets(): Record<MetricKey, number> {
  try {
    const raw = localStorage.getItem(OFFSETS_KEY);
    if (raw) return { total: 0, favorites: 0, contacted: 0, proposals: 0, conversion: 0, ...JSON.parse(raw) };
  } catch {/* ignore */}
  return { total: 0, favorites: 0, contacted: 0, proposals: 0, conversion: 0 };
}

function Dashboard() {
  const { user } = useAuth();
  const sidebarCompact = useOptionalSidebar().isCollapsed;
  const [stats, setStats] = useState<Stats>({ total: 0, favorites: 0, contacted: 0, proposals: 0, clients: 0 });
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [recentContacts, setRecentContacts] = useState<RecentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [offsets, setOffsets] = useState<Record<MetricKey, number>>(() => loadOffsets());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: total }, { count: favorites }, { count: contacted }, { count: proposals }, { count: clients }] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("is_favorite", true),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("is_contacted", true),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("crm_status", "proposal"),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("crm_status", "client"),
      ]);

      const { data: searches } = await supabase
        .from("searches").select("*").order("created_at", { ascending: false }).limit(5);
      const { data: contacts } = await supabase
        .from("leads").select("id, name, city, segment, updated_at")
        .eq("is_contacted", true).order("updated_at", { ascending: false }).limit(5);

      setStats({
        total: total ?? 0,
        favorites: favorites ?? 0,
        contacted: contacted ?? 0,
        proposals: proposals ?? 0,
        clients: clients ?? 0,
      });
      setRecentSearches((searches as RecentSearch[]) ?? []);
      setRecentContacts((contacts as RecentLead[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const rawTotal = stats.total;
  const rawFavorites = stats.favorites;
  const rawContacted = stats.contacted;
  const rawProposals = stats.proposals;
  const rawConversion = stats.total > 0 ? (stats.clients / stats.total) * 100 : 0;

  const displayedTotal = Math.max(0, rawTotal - offsets.total);
  const displayedFavorites = Math.max(0, rawFavorites - offsets.favorites);
  const displayedContacted = Math.max(0, rawContacted - offsets.contacted);
  const displayedProposals = Math.max(0, rawProposals - offsets.proposals);
  const displayedConversion = Math.max(0, rawConversion - offsets.conversion);

  const resetMetric = useCallback((key: MetricKey, label: string) => {
    const current = { total: rawTotal, favorites: rawFavorites, contacted: rawContacted, proposals: rawProposals, conversion: rawConversion }[key];
    const next = { ...offsets, [key]: current };
    setOffsets(next);
    try { localStorage.setItem(OFFSETS_KEY, JSON.stringify(next)); } catch {/* ignore */}
    toast.success(`${label} zerada com sucesso.`);
  }, [offsets, rawContacted, rawConversion, rawFavorites, rawProposals, rawTotal]);

  const cards: { key: MetricKey; label: string; value: number | string; icon: typeof Users; accent: string }[] = useMemo(() => [
    { key: "total", label: "Leads encontrados", value: displayedTotal, icon: Users, accent: "from-violet-500/20 to-violet-500/0" },
    { key: "favorites", label: "Favoritados", value: displayedFavorites, icon: Star, accent: "from-amber-500/20 to-amber-500/0" },
    { key: "contacted", label: "Contatos realizados", value: displayedContacted, icon: Phone, accent: "from-blue-500/20 to-blue-500/0" },
    { key: "proposals", label: "Propostas enviadas", value: displayedProposals, icon: Send, accent: "from-pink-500/20 to-pink-500/0" },
    { key: "conversion", label: "Conversão", value: `${displayedConversion.toFixed(1)}%`, icon: TrendingUp, accent: "from-emerald-500/20 to-emerald-500/0" },
  ], [displayedContacted, displayedConversion, displayedFavorites, displayedProposals, displayedTotal]);

  return (
    <>
      <ParticleNetwork />
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 relative z-10">
      <WelcomeBanner />
      <div className="flex items-start justify-between gap-4 flex-wrap animate-fade-in">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral da sua prospecção</p>
        </div>
        <Button asChild className="bg-gradient-primary hover:opacity-95 shadow-elegant hover-glow text-primary-foreground font-semibold">
          <Link to="/search"><SearchIcon className="h-4 w-4 mr-2" /> Nova pesquisa</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c, i) => (
          <div key={c.label} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <Card className={`p-5 relative overflow-hidden glass glass-hover bg-gradient-to-br ${c.accent}`}>
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 rounded-lg bg-background/60 border border-border/50 flex items-center justify-center">
                  <c.icon className="h-4 w-4 text-foreground" />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Zerar ${c.label}`}
                      title="Zerar"
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 border border-transparent hover:border-border/60 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      {!sidebarCompact && "Zerar"}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Tem certeza que deseja zerar este indicador?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Apenas a métrica "{c.label}" do dashboard será zerada. Nenhum lead, favorito, mensagem ou
                        dado do CRM será apagado — somente o contador visual é reiniciado.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => resetMetric(c.key, c.label)}>
                        Sim, zerar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-display font-bold tracking-tight">
                  {loading ? "—" : c.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      <AnalyticsCards />



      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 glass glass-hover">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold">Últimas pesquisas</h2>
            <Link to="/history" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver tudo <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentSearches.length === 0 ? (
            <EmptyHint text="Nenhuma pesquisa ainda — crie a primeira." cta="Pesquisar leads" to="/search" />
          ) : (
            <ul className="divide-y divide-border">
              {recentSearches.map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{s.segment} · {s.city}/{s.state}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground">{s.results_count} leads</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6 glass glass-hover">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold">Últimos contatos</h2>
            <Link to="/leads" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver tudo <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentContacts.length === 0 ? (
            <EmptyHint text="Nenhum contato registrado ainda." cta="Ver meus leads" to="/leads" />
          ) : (
            <ul className="divide-y divide-border">
              {recentContacts.map((l) => (
                <li key={l.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.segment} · {l.city}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(l.updated_at).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
    </>
  );
}

const EmptyHint = memo(function EmptyHint({ text, cta, to }: { text: string; cta: string; to: string }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-muted-foreground mb-3">{text}</p>
      <Button asChild variant="outline" size="sm"><Link to={to}>{cta}</Link></Button>
    </div>
  );
});

export default memo(Dashboard);
