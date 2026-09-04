import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, Loader2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Search } from "@/data/types";

export default function History() {
  const { user } = useAuth();
  const [items, setItems] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase.from("searches").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as any as Search[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function remove(id: string) {
    if (!confirm("Excluir esta pesquisa? Os leads gerados serão mantidos.")) return;
    const { error } = await supabase.from("searches").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((xs) => xs.filter((x) => x.id !== id));
    toast.success("Pesquisa removida");
  }

  async function exportCsv(s: Search) {
    const { data } = await supabase.from("leads").select("*").eq("search_id", s.id);
    if (!data?.length) return toast.error("Sem leads para exportar");
    const cols = ["name", "segment", "city", "state", "phone", "whatsapp", "website", "score", "has_website", "rating", "reviews_count"];
    const csv = [
      cols.join(","),
      ...data.map((r: any) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${s.segment}-${s.city}-${s.state}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-bold tracking-tight">Histórico</h1>
        <p className="text-muted-foreground mt-1">Suas pesquisas anteriores, com filtros e quantidade de resultados.</p>
      </motion.div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando…</div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <p className="text-muted-foreground mb-3">Você ainda não fez nenhuma pesquisa.</p>
          <Button asChild><Link to="/search">Fazer primeira pesquisa</Link></Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((s) => (
            <Card key={s.id} className="p-4 border-border/50 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {s.segment} <span className="text-muted-foreground">·</span>
                  <span className="flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5" />{s.city}/{s.state}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(s.created_at).toLocaleString("pt-BR")} · {s.results_count} leads
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild><Link to={`/leads?search=${s.id}`}>Ver leads</Link></Button>
                <Button size="sm" variant="outline" onClick={() => exportCsv(s)}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
