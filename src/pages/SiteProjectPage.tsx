import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Loader2, Sparkles, AlertTriangle, Palette, Type, LayoutTemplate, Pencil, Save, X, CircleDot, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { SiteProjectRow, SiteSpec } from "@/data/siteProjects";
import { normalizeSpec, statusLabel, safeArr, contentBlock, applyAiProtections, specsEqual } from "@/data/siteProjects";
import {
  fetchSiteProject, generateSiteSpec, saveGeneratedSite, updateProjectSpec, editSiteWithAI,
} from "@/lib/siteProjectsApi";
import { SitePreview } from "@/components/sites/SitePreview";
import { SiteEditor } from "@/components/sites/editor/SiteEditor";
import { supabase } from "@/integrations/supabase/client";

export default function SiteProjectPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<SiteProjectRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draftSpec, setDraftSpec] = useState<SiteSpec>(normalizeSpec(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProposed, setAiProposed] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState<SiteSpec | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await fetchSiteProject(id);
      if (!p || (user && p.user_id !== user.id)) {
        setNotFound(true);
      } else {
        setProject(p);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar projeto");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, user]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function generate() {
    if (!project) return;
    setGenerating(true);
    setGenError(null);
    try {
      const briefing = (project.briefing ?? {}) as Record<string, unknown>;
      const { spec, model } = await generateSiteSpec(briefing);
      await saveGeneratedSite(project.id, spec, model);
      toast.success("Especificação gerada e salva");
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro ao gerar especificação";
      setGenError(message);
      toast.error(message);
      try {
        await supabase.from("site_projects").update({ status: "error" }).eq("id", project.id);
        await load();
      } catch { /* mantém estado atual */ }
    } finally {
      setGenerating(false);
    }
  }

  function startEditing() {
    if (!project) return;
    setDraftSpec(normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null));
    setDirty(false);
    setAiProposed(false);
    setAiError(null);
    setAiSnapshot(null);
    setEditMode(true);
  }

  function handleDraftChange(next: SiteSpec) {
    setDraftSpec(next);
    setDirty(true);
  }

  async function applyAiInstruction(instruction: string) {
    if (!project) return;
    const snapshot = draftSpec;
    setAiRunning(true);
    setAiError(null);
    try {
      const ctx = {
        name: project.company_name || project.name,
        segment: project.segment,
        city: project.city,
        state: project.state,
      };
      const res = await editSiteWithAI(draftSpec, instruction, ctx);
      if (!res.changed) {
        setAiError("A IA não encontrou mudanças necessárias para essa instrução.");
        return;
      }
      const protectedSpec = applyAiProtections(draftSpec, res.spec, instruction);
      if (specsEqual(draftSpec, protectedSpec)) {
        setAiError("A IA não alterou nada relevante (dados factuais protegidos foram mantidos).");
        return;
      }
      setAiSnapshot(snapshot);
      setDraftSpec(protectedSpec);
      setDirty(true);
      setAiProposed(true);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Não foi possível aplicar a alteração. Sua spec atual foi preservada.");
    } finally {
      setAiRunning(false);
    }
  }

  function revertAi() {
    const savedSpec = project ? normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null) : null;
    if (aiSnapshot) setDraftSpec(aiSnapshot);
    setAiProposed(false);
    setAiError(null);
    setAiSnapshot(null);
    setDirty(aiSnapshot ? !specsEqual(aiSnapshot, savedSpec) : dirty);
  }

  function exitEditing() {
    if (dirty && !window.confirm("Há alterações não salvas. Descartar e sair do editor?")) return;
    setEditMode(false);
    setDirty(false);
    setAiProposed(false);
    setAiError(null);
    setAiSnapshot(null);
  }

  async function saveEdits() {
    if (!project) return;
    setSaving(true);
    try {
      await updateProjectSpec(project.id, draftSpec);
      toast.success("Alterações salvas");
      setDirty(false);
      await load();
      if (project.id) {
        const fresh = await fetchSiteProject(project.id);
        if (fresh?.spec) setDraftSpec(normalizeSpec(fresh.spec as SiteSpec | Record<string, unknown> | null));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando projeto…
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">Projeto não encontrado.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/sites")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para Sites
          </Button>
        </Card>
      </div>
    );
  }

  const spec: SiteSpec = normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null);
  const colors = spec.design_system?.colors ?? {};
  const sections = spec.sections ?? [];
  const nav = spec.navigation ?? [];
  const ctas = spec.calls_to_action ?? [];
  const colorEntries = Object.entries(colors).filter(([, v]) => typeof v === "string" && v.startsWith("#"));
  const hasSpec = !!project.spec && Object.keys(project.spec as object).length > 0;

  return (
    <div className={editMode ? "p-4 lg:p-6" : "p-6 lg:p-8 max-w-7xl mx-auto space-y-6"}>
      <div>
        <Link to="/sites" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-3 w-3" /> Sites
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <Globe className="h-6 w-6 text-primary" /> {project.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {project.company_name || project.name}
              {[project.segment, project.city && project.state ? `${project.city}/${project.state}` : project.city].filter(Boolean).length > 0 && (
                <> · {[project.segment, project.city && project.state ? `${project.city}/${project.state}` : project.city].filter(Boolean).join(" · ")}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{statusLabel(project.status)}</Badge>
            {editMode ? (
              <>
                <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${dirty ? "border-amber-400/50 text-amber-500 bg-amber-500/10" : "border-border/60 text-muted-foreground"}`}>
                  <CircleDot className={`h-3 w-3 ${dirty ? "animate-pulse" : ""}`} />
                  {dirty ? "Alterações não salvas" : "Tudo salvo"}
                </span>
                <Button variant="outline" size="sm" onClick={exitEditing} disabled={saving}>
                  <X className="h-3.5 w-3.5 mr-1" /> Sair do editor
                </Button>
                <Button size="sm" onClick={saveEdits} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />} Salvar
                </Button>
              </>
            ) : (
              <>
                {hasSpec && (
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar site
                  </Button>
                )}
                <Button onClick={generate} disabled={generating} size="sm">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {hasSpec ? "Regenerar com IA" : "Gerar site com IA"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {project.status === "error" && !editMode && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-600">A última geração falhou.</p>
            <p className="text-muted-foreground text-xs mt-1">
              {genError ? genError : "Falha temporária do provedor de IA ou tempo de resposta excedido. Clique em “Gerar site com IA” para tentar novamente."}
            </p>
          </div>
        </Card>
      )}

      {!hasSpec ? (
        <Card className="p-12 text-center border-dashed border-border/60 bg-gradient-to-br from-card to-card/40">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display font-semibold text-lg">Projeto em rascunho</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Clique em <strong>Gerar site com IA</strong> para analisar o negócio e criar a especificação estruturada (design, conteúdo, seções e SEO) deste projeto.
          </p>
        </Card>
      ) : editMode ? (
        <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
          <div className="lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto pr-1 -mr-1">
            <div className="lg:sticky lg:top-0 space-y-2.5">
              <SiteEditor
                spec={draftSpec}
                onChange={handleDraftChange}
                aiPanel={{
                  running: aiRunning,
                  error: aiError,
                  proposed: aiProposed,
                  onApply: applyAiInstruction,
                  onRevert: revertAi,
                }}
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Preview ao vivo
              </h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Alterações aparecem imediatamente</span>
            </div>
            <SitePreview spec={draftSpec as SiteSpec | Record<string, unknown> | null} />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4 space-y-4 lg:col-span-2">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <h2 className="font-display font-semibold">Identidade visual</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {colorEntries.map(([name, hex]) => (
                  <div key={name} className="rounded-lg border border-border/60 p-2">
                    <div className="h-8 rounded-md border border-black/10 mb-1.5" style={{ backgroundColor: hex }} />
                    <p className="text-[10px] text-muted-foreground truncate">{name}</p>
                    <p className="font-mono text-[10px] uppercase">{hex}</p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 p-3 flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Títulos</p>
                    <p className="font-medium">{spec.design_system?.typography?.heading_font || "—"}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 p-3 flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Texto</p>
                    <p className="font-medium">{spec.design_system?.typography?.body_font || "—"}</p>
                  </div>
                </div>
              </div>
              {(spec.design_system?.visual_style || spec.design_system?.layout_mood) && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">Estilo:</span> {spec.design_system?.visual_style}
                  {spec.design_system?.layout_mood ? ` · mood ${spec.design_system.layout_mood}` : ""}
                </p>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h2 className="font-display font-semibold">Estrutura</h2>
              </div>
              <div className="text-xs space-y-1.5 text-muted-foreground">
                <p><span className="text-foreground font-medium">{sections.length}</span> seções · <span className="text-foreground font-medium">{nav.length}</span> itens de navegação · <span className="text-foreground font-medium">{safeArr(contentBlock(spec, "services").items).length}</span> serviços sugeridos</p>
                <p className="flex flex-wrap gap-1 pt-1">
                  {sections.slice(0, 10).map((s) => (
                    <Badge key={s.id} variant="outline" className="text-[10px]">{s.type}</Badge>
                  ))}
                </p>
                {ctas.length > 0 && (
                  <p className="pt-1"><span className="text-foreground font-medium">CTAs:</span> {ctas.map((c) => `${c.label} (${c.type})`).join(" · ")}</p>
                )}
                {spec.seo?.title && (
                  <p className="pt-1"><span className="text-foreground font-medium">SEO:</span> {spec.seo.title}</p>
                )}
              </div>
            </Card>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-semibold">Preview</h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Conteúdo editável — publicação virá em fases futuras</span>
            </div>
            <SitePreview spec={project.spec as SiteSpec | Record<string, unknown> | null} />
          </div>
        </>
      )}
    </div>
  );
}
