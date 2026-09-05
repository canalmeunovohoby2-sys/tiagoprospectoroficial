import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Loader2, Sparkles, AlertTriangle, Palette, Type, LayoutTemplate, Pencil, Save, X, CircleDot, Eye, FileText, FolderDown, Rocket, Copy, ExternalLink, History as HistoryIcon, Code2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { SiteProjectRow, SiteSpec } from "@/data/siteProjects";
import { normalizeSpec, statusLabel, safeArr, contentBlock, applyAiProtections, specsEqual } from "@/data/siteProjects";
import {
  fetchSiteProject, generateSiteSpec, saveGeneratedSite, updateProjectSpec, editSiteWithAI,
  loadSiteChatMessages, appendSiteChatMessages, publishSiteProject, unpublishSiteProject,
  createSiteVersion, invokeAgentExecute, invokeProspectorAgent, invokeProspectorGenerate,
} from "@/lib/siteProjectsApi";
import { SitePreview } from "@/components/sites/SitePreview";
import { SiteChat } from "@/components/sites/editor/SiteChat";
import { SiteVersionsDialog } from "@/components/sites/editor/SiteVersionsDialog";
import { supabase } from "@/integrations/supabase/client";
import { exportProjectZip, saveBlob, fetchImageAsDataUrl } from "@/lib/siteDownload";
import { buildCommercialPdf, pdfFileName } from "@/lib/sitePdf";
import { buildConversationContext, buildDesignMemory } from "@/lib/aiEditContext";
import { materializeProjectFiles, GENERATION_STEPS, EDIT_STEPS, type AgentProgress } from "@/lib/agentProject";
import { LiveProjectPreview } from "@/components/sites/LiveProjectPreview";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  image?: string; // dataURL exibido apenas na sessão (sem storage nesta fase)
  fileLabel?: string;
}

function friendlyAiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Erro ao aplicar alteração.";
  const lower = raw.toLowerCase();
  if (/non-2xx|edge function returned|http 5\d\d|503|529/.test(lower)) {
    return "O serviço de IA está temporariamente ocupado. Nada foi alterado — tente novamente em instantes.";
  }
  if (/429|quota|rate_limit|limite de uso/.test(lower)) {
    return "Atingimos o limite temporário de uso da IA. Nada foi alterado — tente novamente em alguns instantes.";
  }
  if (/timeout|tempo limite|took too long/.test(lower)) {
    return "A IA demorou demais para responder. Nada foi alterado — tente novamente.";
  }
  return raw;
}

function describeChanges(before: SiteSpec | null, after: SiteSpec | null): string {
  if (!before || !after) return "";
  const areas: Array<[keyof SiteSpec, string]> = [
    ["design_system", "Visual (cores/tipografia)"],
    ["content", "Conteúdo/textos"],
    ["sections", "Seções"],
    ["calls_to_action", "Botões/CTAs"],
    ["navigation", "Navegação"],
    ["seo", "SEO"],
  ];
  const changed = areas.filter(([k]) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(([, label]) => label);
  return changed.length > 0 ? changed.slice(0, 4).join(", ") + "." : "ajustes sutis aplicados.";
}

// Redimensiona e converte imagem para dataURL (mantém anexo leve, apenas na sessão).
function fileToDataUrl(file: File): Promise<{ dataUrl: string; label: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), label: file.name });
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas indisponível")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), label: file.name });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

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
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiHistory, setAiHistory] = useState<SiteSpec[]>([]);
  const [busyAction, setBusyAction] = useState<"pdf" | "zip" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<string | undefined>(undefined);
  const [agentStep, setAgentStep] = useState<number | null>(null);
  const [draftFiles, setDraftFiles] = useState<Record<string, string> | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  // Avança por fases reais do ciclo do agente enquanto a IA trabalha.
  function runAgentProgress(steps: AgentProgress[], intervalMs = 1600) {
    setAgentStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i < steps.length) setAgentStep(i);
      else clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }

  function handleRestoreFromVersion(spec: SiteSpec, version: { version_number: number }) {
    setDraftSpec(normalizeSpec(spec));
    setDirty(true);
    setPendingSummary(`Restauração de v${version.version_number}`);
    toast.info(`Versão v${version.version_number} restaurada como rascunho — revise e salve.`);
  }

  const publicUrl = (): string | null => (project?.slug ? `${window.location.origin}/public/${project.slug}` : null);

  async function handlePublish() {
    if (publishing || unpublishing) return;
    const specData = currentSpec();
    if (!specData || !project?.id) { toast.error("Gere o site antes de publicar."); return; }
    setPublishing(true);
    try {
      await publishSiteProject(project.id, specData);
      toast.success("Site publicado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao publicar");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (publishing || unpublishing) return;
    if (!project?.id) return;
    setUnpublishing(true);
    try {
      await unpublishSiteProject(project.id);
      toast.success("Site despublicado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao despublicar");
    } finally {
      setUnpublishing(false);
    }
  }

  async function copyPublicLink() {
    const url = publicUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  }

  const currentSpec = (): SiteSpec | null =>
    project?.spec && Object.keys(project.spec as object).length > 0 ? normalizeSpec(draftSpec) : null;

  async function handlePdf() {
    if (busyAction) return;
    const specData = currentSpec();
    if (!specData) { toast.error("Gere o site antes de exportar a proposta."); return; }
    setBusyAction("pdf");
    try {
      const heroRaw = (specData.content?.hero as Record<string, unknown> | undefined)?.image;
      const heroUrl = typeof heroRaw === "string" ? heroRaw
        : heroRaw && typeof heroRaw === "object" && typeof (heroRaw as Record<string, unknown>).url === "string" ? (heroRaw as Record<string, unknown>).url as string
        : null;
      const heroData = heroUrl ? await fetchImageAsDataUrl(heroUrl) : null;
      const { buffer, fileName } = await buildCommercialPdf(specData as never, heroData ? { dataUrl: heroData } : null);
      saveBlob(new Blob([buffer], { type: "application/pdf" }), fileName);
      toast.success("Proposta em PDF gerada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleZip() {
    if (busyAction) return;
    const specData = currentSpec();
    if (!specData) { toast.error("Gere o site antes de baixar o projeto."); return; }
    setBusyAction("zip");
    try {
      const { blob, name } = await exportProjectZip(specData as never);
      saveBlob(blob, name);
      toast.success("Projeto baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o ZIP");
    } finally {
      setBusyAction(null);
    }
  }

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

  // Chat-first: ao abrir um projeto com site, o construtor conversacional
  // (chat + preview) já entra automaticamente — sem precisar clicar em "Editar".
  const hasSpecNow = !!project?.spec && Object.keys(project.spec as object).length > 0;
  useEffect(() => {
    if (hasSpecNow && !editMode) startEditing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, hasSpecNow]);

  // Carrega a conversa persistida DO PROJETO (isolada por site_project).
  // Ao trocar de projeto, limpa o histórico anterior ANTES de carregar o novo,
  // para nunca exibir a conversa de outro projeto.
  useEffect(() => {
    if (!project?.id || !user) return;
    let active = true;
    setAiMessages([]);
    setAiHistory([]);
    loadSiteChatMessages(project.id)
      .then((rows) => {
        if (!active) return;
        if (rows.length === 0) {
          // Projeto sem histórico: garante chat limpo (nenhuma mensagem de outro projeto).
          setAiMessages([]);
          return;
        }
        setAiMessages(
          rows.map((r) => ({
            role: r.role,
            text: r.text,
            fileLabel: r.attachment?.label,
          })),
        );
      })
      .catch(() => setAiMessages([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, user?.id]);

  async function generate() {
    if (!project) return;
    setGenerating(true);
    setGenError(null);
    const stopProgress = runAgentProgress(GENERATION_STEPS);
    try {
      const briefing = (project.briefing ?? {}) as Record<string, unknown>;
      // CONTEXTO factual p/ o agente (sem inventar; apenas o que existe).
      const cContent = ((briefing.content ?? (project.spec as SiteSpec | null)?.content) ?? {}) as Record<string, unknown>;
      const cContact = (cContent.contact ?? {}) as Record<string, unknown>;
      const servicesArr = Array.isArray((cContent.services as Record<string, unknown> | undefined)?.items)
        ? ((cContent.services as Record<string, unknown>).items as Array<Record<string, unknown>>).map((i) => String(i.title ?? "")).filter(Boolean)
        : [];

      // TENTA A GERAÇÃO PELO CLINE (código real, self-review). Se indisponível,
      // cai no gerador clássico (spec) — fallback preservado.
      const genRes = await invokeProspectorGenerate({
        projectId: project.id,
        context: {
          name: project.company_name || project.name,
          segment: project.segment,
          city: project.city,
          state: project.state,
          phone: typeof cContact.phone === "string" ? cContact.phone : null,
          whatsapp: typeof cContact.whatsapp === "string" ? cContact.whatsapp : null,
          address: typeof cContact.address === "string" ? cContact.address : null,
          about: typeof briefing.about === "string" ? briefing.about : typeof cContent.about === "object" ? String((cContent.about as Record<string, unknown>).body ?? "") || null : null,
          services: servicesArr.length ? servicesArr : undefined,
        },
        briefing,
      });

      if (genRes.status === "ok" && genRes.files && Object.keys(genRes.files).length > 0) {
        // O agente criou o código real. SiteSpec derivada do site.json se houver.
        const specFromJson = genRes.spec ? normalizeSpec(genRes.spec as SiteSpec | Record<string, unknown> | null) : null;
        const base = specFromJson ?? normalizeSpec(null);
        const derived = { ...base, business: { ...(base.business ?? {}), name: project.company_name || project.name, segment: project.segment, city: project.city, state: project.state } };
        await saveGeneratedSite(project.id, derived, genRes.model ?? "cline", genRes.files);
        if (user?.id) await createSiteVersion(project.id, user.id, derived, pendingSummary).catch(() => {});
        setPendingSummary(undefined);
        setDraftSpec(derived);
        prevFilesRef.current = genRes.files;
        setDraftFiles(genRes.files);
        toast.success("Site criado pelo agente e salvo");
        await load();
        return;
      }

      // FALLBACK: gerador clássico (spec) quando o Cline não está disponível.
      const { spec, model } = await generateSiteSpec(briefing);
      const files = materializeProjectFiles(spec);
      await saveGeneratedSite(project.id, spec, model, files);
      if (user?.id) {
        await createSiteVersion(project.id, user.id, spec, pendingSummary).catch(() => {});
        setPendingSummary(undefined);
      }
      toast.success("Site criado e salvo");
      await load();
    } catch (e) {
      const message = friendlyAiError(e);
      setGenError(message);
      toast.error(message);
      try {
        await supabase.from("site_projects").update({ status: "error" }).eq("id", project.id);
        await load();
      } catch { /* mantém estado atual */ }
    } finally {
      stopProgress();
      setAgentStep(null);
      setGenerating(false);
    }
  }

  function startEditing() {
    if (!project) return;
    setDraftSpec(normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null));
    setDirty(false);
    setAiMessages([]);
    setAiHistory([]);
    setAiError(null);
    setEditMode(true);
  }

  function handleDraftChange(next: SiteSpec) {
    setDraftSpec(next);
    setDirty(true);
  }

  const chatConversation = () =>
    buildConversationContext(
      aiMessages.map((m) => ({ role: m.role, text: m.text })),
      { maxTurns: 12, maxCharsPerTurn: 700 },
    );

  const designMemory = () =>
    buildDesignMemory(
      aiMessages.map((m) => ({ role: m.role, text: m.text })),
      { max: 5, maxChars: 260 },
    );

  async function runAiInstruction(instruction: string, attachment?: { dataUrl: string; label: string }) {
    if (!project) return;
    setAiMessages((prev) => [...prev, { role: "user", text: instruction, image: attachment?.dataUrl, fileLabel: attachment?.label }]);
    setAiRunning(true);
    setAiError(null);
    const stopProgress = runAgentProgress(EDIT_STEPS, 1400);
    const snapshot = draftSpec;
    appendSiteChatMessages(project.id, user?.id ?? "", [{ role: "user", text: instruction, label: attachment?.label, type: attachment?.dataUrl.startsWith("data:image") ? "image" : "file" }]).catch(() => {});
    const hasWorkspace = !!draftFiles && Object.keys(draftFiles).length > 0;
    const pushReply = (msg: string, activity?: Array<{ phase: string; detail: string }>) => {
      const activityLines = (activity ?? [])
        .filter((a) => a.phase === "editing" || a.phase === "done")
        .map((a) => `✓ ${a.detail}`)
        .slice(0, 8);
      const full = activityLines.length ? `${msg}\n\n${activityLines.join("\n")}` : msg;
      setAiMessages((prev) => [...prev, { role: "assistant", text: full }]);
      appendSiteChatMessages(project.id, user?.id ?? "", [{ role: "assistant", text: full }]).catch(() => {});
    };
    try {
      // ===== CAMINHO PRINCIPAL: Cline Agent no workspace (código real) =====
      if (hasWorkspace) {
        let agentErr: unknown = null;
        let agentRes: Awaited<ReturnType<typeof invokeProspectorAgent>> | null = null;
        try {
          const cContent = (draftSpec.content ?? {}) as Record<string, unknown>;
          const cContact = (cContent.contact ?? {}) as Record<string, unknown>;
          agentRes = await invokeProspectorAgent({
            instruction,
            files: draftFiles,
            projectId: project.id,
            context: {
              name: project.company_name || project.name,
              segment: project.segment,
              city: project.city,
              state: project.state,
              phone: typeof cContact.phone === "string" ? cContact.phone : null,
              whatsapp: typeof cContact.whatsapp === "string" ? cContact.whatsapp : null,
              address: typeof cContact.address === "string" ? cContact.address : null,
            },
            memory: designMemory(),
          });
        } catch (e) {
          agentErr = e;
        }

        if (!agentErr && agentRes && agentRes.status === "ok") {
          if (agentRes.changed && agentRes.files) {
            setAiHistory((prev) => [snapshot, ...prev].slice(0, 10));
            const derivedSpec = agentRes.spec ? normalizeSpec(agentRes.spec as SiteSpec | Record<string, unknown> | null) : draftSpec;
            setDraftSpec(derivedSpec);
            setDirty(true);
            prevFilesRef.current = agentRes.files;
            setDraftFiles(agentRes.files);
            setPreviewNonce((n) => n + 1);
            const runtime = agentRes.runtime === "cline" ? "" : " (modo compatível)";
            pushReply(agentRes.reply?.trim() || `Arquivos atualizados (${(agentRes.touched ?? []).length}).${runtime}`, agentRes.activity);
          } else {
            pushReply(agentRes.reply?.trim() || "Entendi! Não apliquei mudanças no código por enquanto.");
          }
          stopProgress();
          setAgentStep(null);
          setAiRunning(false);
          return;
        }
        if (agentErr || !agentRes || agentRes.status === "error") {
          // Fallback automático para o fluxo spec quando o agente de código não
          // está disponível (sem runtime Node / edge indisponível).
        }
      }

      // ===== FALLBACK LEGADO: edit-site sobre a SiteSpec =====
      const ctx = {
        name: project.company_name || project.name,
        segment: project.segment,
        city: project.city,
        state: project.state,
      };
      const res = await editSiteWithAI(draftSpec, instruction, ctx, chatConversation(), designMemory());

      const mode = res.mode ?? "edit";
      if (!res.changed || mode === "question" || mode === "clarify" || mode === "chat") {
        // Conversa, dúvida ou pedido ambíguo: a IA responde sem alterar a spec.
        let msg = res.reply?.trim();
        if (!msg) {
          msg = mode === "clarify"
            ? "Entendi! Para eu ajustar com precisão, me diga o que você quer mudar (ex.: cor, texto, seção, layout)."
            : "Entendi! Por enquanto não apliquei mudanças no site — continue me pedindo o que quer ajustar.";
        }
        pushReply(msg);
        stopProgress();
        setAgentStep(null);
        setAiRunning(false);
        return;
      }

      const protectedSpec = applyAiProtections(draftSpec, res.spec, instruction);
      if (specsEqual(draftSpec, protectedSpec)) {
        const msg = res.reply?.trim() || "Não alterei nada relevante (dados factuais protegidos foram mantidos).";
        pushReply(msg);
        stopProgress();
        setAgentStep(null);
        setAiRunning(false);
        return;
      }

      setAiHistory((prev) => [snapshot, ...prev].slice(0, 10));
      setDraftSpec(protectedSpec);
      setDirty(true);
      // Live preview de código: re-materializa o rascunho editado para o preview
      // refletir a alteração feita pelo chat (além das edições diretas do agente).
      const draftNow = materializeProjectFiles(protectedSpec);
      setDraftFiles((prev) => (prev && Object.keys(prev).length > 0 ? draftNow : draftNow));
      setPreviewNonce((n) => n + 1);
      const summary = describeChanges(snapshot, protectedSpec);
      const msg = [res.reply?.trim(), `Alteração aplicada: ${summary} (ainda não salva).`].filter(Boolean).join(" ");
      pushReply(msg);
    } catch (e) {
      const msg = friendlyAiError(e);
      setAiError(msg);
      setAiMessages((prev) => [...prev, { role: "assistant", text: msg }]);
    } finally {
      stopProgress();
      setAgentStep(null);
      setAiRunning(false);
    }
  }

  async function undoAi() {
    if (aiHistory.length === 0) return;
    const prev = aiHistory[0];
    setAiHistory((h) => h.slice(1));
    setDraftSpec(prev);
    setAiError(null);
    const savedSpec = project ? normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null) : null;
    setDirty(!specsEqual(prev, savedSpec));
    setAiMessages((m) => [...m, { role: "assistant", text: "Desfeita a última alteração da IA." }]);
  }

  function exitEditing() {
    if (dirty && !window.confirm("Há alterações não salvas. Descartar e sair do editor?")) return;
    setEditMode(false);
    setDirty(false);
    setAiMessages([]);
    setAiHistory([]);
    setAiError(null);
  }

  async function saveEdits() {
    if (!project) return;
    setSaving(true);
    const savedSpec = draftSpec;
    const summary = pendingSummary;
    try {
      const files = materializeProjectFiles(savedSpec);
      await updateProjectSpec(project.id, savedSpec, files);
      if (user?.id) {
        await createSiteVersion(project.id, user.id, savedSpec, summary).catch(() => {});
      }
      toast.success("Alterações salvas");
      setDirty(false);
      setPendingSummary(undefined);
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

  const prevFilesRef = useRef<Record<string, string> | null>(null);

  // Live preview (code-first): o preview do modo edição mostra o código real do
  // projeto. Ao entrar em edição, baseia-se em generated_code (arquivos reais,
  // inclusive alterados pelo agente de código) OU materializa a spec do projeto.
  // A partir daí, o código passa a ser o estado do preview — quando o agente de
  // código executa, draftFiles é atualizado diretamente.
  useEffect(() => {
    if (!project) return;
    if (prevFilesRef.current) return; // já inicializado nesta sessão de edição
    const existing = (project.generated_code && typeof project.generated_code === "object"
      ? project.generated_code as Record<string, unknown>
      : {});
    const hasRealFiles = Object.keys(existing).length > 0;
    if (hasRealFiles) {
      const cleaned: Record<string, string> = {};
      for (const [p, c] of Object.entries(existing)) {
        if (typeof c === "string") cleaned[p] = c;
      }
      prevFilesRef.current = cleaned;
      setDraftFiles(cleaned);
    } else {
      const fromSpec = materializeProjectFiles(draftSpec);
      prevFilesRef.current = fromSpec;
      setDraftFiles(fromSpec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

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
      {versionsOpen && project && (
        <SiteVersionsDialog projectId={project.id} onClose={() => setVersionsOpen(false)} onRestore={handleRestoreFromVersion} />
      )}
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
            {hasSpec && (
              <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)} title="Histórico de versões">
                <HistoryIcon className="h-3.5 w-3.5 mr-1" /> Histórico
              </Button>
            )}
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

      {hasSpec && project.published_status === "published" && project.slug && (
        <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-emerald-500/30 bg-emerald-500/5">
          <div className="min-w-0">
            <p className="text-sm font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-600" /> Site publicado</p>
            <p className="text-xs font-mono text-muted-foreground truncate max-w-full">{publicUrl()}</p>
            {project.published_at && <p className="text-[11px] text-muted-foreground">Publicado em {new Date(project.published_at).toLocaleString("pt-BR")}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={copyPublicLink}><Copy className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
            <Button size="sm" variant="outline" onClick={() => { const u = publicUrl(); if (u) window.open(u, "_blank", "noopener"); }}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir site
            </Button>
            <Button size="sm" variant="outline" onClick={handlePublish} disabled={publishing || unpublishing}>
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Rocket className="h-3.5 w-3.5 mr-1" />} Publicar nova versão
            </Button>
            <Button size="sm" variant="outline" onClick={handleUnpublish} disabled={unpublishing}>
              {unpublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <X className="h-3.5 w-3.5 mr-1" />} Despublicar
            </Button>
          </div>
        </Card>
      )}
      {hasSpec && project.published_status !== "published" && (
        <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-primary/5">
          <div>
            <p className="text-sm font-semibold">Publicação</p>
            <p className="text-xs text-muted-foreground">Ao publicar, esta versão fica disponível na URL pública. Alterações futuras exigem nova publicação.</p>
          </div>
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Rocket className="h-3.5 w-3.5 mr-1" />} Publicar site
          </Button>
        </Card>
      )}

      {hasSpec && (
        <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-primary/5">
          <div>
            <p className="text-sm font-semibold">Exportar projeto</p>
            <p className="text-xs text-muted-foreground">Proposta comercial em PDF e arquivo completo do site (versão atual).</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handlePdf} disabled={!!busyAction}>
              {busyAction === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
              Gerar proposta PDF
            </Button>
            <Button size="sm" onClick={handleZip} disabled={!!busyAction}>
              {busyAction === "zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FolderDown className="h-3.5 w-3.5 mr-1" />}
              Baixar projeto
            </Button>
          </div>
        </Card>
      )}

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

      {generating && agentStep !== null && GENERATION_STEPS[agentStep] && (
        <Card className="p-4 border-primary/25 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {GENERATION_STEPS[agentStep].label}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{GENERATION_STEPS[agentStep].detail}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {GENERATION_STEPS.map((s, i) => (
              <span key={s.phase} className={`h-1 flex-1 rounded-full transition-colors ${i <= agentStep ? "bg-primary" : "bg-border/60"}`} />
            ))}
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
        <div className="grid gap-5 lg:h-[calc(100vh-150px)] lg:grid-cols-[420px_minmax(0,1fr)] lg:overflow-hidden">
          <div className="min-h-0 lg:h-full">
            <SiteChat
              messages={aiMessages}
              running={aiRunning}
              error={aiError}
              canUndo={aiHistory.length > 0}
              dirty={dirty}
              onApply={runAiInstruction}
              onRevert={undoAi}
              runningLabel={aiRunning && agentStep !== null && EDIT_STEPS[agentStep] ? EDIT_STEPS[agentStep].label : undefined}
            />
          </div>
          <div className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Preview ao vivo
              </h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">O que você conversar aparece aqui — só salva quando você clicar em Salvar</span>
            </div>
            {draftFiles && Object.keys(draftFiles).length > 0 ? (
              <LiveProjectPreview files={draftFiles} refreshKey={previewNonce} fallback={<SitePreview spec={draftSpec as SiteSpec | Record<string, unknown> | null} />} />
            ) : (
              <SitePreview spec={draftSpec as SiteSpec | Record<string, unknown> | null} />
            )}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Code2 className="h-3.5 w-3.5 text-primary" />
                Motor do editor: <span className="font-medium text-foreground">Cline Agent</span>
                {draftFiles && Object.keys(draftFiles).length > 0 ? " · código real" : " · modo compatível"}
              </p>
              {aiRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
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
