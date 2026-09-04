import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Globe, Plus, Loader2, Trash2, ArrowRight, Search as SearchIcon, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Lead } from "@/data/types";
import type { SiteProjectRow } from "@/data/siteProjects";
import { statusLabel } from "@/data/siteProjects";
import { listSiteProjects, deleteSiteProject, openOrCreateSiteProject } from "@/lib/siteProjectsApi";

export default function Sites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SiteProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadQuery, setLeadQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      setProjects(await listSiteProjects(user.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar projetos");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function loadLeads() {
    if (!user) return;
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,segment,category,city,state,address,phone,whatsapp,website,instagram,facebook,rating,reviews_count,has_website,opening_hours,score_reasons")
      .order("score", { ascending: false })
      .limit(200);
    if (error) { toast.error(error.message); return; }
    if (Array.isArray(data)) setLeads(data as Lead[]);
  }

  async function handleCreate(lead: Lead) {
    if (!user) return;
    setCreating(lead.id);
    try {
      const id = await openOrCreateSiteProject(user.id, lead);
      setOpenCreate(false);
      setLeadQuery("");
      navigate(`/sites/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar projeto");
    } finally {
      setCreating(null);
    }
  }

  async function handleDelete(p: SiteProjectRow) {
    if (!window.confirm(`Excluir o projeto "${p.name}"?`)) return;
    try {
      await deleteSiteProject(p.id);
      toast.success("Projeto excluído");
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      (l.name ?? "").toLowerCase().includes(q) ||
      (l.city ?? "").toLowerCase().includes(q) ||
      (l.segment ?? l.category ?? "").toLowerCase().includes(q),
    );
  }, [leads, leadQuery]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" /> Sites
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Projetos de site criados para os seus leads. Cada projeto guarda identidade, conteúdo e estrutura prontos para edição e publicação futura.
          </p>
        </div>
        <Button onClick={() => { setLeadQuery(""); loadLeads(); setOpenCreate(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Criar site
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando projetos…
        </div>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-border/60 bg-gradient-to-br from-card to-card/40">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display font-semibold text-lg">Nenhum site criado ainda</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Escolha um lead e gere o primeiro projeto de site: a IA analisa o negócio e cria a especificação visual e de conteúdo.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => { setLeadQuery(""); loadLeads(); setOpenCreate(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Criar site
            </Button>
            <Button variant="outline" onClick={() => navigate("/leads")}>
              Ver leads <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="p-5 space-y-3 hover:border-primary/40 transition-colors cursor-pointer" onClick={() => navigate(`/sites/${p.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold truncate">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {p.company_name || "—"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {statusLabel(p.status)}
                </Badge>
              </div>
              {(p.segment || p.city) && (
                <p className="text-xs text-muted-foreground">
                  {[p.segment, p.city && p.state ? `${p.city}/${p.state}` : p.city].filter(Boolean).join(" · ")}
                </p>
              )}
              {p.lead_id && <p className="text-[10px] text-muted-foreground/70">Lead vinculado · {p.lead_id.slice(0, 8)}</p>}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 flex-1" onClick={(e) => { e.stopPropagation(); navigate(`/sites/${p.id}`); }}>
                  Abrir <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Excluir projeto" onClick={(e) => { e.stopPropagation(); handleDelete(p); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {openCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !creating && setOpenCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-display font-semibold text-lg">Criar site para um lead</h2>
              <p className="text-sm text-muted-foreground">Escolha o lead. O projeto é criado como rascunho e abre para gerar a especificação com IA.</p>
            </div>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar por nome, cidade ou segmento…"
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1">
              {filteredLeads.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lead encontrado. Crie leads na busca primeiro.</p>
              )}
              {filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  disabled={creating === lead.id}
                  onClick={() => handleCreate(lead)}
                  className="w-full text-left rounded-xl border border-border/60 p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{lead.name}</span>
                    {creating === lead.id && <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {[lead.segment || lead.category, lead.city && lead.state ? `${lead.city}/${lead.state}` : lead.city].filter(Boolean).join(" · ") || "Sem dados"}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpenCreate(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
