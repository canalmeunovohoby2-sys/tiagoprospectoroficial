import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, ArrowRight, Sparkles, Wand2, Palette,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { SiteProjectRow } from "@/data/siteProjects";
import { statusLabel } from "@/data/siteProjects";
import { listSiteProjects, deleteSiteProject, createSiteProjectFromPrompt } from "@/lib/siteProjectsApi";
import { createBrandingProject as createBrand } from "@/lib/brandingApi";

const CREATE_EXAMPLE = 'Crie um site profissional para uma clínica de fisioterapia chamada Movimento Saúde, com aparência moderna, premium e responsiva.';

// OCULTO (não removido): oculta a criação de identidade visual na UI.
// O código/botão/diálogo continuam existindo (não removemos a funcionalidade),
// apenas não são renderizados. Para reexibir, troque para `false`.
const HIDE_IDENTITY_CREATION = true;

export default function Sites() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<SiteProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openBrand, setOpenBrand] = useState(false);
  const [brandPrompt, setBrandPrompt] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function handleCreateSite() {
    if (!user) return;
    const p = prompt.trim();
    if (!p) { toast.error("Descreva o site que você quer criar."); return; }
    setCreating(true);
    try {
      const id = await createSiteProjectFromPrompt(user.id, p);
      setOpenCreate(false);
      setPrompt("");
      navigate(`/sites/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar projeto");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateIdentity() {
    if (!user) return;
    const p = (brandPrompt || prompt).trim();
    if (!p) { toast.error("Descreva a identidade que você quer criar."); return; }
    setCreatingBrand(true);
    try {
      const id = await createBrand(user.id, p);
      setOpenBrand(false);
      setBrandPrompt("");
      navigate(`/branding/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar projeto de identidade");
    } finally {
      setCreatingBrand(false);
    }
  }

  async function handleDelete(p: SiteProjectRow) {    if (!window.confirm(`Excluir o projeto "${p.name}"?`)) return;
    try {
      await deleteSiteProject(p.id);
      toast.success("Projeto excluído");
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie e gerencie seus projetos de site e identidade visual. Cada projeto guarda identidade, conteúdo e estrutura prontos para edição e publicação futura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!HIDE_IDENTITY_CREATION && (
            <Button variant="outline" onClick={() => { setBrandPrompt(""); setOpenBrand(true); }}>
              <Palette className="h-4 w-4 mr-1" /> Criar Identidade
            </Button>
          )}
          <Button onClick={() => { setPrompt(""); setOpenCreate(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Criar site
          </Button>
        </div>
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
          <h2 className="font-display font-semibold text-lg">Nenhum projeto criado ainda</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Descreva o site ou a identidade visual que deseja criar: o agente analisa a solicitação, trabalha no workspace do projeto e gera o projeto. Crie um site ou uma identidade acima.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => { setPrompt(""); setOpenCreate(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Criar site
            </Button>
            {!HIDE_IDENTITY_CREATION && (
              <Button variant="outline" onClick={() => { setBrandPrompt(""); setOpenBrand(true); }}>
                <Palette className="h-4 w-4 mr-1" /> Criar Identidade
              </Button>
            )}
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

      {openBrand && !HIDE_IDENTITY_CREATION && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !creatingBrand && setOpenBrand(false)}>
          <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-display font-semibold text-lg flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> Criar Identidade Visual</h2>
              <p className="text-sm text-muted-foreground">Descreva a marca/identidade. O agente de branding gera conceitos, SVGs reais e variações. Você continua conversando para refinar.</p>
            </div>
            <div>
              <Textarea autoFocus rows={5} placeholder="Ex.: Crie uma identidade visual premium para uma clínica de fisioterapia esportiva chamada Movimento." value={brandPrompt} onChange={(e) => setBrandPrompt(e.target.value)} className="min-h-[120px] text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={creatingBrand} onClick={() => setOpenBrand(false)}>Cancelar</Button>
              <Button size="sm" disabled={creatingBrand || !brandPrompt.trim()} onClick={() => void handleCreateIdentity()}>
                {creatingBrand ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Palette className="h-4 w-4 mr-1" />} Criar Identidade
              </Button>
            </div>
          </div>
        </div>
      )}

      {openCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !creating && setOpenCreate(false)}>
          <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-display font-semibold text-lg">Criar novo site</h2>
              <p className="text-sm text-muted-foreground">Descreva o que você quer criar. O agente analisa a solicitação e constrói o projeto no workspace.</p>
            </div>
            <div>
              <Textarea
                autoFocus
                rows={6}
                placeholder={CREATE_EXAMPLE}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[160px] resize-y text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Exemplo: “{CREATE_EXAMPLE}”</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={creating} onClick={() => setOpenCreate(false)}>Cancelar</Button>
              <Button size="sm" disabled={creating || !prompt.trim()} onClick={() => void handleCreateSite()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                Criar site
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
