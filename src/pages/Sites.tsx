import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Loader2, Sparkles, Wand2, Palette, MessageSquareText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { SiteProjectRow } from "@/data/siteProjects";
import { listSiteProjects, deleteSiteProject, createSiteProjectFromPrompt, saveProjectThumbnail } from "@/lib/siteProjectsApi";
import { createBrandingProject as createBrand } from "@/lib/brandingApi";
import { PromptCreator } from "@/components/app/PromptCreator";
import { StudioProjectCard } from "@/components/sites/StudioProjectCard";
import { captureSiteThumbnail, hashProjectFiles, thumbnailSettings, thumbnailState } from "@/lib/siteThumbnails";

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
  // Modo do Studio: gerar site (fluxo existente) OU criar prompt premium.
  const [mode, setMode] = useState<"generate" | "prompt">("generate");

  // ── Galeria: thumbnails REAIS do site (primeira dobra) ─────────────────────
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbBusy, setThumbBusy] = useState<Record<string, boolean>>({});
  const projectsRef = useRef<SiteProjectRow[]>([]);
  const queueRef = useRef<string[]>([]);
  const queuedRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  projectsRef.current = projects;

  /** Arquivos reais do projeto (quando há um site de verdade). */
  const codeOf = (p: SiteProjectRow): Record<string, string> | null => {
    const code = p.generated_code && typeof p.generated_code === "object" ? (p.generated_code as Record<string, unknown>) : null;
    if (!code) return null;
    const files = Object.fromEntries(Object.entries(code).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    return Object.keys(files).some((k) => k.endsWith("index.html")) ? files : null;
  };

  const thumbInfo = useMemo(() => {
    const map: Record<string, { files: Record<string, string> | null; state: ReturnType<typeof thumbnailState> }> = {};
    for (const p of projects) {
      const files = codeOf(p);
      map[p.id] = { files, state: thumbnailState(p, files) };
    }
    return map;
  }, [projects]);

  // Fila SEQUENCIAL: uma captura por vez (nada de abrir vários navegadores juntos).
  async function runThumbQueue() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()!;
        queuedRef.current.delete(id);
        const p = projectsRef.current.find((x) => x.id === id);
        const files = p ? codeOf(p) : null;
        if (!p || !files) continue;
        const st = thumbnailSettings(p);
        if (st.thumbnail && st.thumbnailSig && st.thumbnailSig === st.codeSig) continue; // já atualizado
        const sig = hashProjectFiles(files);
        setThumbBusy((b) => ({ ...b, [id]: true }));
        const thumb = await captureSiteThumbnail(files);
        setThumbBusy((b) => { const n = { ...b }; delete n[id]; return n; });
        if (thumb) {
          setThumbs((t) => ({ ...t, [id]: thumb }));
          void saveProjectThumbnail(id, thumb, sig).catch(() => { /* best-effort */ });
        }
      }
    } finally {
      runningRef.current = false;
    }
  }

  function enqueueThumb(id: string, force = false) {
    if (queuedRef.current.has(id) && !force) return;
    queuedRef.current.add(id);
    queueRef.current.push(id);
    void runThumbQueue();
  }

  const thumbOf = (p: SiteProjectRow) => thumbs[p.id] ?? thumbnailSettings(p).thumbnail ?? null;

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
      // Fluxo ÚNICO de criação: todo novo projeto nasce React (Studio/WebContainer).
      const id = await createSiteProjectFromPrompt(user.id, p, "react");
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setMode("generate")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${mode === "generate" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Gerar Site
            </button>
            <button
              type="button"
              onClick={() => setMode("prompt")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1 ${mode === "prompt" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              <MessageSquareText className="h-3.5 w-3.5" /> Criar Prompt
            </button>
          </div>
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

      {mode === "prompt" && (
        <PromptCreator
          onUseInGenerator={(p) => {
            setPrompt(p);
            setMode("generate");
            setOpenCreate(true);
          }}
        />
      )}

      {mode === "generate" && (loading ? (
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
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const info = thumbInfo[p.id];
            return (
              <StudioProjectCard
                key={p.id}
                project={p}
                thumbnail={thumbOf(p)}
                busy={!!thumbBusy[p.id]}
                unavailable={!info?.files || info?.state === "unavailable"}
                onOpen={() => navigate(`/sites/${p.id}`)}
                onDelete={() => handleDelete(p)}
                onGenerate={() => enqueueThumb(p.id, true)}
                onVisible={() => { if (info?.files && info.state !== "unavailable") enqueueThumb(p.id); }}
              />
            );
          })}
        </div>
      ))}

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
