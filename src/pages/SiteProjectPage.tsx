import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Globe, Loader2, Sparkles, AlertTriangle, Palette, Type, LayoutTemplate, Pencil, X, Eye, FileText, FolderDown, Rocket, Copy, ExternalLink, History as HistoryIcon, Code2, Send, Video, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { SiteProjectRow, SiteSpec } from "@/data/siteProjects";
import { normalizeSpec, statusLabel, safeArr, contentBlock, applyAiProtections, specsEqual, projectKindOf } from "@/data/siteProjects";
import { StudioDeviceSwitcher } from "@/components/sites/studio/StudioPreviewPanel";
import { StudioCommercialBar } from "@/components/sites/studio/StudioCommercialBar";
import type { StudioDevice } from "@/lib/studio/types";
import {
  fetchSiteProject, saveGeneratedSite, updateProjectSpec, editSiteWithAI,
  loadSiteChatMessages, appendSiteChatMessages, publishSiteProject, unpublishSiteProject, publishReactSite,
  createSiteVersion, invokeProspectorAgent, invokeProspectorGenerate, restoreSiteVersion,
  captureWorkspaceScreenshots, generateSiteVideo, fetchRuntimeArtifact, updateGeneratedCode } from "@/lib/siteProjectsApi";
import { SitePreview } from "@/components/sites/SitePreview";
import { safeLocalStorage } from "@/lib/safeStorage";
import { SiteChat } from "@/components/sites/editor/SiteChat";
import { SiteVersionsDialog } from "@/components/sites/editor/SiteVersionsDialog";
import { supabase } from "@/integrations/supabase/client";
import { exportProjectZip, exportWorkspaceZip, saveBlob, fetchImageAsDataUrl } from "@/lib/siteDownload";
import { exportReactProjectZip } from "@/lib/studio/reactExport";
import { invokeStudioBuild } from "@/lib/studio/buildApi";
import { buildCommercialPdf, pdfFileName } from "@/lib/sitePdf";
import { buildConversationContext, buildDesignMemory } from "@/lib/aiEditContext";
import { materializeProjectFiles, GENERATION_STEPS, EDIT_STEPS, type AgentProgress } from "@/lib/agentProject";
import { LiveProjectPreview } from "@/components/sites/LiveProjectPreview";
import { StudioShell } from "@/components/sites/studio/StudioShell";
import { StudioGitConfigDialog } from "@/components/sites/studio/StudioGitConfigDialog";
import { StudioHistoryDialog, type StudioGitRestoreMeta } from "@/components/sites/studio/StudioHistoryDialog";
import { invokeStudioGit } from "@/lib/studio/gitApi";
import { isStudioUiEnabled } from "@/lib/studio/featureFlag";
import { isBootstrapFiles } from "@/lib/studio/reactTemplate";
import { PERF, markPerf } from "@/lib/studio/perf";
import { recordRuntimeChange, detectStaleSnapshot, type RuntimeChangeMap } from "@/lib/studio/autosaveGuard";
import { isConversationResult, type RunResultLike } from "@/lib/studio/runOutcome";
import { useStudioChat } from "@/hooks/studio/useStudioChat";
import type { StudioStreamEvent, StudioFilesReadyEvent } from "@/lib/studio/streamEvents";
import { GitHubProjectButton } from "@/components/app/GitHubProjectButton";
import { StudioIntegrationsButtons } from "@/components/sites/studio/StudioIntegrationsButtons";
import { buildStrategyInstruction, strategyById } from "@/lib/siteStrategies";
import { extractSitePalette } from "@/lib/sitePalette";
import { ProposalWhatsAppDialog } from "@/components/app/ProposalWhatsAppDialog";
import type { ProposalLeadLike } from "@/lib/proposalWhatsApp";
import { buildSiteMediaContext, fetchIllustrativeImages } from "@/lib/studio/siteMediaContext";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  image?: string; // dataURL exibido apenas na sessão (sem storage nesta fase)
  fileLabel?: string;
  images?: Array<{ dataUrl: string; label: string }>; // múltiplos anexos
}

import { friendlyAiError } from "@/lib/friendlyAiError";

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

// Extrai o media type de um data URL ("data:image/png;base64,...").
function guessMediaType(dataUrl: string): string {
  const m = /^data:([^;,]+)/.exec(dataUrl || "");
  return m ? m[1] : "application/octet-stream";
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
  // Viewport do preview (Desktop/Tablet/Mobile). Persistido localmente para
  // manter a escolha entre sessões; o thumbnail da galeria segue Desktop.
  const [previewDevice, setPreviewDevice] = useState<StudioDevice>(() => {
    const saved = safeLocalStorage.getItem("prospector.preview.device");
    return saved === "tablet" || saved === "mobile" ? saved : "desktop";
  });
  useEffect(() => { try { safeLocalStorage.setItem("prospector.preview.device", previewDevice); } catch { /* noop */ } }, [previewDevice]);
  const [aiRunning, setAiRunning] = useState(false);
  /** Atividades reais transmitidas ao vivo pelo runtime (5.34). */
  const [liveWork, setLiveWork] = useState<Array<{ phase: string; detail: string }>>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiHistory, setAiHistory] = useState<Array<{ spec: SiteSpec; files?: Record<string, string> | null }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"pdf" | "zip" | null>(null);
  // Vídeo de apresentação do site (MP4 H.264) — gerado no Agent Runtime.
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoPhase, setVideoPhase] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{ duration: number; width: number; height: number; fileSize: number; codec: string } | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  // C5: build de produção React.
  const [building, setBuilding] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // Fase 6: histórico Git (checkpoints/diff/time travel) e dirty do editor Studio.
  const [gitHistoryOpen, setGitHistoryOpen] = useState(false);
  // C4: pedido de abrir arquivo no Monaco vindo do histórico/diff.
  const [openFileRequest, setOpenFileRequest] = useState<{ file: string; line?: number; nonce: number } | null>(null);
  function requestOpenFile(file: string, line?: number) {
    setOpenFileRequest({ file, line, nonce: Date.now() });
  }
  const [studioUnsaved, setStudioUnsaved] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<string | undefined>(undefined);
  const [agentStep, setAgentStep] = useState<number | null>(null);
  const [draftFiles, setDraftFiles] = useState<Record<string, string> | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const genStartRef = useRef(0);
  const [projectLead, setProjectLead] = useState<ProposalLeadLike | null>(null);
  // Evita disparar a 1ª geração ANTES de termos os dados reais do lead (fotos,
  // endereço, place/geo) — senão o site nasceria sem imagens/mapa.
  const [leadLoaded, setLeadLoaded] = useState(false);
  const projectLeadRef = useRef<ProposalLeadLike | null>(null);
  projectLeadRef.current = projectLead;

  // Dados REAIS do lead vinculado ao projeto (inclui foto/geo/place para o site).
  useEffect(() => {
    const leadId = project?.lead_id ?? null;
    setProjectLead(null);
    setLeadLoaded(false);
    if (!leadId) { setLeadLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, whatsapp, phone, segment, category, city, state, address, photo_name, google_url, latitude, longitude")
        .eq("id", String(leadId))
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) setProjectLead(data as unknown as ProposalLeadLike);
      setLeadLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [project?.lead_id]);

// FASE 1: a primeira geração deixou de ser automática (kickoff). O site é criado
// quando o usuário PEDE no chat — o runtime monta a missão com os dados reais do
// cliente (mediaContextBlock + briefing + memória) e roda o agente em modo
// "generate" no projeto bootstrap.


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

  async function handleRestoreFromVersion(_spec: SiteSpec, version: { id: string; version_number: number; files?: Record<string, string> | null }) {
    if (!project?.id) return;
    try {
      // Restaura de verdade no projeto (spec + workspace), sem tocar na publicação.
      const restored = await restoreSiteVersion(project.id, version.id);
      setDraftSpec(normalizeSpec(restored.spec));
      if (restored.files && Object.keys(restored.files).length > 0) {
        prevFilesRef.current = restored.files;
        setDraftFiles(restored.files);
      } else {
        const fromSpec = materializeProjectFiles(restored.spec);
        prevFilesRef.current = fromSpec;
        setDraftFiles(fromSpec);
      }
      setPreviewNonce((n) => n + 1);
      setDirty(false);
      setPendingSummary(undefined);
      toast.success(`Versão v${version.version_number} restaurada.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao restaurar versão");
    }
  }

  // Fase 6 — time travel via Git: aplica o estado restaurado no projeto
  // (generated_code + versão) e sincroniza Monaco/Explorer/Preview. Nunca
  // restaura silenciosamente sobre alterações não salvas.
  async function handleRestoreGit(files: Record<string, string>, meta: StudioGitRestoreMeta) {
    if (!project?.id) return;
    // Buffer do editor (não salvo) não pode ser descartado silenciosamente.
    if (studioUnsaved) {
      toast.error("Salve as alterações do editor antes de restaurar.");
      return;
    }
    setSaving(true);
    try {
      // C4 §13: se há alterações persistidas mas não commitadas, cria um SNAPSHOT
      // (versão + commit) antes do time travel — o trabalho nunca é destruído.
      if (dirty && draftFiles && Object.keys(draftFiles).length > 0) {
        const snapshot = await persistAutosave(draftSpec, draftFiles, `Snapshot antes de restaurar ${meta.short}`);
        if (snapshot.ok) void commitGitCheckpoint(draftFiles, `Snapshot antes de restaurar ${meta.short}`);
      }
      prevFilesRef.current = files;
      setDraftFiles(files);
      const res = await persistAutosave(draftSpec, files, `Restaurado para ${meta.short}: ${meta.message}`);
      if (!res.ok) throw new Error(res.error || "Erro ao salvar a restauração");
      setPreviewNonce((n) => n + 1);
      setDirty(false);
      setPendingSummary(undefined);
      toast.success(`Projeto restaurado para ${meta.short}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao restaurar o projeto");
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = (): string | null => (project?.slug ? `${window.location.origin}/public/${project.slug}` : null);

  async function handleBuild(): Promise<{ ok: boolean; html?: string; error?: string }> {
    if (!project?.id) return { ok: false, error: "Projeto não carregado." };
    if (building) return { ok: false, error: "Build já em andamento." };
    setBuilding(true);
    try {
      const res = await invokeStudioBuild({ projectId: project.id, userId: user?.id, files: draftFiles ?? {}, workspaceRevision: workspaceRevRef.current ?? undefined });
      if (!res.ok) {
        const error = res.error ?? "Build falhou.";
        toast.error(error);
        return { ok: false, error };
      }
      toast.success("Build de produção concluído");
      return { ok: true, html: res.html ?? undefined };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Erro no build";
      toast.error(error);
      return { ok: false, error };
    } finally {
      setBuilding(false);
    }
  }

  async function handlePublish() {
    if (publishing || unpublishing) return;
    if (!project?.id) { toast.error("Projeto não carregado."); return; }

    // C5: React publica o BUILD real (não a spec/HTML estático).
    if (isReactProject) {
      setPublishing(true);
      try {
        // C5 §10: snapshot do estado atual antes de publicar (nada fica "invisível").
        if (dirty && draftFiles && Object.keys(draftFiles).length > 0) {
          const snap = await persistAutosave(draftSpec, draftFiles, "Snapshot antes de publicar");
          if (snap.ok) void commitGitCheckpoint(draftFiles, "Snapshot antes de publicar");
        }
        const built = await handleBuild();
        if (!built.ok || !built.html) { toast.error(built.error ?? "Build falhou — publicação cancelada."); return; }
        await publishReactSite(project.id, built.html, { name: project.company_name || project.name });
        toast.success("Site publicado (build de produção)");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao publicar");
      } finally {
        setPublishing(false);
      }
      return;
    }

    const specData = currentSpec();
    if (!specData || !project?.id) { toast.error("Gere o site antes de publicar."); return; }
    setPublishing(true);
    try {
      // Publica o CÓDIGO REAL (workspace) como snapshot publicado — a URL pública
      // renderiza o generated_code quando existir (code-first).
      const persistedCode = project.generated_code && typeof project.generated_code === "object"
        ? project.generated_code as Record<string, unknown>
        : {};
      const persistedFiles = Object.keys(persistedCode).length
        ? Object.fromEntries(Object.entries(persistedCode).filter(([, v]) => typeof v === "string")) as Record<string, string>
        : null;
      const hasDraft = !!draftFiles && Object.keys(draftFiles).length > 0;
      const code = hasDraft ? draftFiles! : persistedFiles ?? materializeProjectFiles(specData);
      await publishSiteProject(project.id, specData, code);
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
    // A proposta usa os dados REAIS do projeto/lead. Projetos React não têm
    // `spec` — antes isso bloqueava o PDF; agora montamos os dados da proposta
    // a partir do negócio (mesma apresentação/mockups de sempre).
    const specData = currentSpec();
    const lead = projectLeadRef.current;
    const pdfSpec = (specData ?? {
      business: {
        name: project?.company_name || project?.name || lead?.name || "Cliente",
        segment: project?.segment ?? lead?.segment ?? undefined,
        city: project?.city ?? lead?.city ?? undefined,
        state: project?.state ?? lead?.state ?? undefined,
        phone: lead?.phone ?? undefined,
        whatsapp: lead?.whatsapp ?? undefined,
        address: lead?.address ?? undefined,
      },
      design_system: { colors: {} },
    }) as unknown as SiteSpec;
    setBusyAction("pdf");
    try {
      toast.info("Capturando versão desktop e mobile do site…");
      // Fonte de verdade = estado ATUAL do editor (draftFiles), senão generated_code.
      const codeFiles = draftFiles && Object.keys(draftFiles).length ? draftFiles
        : project?.generated_code && typeof project.generated_code === "object"
          ? Object.fromEntries(Object.entries(project.generated_code as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>
          : null;
      if (!codeFiles || !Object.keys(codeFiles).some((k) => k.endsWith("index.html"))) {
        throw new Error("Nenhum arquivo de site disponível para capturar. Gere o site primeiro.");
      }
      const serverShots = await captureWorkspaceScreenshots(codeFiles);
      // FIDELIDADE OBRIGATÓRIA: só usamos capturas do navegador real (Chromium
      // do Agent Runtime). Sem captura real, NÃO geramos PDF com imagem falsa.
      const shots = serverShots;
      if (!shots.desktop || !shots.mobile) {
        // NUNCA gerar PDF genérico: sem captura real, falha de forma explícita.
        throw new Error("Não foi possível capturar o site real para a proposta (desktop/mobile). Verifique se o Agent Runtime está no ar e com memória suficiente, e tente novamente.");
      }
      toast.info("Montando apresentação…");
      const realPalette = extractSitePalette(codeFiles);
      const screenshots = [shots.desktop, shots.mobile];
      const { buffer, fileName } = await buildCommercialPdf(pdfSpec as never, null, screenshots, realPalette, project?.company_name || project?.name);
      saveBlob(new Blob([buffer], { type: "application/pdf" }), fileName);
      toast.success("Proposta em PDF gerada com capturas reais do site");
    } catch (e) {
      console.error("[handlePdf]", e);
      toast.error(friendlyAiError(e));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleZip() {
    if (busyAction) return;
    setBusyAction("zip");
    try {
      // FONTE DE VERDADE = estado ATUAL do projeto (workspace real), não a spec.
      // O ZIP passa a ser o MESMO site do Preview, com paths relativos preservados
      // (inclui assets/brand/*.svg, logo SVG, favicon, imagens, CSS/JS, site.json).
      const persistedCode = project?.generated_code && typeof project.generated_code === "object"
        ? (project.generated_code as Record<string, unknown>)
        : {};
      const persistedFiles = Object.keys(persistedCode).length
        ? (Object.fromEntries(Object.entries(persistedCode).filter(([, v]) => typeof v === "string")) as Record<string, string>)
        : null;
      const realFiles = draftFiles && Object.keys(draftFiles).length ? draftFiles : persistedFiles;
      // C5: React exporta o CÓDIGO-FONTE real (ZIP editável), não o dist/scaffolding estático.
      if (isReactProject) {
        if (!realFiles || Object.keys(realFiles).length === 0) { toast.error("Nada para exportar neste projeto."); return; }
        const { blob, name } = await exportReactProjectZip(realFiles, project?.slug || project?.name || "projeto-react");
        saveBlob(blob, name);
        toast.success("Projeto React baixado (código-fonte)");
        return;
      }
      const hasRealSite = !!realFiles && Object.keys(realFiles).some((p) => p.endsWith("index.html"));
      if (hasRealSite) {
        const { blob, name } = await exportWorkspaceZip(realFiles!);
        saveBlob(blob, name);
        toast.success("Projeto baixado");
        return;
      }
      // Projeto legado sem workspace real → reconstrói a partir da spec.
      const specData = currentSpec();
      if (!specData) { toast.error("Gere o site antes de baixar o projeto."); return; }
      const { blob, name } = await exportProjectZip(specData as never);
      saveBlob(blob, name);
      toast.success("Projeto baixado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o ZIP");
    } finally {
      setBusyAction(null);
    }
  }

  function videoFileName(): string {
    const raw = String(projectLead?.name || (project?.spec as { business?: { name?: string } } | null)?.business?.name || "cliente");
    const slug = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cliente";
    return `${slug}-apresentacao-site.mp4`;
  }

  async function handleGenerateVideo() {
    if (generatingVideo) return;
    const persistedCode = project?.generated_code && typeof project.generated_code === "object"
      ? (project.generated_code as Record<string, unknown>)
      : {};
    const persistedFiles = Object.keys(persistedCode).length
      ? (Object.fromEntries(Object.entries(persistedCode).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : null;
    const realFiles = draftFiles && Object.keys(draftFiles).length ? draftFiles : persistedFiles;
    if (!project?.id || !realFiles || !Object.keys(realFiles).some((p) => p.endsWith("index.html"))) {
      toast.error("Gere o site antes de criar o vídeo.");
      return;
    }
    setGeneratingVideo(true);
    setVideoError(null);
    setVideoInfo(null);
    if (videoBlobUrl) { URL.revokeObjectURL(videoBlobUrl); setVideoBlobUrl(null); }
    const phases = ["Preparando…", "Abrindo o site no navegador…", "Gravando navegação…", "Processando vídeo (MP4/H.264)…", "Finalizando…"];
    let pi = 0;
    setVideoPhase(phases[0]);
    const timer = window.setInterval(() => { pi = Math.min(pi + 1, phases.length - 1); setVideoPhase(phases[pi]); }, 5000);
    try {
      const res = await generateSiteVideo({ files: realFiles, projectId: project.id, target: 30 });
      if (!res.ok || !res.videoUrl) {
        setVideoError(res.error ?? "Não foi possível gerar o vídeo.");
        toast.error("Falha ao gerar o vídeo");
        return;
      }
      setVideoPhase("Baixando o vídeo…");
      const blob = await fetchRuntimeArtifact(res.videoUrl, project.id);
      if (!blob) { setVideoError("O vídeo foi gerado, mas não foi possível baixá-lo do runtime."); return; }
      const url = URL.createObjectURL(blob);
      setVideoBlobUrl(url);
      setVideoInfo({
        duration: Math.round(res.duration ?? 0),
        width: res.width ?? 1280,
        height: res.height ?? 720,
        fileSize: res.fileSize ?? blob.size,
        codec: String(res.codec ?? "h264").toUpperCase(),
      });
      setVideoPhase("Vídeo pronto");
      toast.success("Vídeo gerado");
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : "Falha ao gerar o vídeo.");
      toast.error("Falha ao gerar o vídeo");
    } finally {
      window.clearInterval(timer);
      setGeneratingVideo(false);
    }
  }

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await fetchSiteProject(id);
      markPerf(PERF.T1, { id });
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

  // FASE 5.1 — T2: Studio montado (dados do projeto já disponíveis na tela).
  useEffect(() => {
    if (!loading && project) markPerf(PERF.T2, { id: project.id });
  }, [loading, project]);

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

  // Carrega a conversa persistida DO PROJETO (isolada por site_project + conversationId).
  // Ao trocar de projeto, limpa o histórico anterior ANTES de carregar o novo,
  // para nunca exibir a conversa de outro projeto.
  // O conversationId é persistido no localStorage para retomar a conversa ao recarregar.
  useEffect(() => {
    if (!project?.id || !user) return;
    const convKey = `prospector-conv:${user.id}:${project.id}`;
    const saved = localStorage.getItem(convKey);
    const cid = saved ?? crypto.randomUUID();
    localStorage.setItem(convKey, cid);
    setConversationId(cid);

    let active = true;
    setAiMessages([]);
    setAiHistory([]);
    loadSiteChatMessages(project.id, cid)
      .then((rows) => {
        if (!active) return;
        if (rows.length === 0) {
          // Projeto/conversa sem histórico: garante chat limpo.
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
    genStartRef.current = Date.now();
    setGenElapsed(0);
    const stopProgress = runAgentProgress(GENERATION_STEPS);
    const ticker = window.setInterval(() => setGenElapsed(Math.round((Date.now() - genStartRef.current) / 1000)), 1000);
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
      // Criação sem Lead: o prompt original do usuário vira a missão principal.
      const userPrompt = typeof briefing.user_prompt === "string" && briefing.user_prompt.trim() ? briefing.user_prompt.trim() : undefined;
      const genRes = await invokeProspectorGenerate({
        projectId: project.id,
        // IDENTIDADE: o runtime exige o usuário autenticado para resolver a IA
        // validada dele — sem user_id o runtime BLOQUEIA (regra absoluta).
        userId: user?.id ?? project.user_id ?? undefined,
        prompt: userPrompt,
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
        if (user?.id) await createSiteVersion(project.id, user.id, derived, pendingSummary, genRes.files).catch(() => {});
        setPendingSummary(undefined);
        setDraftSpec(derived);
        prevFilesRef.current = genRes.files;
        setDraftFiles(genRes.files);
        toast.success("Site criado pelo agente e salvo");
        const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
        const timing = (genRes as unknown as { timing?: { modelMs?: number; turnCount?: number; toolMs?: number } }).timing;
        toast.success(`Tempo total: ${elapsed}s${timing?.turnCount ? ` · ${timing.turnCount} turnos · modelo ${Math.round((timing.modelMs ?? 0) / 1000)}s` : ""}`);
        await load();
        return;
      }

      // SEM FALLBACK para o gerador clássico: se o editor completo (Agent Runtime
      // + Cline) não estiver disponível OU não produzir arquivos, erro explícito.
      const extra = genRes as unknown as { gate_ok?: boolean; gate_issues?: string[]; error?: string; reply?: string };
      const reason = extra?.error
        || (genRes.errors ?? [])[0]
        || (extra?.reply ? `O editor respondeu sem criar arquivos: ${extra.reply.slice(0, 240)}` : "")
        || (extra?.gate_ok === false ? `A revisão automática bloqueou a conclusão: ${(extra.gate_issues ?? []).slice(0, 3).join("; ")}` : "")
        || "A geração terminou sem criar arquivos no editor completo (verifique os logs do agent-runtime).";
      throw new Error(`A geração falhou no editor completo: ${reason}`);
    } catch (e) {
      const message = friendlyAiError(e);
      const elapsed = Math.round((Date.now() - genStartRef.current) / 1000);
      setGenError(`${message} (${elapsed}s)`);
      toast.error(`${message} (${elapsed}s)`);
      try {
        await supabase.from("site_projects").update({ status: "error" }).eq("id", project.id);
        await load();
      } catch { /* mantém estado atual */ }
    } finally {
      window.clearInterval(ticker);
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

  /** Nova conversa: gera outro conversationId, limpa o chat e o contexto do agente. */
  function startNewConversation() {
    if (!project?.id || !user) return;
    const cid = crypto.randomUUID();
    const convKey = `prospector-conv:${user.id}:${project.id}`;
    localStorage.setItem(convKey, cid);
    setConversationId(cid);
    setAiMessages([]);
    setAiHistory([]);
    toast.success("Nova conversa iniciada. O agente vai começar sem contexto anterior.");
  }

  async function runAiInstruction(
    instruction: string,
    attachment?: { dataUrl: string; label: string } | Array<{ dataUrl: string; label: string }>,
    opts?: { displayText?: string; acceptReport?: boolean; files?: Record<string, string>; silent?: boolean; media?: boolean },
  ) {
    if (!project) return;
    // Normaliza anexos: aceita um (legado) ou vários (novo). O envio só acontece
    // aqui — selecionar imagem no composer NÃO dispara nada.
    const attachments = (Array.isArray(attachment) ? attachment : attachment ? [attachment] : []).filter((a) => !!a?.dataUrl);
    const displayText = opts?.displayText ?? instruction;
    // Fase 3: o Studio envia o estado ATUAL do editor (rascunhos inclusos). Aqui
    // ele passa a ser a fonte da execução — sem cópia divergente.
    if (opts?.files) {
      prevFilesRef.current = opts.files;
      setDraftFiles(opts.files);
    }
    const runFiles = opts?.files ?? draftFiles;
    // C2: cancelamento real da execução em andamento.
    const controller = new AbortController();
    aiAbortRef.current = controller;
    // C6: retry NÃO duplica a mensagem do usuário (nem no banco).
    if (!opts?.silent) {
      lastRunRef.current = { instruction, attachment: attachments.length ? attachments : undefined, displayText };
      setAiMessages((prev) => [...prev, { role: "user", text: displayText, image: attachments[0]?.dataUrl, fileLabel: attachments[0]?.label, images: attachments.length ? attachments : undefined }]);
      appendSiteChatMessages(project.id, user?.id ?? "", [{ role: "user", text: displayText, label: attachments[0]?.label, type: attachments[0]?.dataUrl.startsWith("data:image") ? "image" : "file" }], conversationId ?? undefined).catch(() => {});
    }
    setAiRunning(true);
    setAiError(null);
    setLiveWork([]);
    if (studioEnabled || isReactProject) studioChat.begin();
    // FASE 1 (sem timer artificial): o progresso agora é 100% derivado dos eventos
    // REAIS do agente (activity/tool_call/tool_response chegando ao vivo). Não há
    // mais simulação de fases por setInterval.
    const stopProgress = () => { /* progresso real: nada a parar */ };
    const snapshot = draftSpec;
    const hasWorkspace = !!runFiles && Object.keys(runFiles).length > 0;
    // Resposta LIMPA no chat: o log interno (arquivos lidos/editados, ferramentas)
    // NÃO é narrado — o progresso humanizado já cobre a execução.
    const pushReply = (msg: string) => {
      setAiMessages((prev) => [...prev, { role: "assistant", text: msg }]);
      appendSiteChatMessages(project.id, user?.id ?? "", [{ role: "assistant", text: msg }], conversationId ?? undefined).catch(() => {});
    };
    try {
      // Resultado do agente: declarado FORA do bloco de workspace porque também é
      // usado no caminho React (conversa sem alteração de arquivo).
      let agentRes: Awaited<ReturnType<typeof invokeProspectorAgent>> | null = null;
      // ===== CAMINHO PRINCIPAL: Cline Agent no workspace (código real) =====
      if (hasWorkspace) {
        let agentErr: unknown = null;
        try {
          const cContent = (draftSpec.content ?? {}) as Record<string, unknown>;
          const cContact = (cContent.contact ?? {}) as Record<string, unknown>;
          const lead = projectLeadRef.current;
          // Mídia/localização REAIS do cliente (React Studio). O front só entrega
          // dados verificáveis; o runtime monta o mapa (sem API key) e as regras.
          const media = isReactProject
            ? buildSiteMediaContext({
                name: project.company_name || project.name,
                segment: project.segment,
                category: lead?.category ?? null,
                address: (typeof cContact.address === "string" ? cContact.address : null) ?? lead?.address ?? null,
                city: project.city,
                state: project.state,
                photoName: lead?.photo_name,
                googleUrl: lead?.google_url,
                latitude: lead?.latitude,
                longitude: lead?.longitude,
              })
            : null;
          // Imagens ilustrativas do sistema existente (Pexels via get-images),
          // disponibilizadas SEMPRE na geração completa: se a foto real do lead
          // falhar (hotlink/proxy), o site ainda tem imagens profissionais.
          const stock = media && opts?.media
            ? await fetchIllustrativeImages(project.segment, 6)
            : [];
          agentRes = await invokeProspectorAgent({
            instruction,
            files: runFiles,
            projectId: project.id,
            userId: user?.id ?? (project.user_id ?? undefined),
            context: {
              name: project.company_name || project.name,
              segment: project.segment,
              category: media?.category ?? null,
              city: project.city,
              state: project.state,
              phone: typeof cContact.phone === "string" ? cContact.phone : null,
              whatsapp: typeof cContact.whatsapp === "string" ? cContact.whatsapp : null,
              address: media?.address ?? (typeof cContact.address === "string" ? cContact.address : null),
              photos: media?.photos ?? [],
              stockImages: stock,
              placeId: media?.placeId ?? null,
              latitude: media?.latitude ?? null,
              longitude: media?.longitude ?? null,
            },
            memory: designMemory(),
            attachments: attachments.map((a) => ({ name: a.label, dataUrl: a.dataUrl, mediaType: guessMediaType(a.dataUrl), label: a.label })),
            conversation: chatConversation(),
            conversationId: conversationId ?? undefined,
            workspaceRevision: workspaceRevRef.current ?? undefined,
            // FASE 7.2 — estado REAL da execução (último evento ao vivo) para a
            // conversa responder "o que você está fazendo agora?" com a verdade.
            liveStatus: aiRunning || generating ? liveWork[liveWork.length - 1]?.detail ?? undefined : undefined,
          }, (phase, detail) => {
            // Atividade REAL ao vivo (arquivo sendo lido/editado etc.).
            setLiveWork((prev) => [...prev.slice(-9), { phase, detail }]);
          }, (studioEnabled || isReactProject) ? {
            // react → StudioTeam (C1), sem Router heurístico; static+studio → Fase 2.
            orchestrate: studioEnabled && !isReactProject,
            projectKind: isReactProject ? "react" : "static",
            onStudioEvent: handleStudioEvent,
            signal: controller.signal,
          } : { signal: controller.signal });
        } catch (e) {
          agentErr = e;
        }

        // FASE 2 — guarda a revisão devolvida pelo runtime (source of truth).
        if (typeof (agentRes as { workspace_rev?: number } | null)?.workspace_rev === "number") {
          workspaceRevRef.current = (agentRes as { workspace_rev?: number }).workspace_rev ?? null;
        }

        // CONVERSA (runtime "conversation"): a IA só respondeu — nada foi tocado no
        // projeto. Nunca tratar como alteração de arquivos (nada de salvar/versionar)
        // e NUNCA cair no aviso de "IA indisponível" (Fase 7.3): a resposta É o resultado.
        const conversationReply = isConversationResult(agentRes as RunResultLike | null | undefined);
        if (!agentErr && conversationReply) {
          const reply = String((agentRes as { reply?: string }).reply ?? "").trim();
          if (reply) {
            pushReply(reply);
            stopProgress();
            setAgentStep(null);
            setAiRunning(false);
            return;
          }
        }
        if (!agentErr && !conversationReply && agentRes && agentRes.files && Object.keys(agentRes.files).length > 0 && (agentRes.changed || JSON.stringify(agentRes.files) !== JSON.stringify(runFiles))) {
          // Trava de entrega do runtime: auditoria de interação não passou
          // (clique deixa tela preta) → NÃO salvar/entregar como concluído.
          const agentAny = agentRes as { interaction_blocked?: boolean; errors?: string[] };
          if (agentAny.interaction_blocked) {
            const blocked = agentAny.errors?.length ? agentAny.errors.slice(0, 3).join("; ") : "alguns cliques deixam a tela preta";
            pushReply(`⚠ Auditoria de interação bloqueou a entrega: ${blocked}. A alteração NÃO foi salva como concluída — continue me pedindo o ajuste que eu tento de novo.`);
            stopProgress();
            setAgentStep(null);
            setAiRunning(false);
            return;
          }
          // EVIDÊNCIA real de mudança (arquivos retornados diferem). Aplica no
          // preview ANTES de persistir — assim a edição nunca "some".
          setAiHistory((prev) => [{ spec: snapshot, files: runFiles }, ...prev].slice(0, 10));
          const derivedSpec = agentRes.spec ? normalizeSpec(agentRes.spec as SiteSpec | Record<string, unknown> | null) : draftSpec;
          setDraftSpec(derivedSpec);
          // FASE 7.2 — registra o valor anterior antes de aplicar o resultado REAL.
          recordRuntimeChange(draftFilesRef.current, agentRes.files, runtimeChangeRef.current);
          prevFilesRef.current = agentRes.files;
          setDraftFiles(agentRes.files);
          setPreviewNonce((n) => n + 1);
          const autosave = await persistAutosave(derivedSpec, agentRes.files, `Alteração via chat: ${displayText}`);
          const runtime = agentRes.runtime === "cline" ? "" : " (modo compatível)";
          let savedNote;
          if (autosave.ok && autosave.created) savedNote = "\n\n_(salvo no projeto.)_";
          else if (autosave.ok) savedNote = "";
          else savedNote = `\n\n⚠ Não foi possível salvar automaticamente: ${autosave.error || "erro desconhecido"}. Clique em Salvar para persistir.`;
          // FASE UX — NUNCA despejar detalhe técnico no chat. Se a alteração foi
          // aplicada mas a verificação final ficou pendente, uma nota humana curta
          // basta (o texto técnico continua nos payloads/logs internos).
          const pendingNote = agentRes.status === "error" && agentRes.changed
            ? "\n\n_Alteração aplicada; verificação final pendente._"
            : "";
          const changedKeys = Object.keys(agentRes.files).filter((p) => runFiles?.[p] !== agentRes.files?.[p]);
          pushReply(`${agentRes.reply?.trim() || `Arquivos atualizados (${(agentRes.touched ?? []).length}).${runtime}`}${savedNote}${pendingNote}`);
          stopProgress();
          setAgentStep(null);
          setAiRunning(false);
          return;
        }
        if (opts?.acceptReport && !agentErr && agentRes) {
          // Comando de análise (5.27): nenhuma mudança foi feita — esse é o
          // resultado correto. Nada é alterado, versionado nem salvo.
          const report = agentRes.reply?.trim();
          if (report) {
            pushReply(report);
            stopProgress();
            setAgentStep(null);
            setAiRunning(false);
            return;
          }
        }
        if (!agentErr && agentRes && agentRes.status === "error" && (agentRes.errors?.length ?? 0) > 0 && !agentRes.changed) {
          // Mostra a CAUSA REAL reportada pelo runtime (mensagem já humanizada lá);
          // a mensagem genérica fica apenas como último recurso.
          const real = String(agentRes.errors?.[0] ?? "").trim();
          pushReply(real || "⚠ Não consegui aplicar essa alteração no site — nada foi modificado. Me diga o que deseja de outro jeito (ou confira o nome/imagem exatos) que eu tento novamente.");
          stopProgress();
          setAgentStep(null);
          setAiRunning(false);
          return;
        }
        if (agentErr || !agentRes || !agentRes.files || (!Object.keys(agentRes.files).length && !String((agentRes as { reply?: string }).reply ?? "").trim())) {
          // PRINCÍPIO ABSOLUTO: sem IA validada comprovada → NÃO executa, e NÃO
          // há fallback para uma IA "padrão" (o fallback legado foi removido).
          const blocked = (agentRes as { blocked_reason?: string; blocked_code?: string } | undefined)?.blocked_reason;
          const reason = blocked
            ? blocked
            : agentErr
              // Erro REAL de rede/runtime: mensagem acionável (o que fazer agora).
              ? `O Agent Runtime não respondeu (${agentErr instanceof Error ? agentErr.message : "falha de rede"}). Verifique se o runtime está no ar e atualizado (local: npm run local · produção: redeploy no Railway) e tente de novo. Nada do seu site foi alterado.`
              : "Não foi possível executar com a IA validada (Agent Runtime indisponível ou falhou). Nenhuma IA padrão é usada — configure e valide a IA em Configurações e tente de novo.";
          pushReply(`⚠ ${reason}`);
          stopProgress();
          setAgentStep(null);
          setAiRunning(false);
          return;
        }
      }

      // REACT NUNCA usa o editor de spec (editSiteWithAI): o agente é o
      // ProspectorSiteAgent e ELE decide se conversa ou executa.
      // Se nada mudou, a RESPOSTA DA IA é o que o usuário deve ver (conversa, dúvida,
      // opinião…). Só usamos o aviso de "nada aplicado" quando o agente NÃO respondeu.
      if (isReactProject) {
        const agentReply = agentRes?.reply?.trim();
        pushReply(agentReply || "A instrução foi processada, mas nenhuma alteração de arquivo foi aplicada no projeto.");
        stopProgress();
        setAgentStep(null);
        setAiRunning(false);
        return;
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

      setAiHistory((prev) => [{ spec: snapshot, files: runFiles }, ...prev].slice(0, 10));
      const summary = describeChanges(snapshot, protectedSpec);
      // Preserva arquivos reais já existentes (código do Cline) quando houver;
      // senão materializa a partir da spec editada.
      const existingReal = runFiles && Object.keys(runFiles).length > 0 ? runFiles : null;
      const draftNow = existingReal ? { ...existingReal, ...materializeProjectFiles(protectedSpec) } : materializeProjectFiles(protectedSpec);
      const autosave = await persistAutosave(protectedSpec, draftNow, summary);
      setDraftSpec(protectedSpec);
      // Live preview de código: reflete o rascunho editado (código materializado).
      setDraftFiles((prev) => (prev && Object.keys(prev).length > 0 ? draftNow : draftNow));
      setPreviewNonce((n) => n + 1);
      const msg = [
        res.reply?.trim(),
        summary,
        autosave.ok
          ? (autosave.created ? "✓ Alterações salvas automaticamente" : "(sem mudança real — nada duplicado)")
          : `⚠ Não foi possível salvar automaticamente: ${autosave.error || "erro desconhecido"}. As alterações estão no editor.`,
      ].filter(Boolean).join(" ");
      pushReply(msg);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError" || (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        // Cancelamento real: NÃO envia falsa conclusão e preserva o que já veio.
        setAiError("Execução cancelada.");
        if (studioEnabled || isReactProject) studioChat.finish({ cancelled: true });
      } else {
        const msg = friendlyAiError(e);
        setAiError(msg);
        if (studioEnabled || isReactProject) studioChat.finish({ error: msg });
        setAiMessages((prev) => [...prev, { role: "assistant", text: msg }]);
      }
    } finally {
      aiAbortRef.current = null;
      stopProgress();
      setAgentStep(null);
      // FASE UX — o card "Executando agora" é transitório: some junto com a run.
      setLiveWork([]);
      if (studioEnabled || isReactProject) studioChat.finish();
      setAiRunning(false);
    }
  }

  // Comandos rápidos (5.27): cada botão dispara uma MISSÃO profissional completa
  // (analisar → decidir → executar → testar → criticar → corrigir → verificar)
  // construída pela camada de estratégias — SEMPRE pelo MESMO agente/autosave/
  // guards, nunca como prompt solto ou progresso falso.
  function runQuickStrategy(id: string) {
    if (!project || aiRunning) return;
    const strategy = strategyById(id);
    if (!strategy) return;
    const label = `${strategy.emoji} ${strategy.label}`;
    // strategy.id é StrategyId (validado por strategyById) — sem `as any`.
    const instruction = buildStrategyInstruction(strategy.id, {
      name: project.company_name || project.name,
      segment: project.segment,
    });
    void runAiInstruction(instruction, undefined, { displayText: label, acceptReport: strategy.analyzeOnly });
  }

  async function undoAi() {
    if (aiHistory.length === 0) return;
    const prevState = aiHistory[0] as { spec: SiteSpec; files?: Record<string, string> | null };
    setAiHistory((h) => h.slice(1));
    setDraftSpec(prevState.spec);
    setAiError(null);
    // Restaura o workspace real (arquivos) quando existia um snapshot de código.
    let restoredFiles: Record<string, string>;
    if (prevState.files && Object.keys(prevState.files).length > 0) {
      restoredFiles = prevState.files;
    } else {
      restoredFiles = materializeProjectFiles(prevState.spec);
    }
    prevFilesRef.current = restoredFiles;
    setDraftFiles(restoredFiles);
    setPreviewNonce((n) => n + 1);
    // Persiste a restauração real (draft), mantendo o histórico e as versões posteriores.
    try {
      if (project?.id) {
        await updateProjectSpec(project.id, prevState.spec, restoredFiles);
        setDirty(false);
      }
    } catch {
      setDirty(true);
    }
    const savedSpec = project ? normalizeSpec(project.spec as SiteSpec | Record<string, unknown> | null) : null;
    setDirty(!specsEqual(prevState.spec, savedSpec));
    setAiMessages((m) => [...m, { role: "assistant", text: "↶ Voltei para o estado anterior (conteúdo e código restaurados e salvos no editor)." }]);
  }

  // Fase 6/C4: checkpoint Git real (best-effort; NUNCA bloqueia o autosave).
  async function commitGitCheckpoint(filesToSave: Record<string, string>, summary?: string): Promise<void> {
    if (!project?.id || !(studioEnabled || isReactProject)) return;
    try {
      const res = await invokeStudioGit<{ ok: boolean; committed: boolean; short?: string; message?: string }>({
        action: "commit",
        projectId: project.id,
        userId: user?.id,
        files: filesToSave,
        summary,
        workspaceRevision: workspaceRevRef.current ?? undefined,
      });
      // O checkpoint Git continua sendo criado (histórico no diálogo de versões),
      // mas NÃO é mais exibido como item no chat da conversa.
    } catch {
      /* git indisponível não impede salvar */
    }
  }

  // C0 — autosave de projeto React: persiste SOMENTE o código (sem spec),
  // mantendo versionamento interno e checkpoint Git (mesmo fluxo do static).
  async function persistReactAutosave(
    filesToSave: Record<string, string>,
    summary?: string,
  ): Promise<{ ok: boolean; created: boolean; error?: string }> {
    if (!project?.id) return { ok: false, created: false, error: "Projeto não carregado." };
    // FASE 7.2 — SNAPSHOT ANTIGO nunca sobrescreve trabalho mais novo do runtime:
    // se algum arquivo que o agente mudou voltaria ao valor anterior, não grava.
    const stale = detectStaleSnapshot(filesToSave, runtimeChangeRef.current);
    if (stale.stale) {
      const msg = `snapshot antigo ignorado (protege ${stale.revertedFiles.slice(0, 3).join(", ")})`;
      console.warn("[autosave:react] " + msg);
      return { ok: false, created: false, error: msg };
    }
    const hasFiles = !!filesToSave && Object.keys(filesToSave).length > 0;
    try {
      if (hasFiles) await updateGeneratedCode(project.id, filesToSave);
      setProject((p) => (p && hasFiles ? { ...p, generated_code: filesToSave as never } : p));
      if (!user?.id) return { ok: true, created: false };
      const created = await createSiteVersion(project.id, user.id, {} as SiteSpec, summary ?? "Alteração no app React", hasFiles ? filesToSave : undefined).catch(() => false);
      if (created) {
        setDirty(false);
        setPendingSummary(undefined);
        void commitGitCheckpoint(filesToSave, summary);
      }
      return { ok: true, created };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[autosave:react] falhou", error);
      return { ok: false, created: false, error };
    }
  }

  // AUTOSAVE (5.24): persiste o estado REAL (spec + arquivos) e cria versão
  // somente quando houve mudança real. NUNCA lança: retorna { ok, created, error }.
  async function persistAutosave(
    specToSave: SiteSpec,
    filesToSave: Record<string, string>,
    summary?: string,
  ): Promise<{ ok: boolean; created: boolean; error?: string }> {
    if (!project?.id) return { ok: false, created: false, error: "Projeto não carregado." };
    // DEFESA: strings com NUL nunca vão ao banco. Assets binários chegam do runtime
    // como DATA URL (ASCII/base64) e PRECISAM ser salvos — senão o arquivo não
    // aparece na árvore do projeto (regra por CONTEÚDO, não por extensão).
    const safeFiles: Record<string, string> = {};
    for (const [p, c] of Object.entries(filesToSave ?? {})) {
      if (typeof c !== "string") continue;
      if (c.includes("\u0000")) continue;
      safeFiles[p] = c;
    }
    if (isReactProject) return persistReactAutosave(safeFiles, summary);
    const hasFiles = Object.keys(safeFiles).length > 0;
    try {
      await updateProjectSpec(project.id, specToSave, hasFiles ? safeFiles : undefined);
      // Sincroniza o estado local com o que foi salvo (para reload não perder).
      setProject((p) => (p ? { ...p, spec: specToSave as never, generated_code: hasFiles ? safeFiles as never : p.generated_code } : p));
      if (!user?.id) return { ok: true, created: false };
      const created = await createSiteVersion(project.id, user.id, specToSave, summary, hasFiles ? safeFiles : undefined).catch(() => false);
      if (created) {
        setDirty(false);
        setPendingSummary(undefined);
        // Fase 6: registra um checkpoint Git por mudança real (assíncrono).
        void commitGitCheckpoint(safeFiles, summary);
      }
      return { ok: true, created };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[autosave] falhou", error);
      return { ok: false, created: false, error };
    }
  }

  const prevFilesRef = useRef<Record<string, string> | null>(null);
  // C2: controller da execução atual (cancelamento real).
  const aiAbortRef = useRef<AbortController | null>(null);
  // C6: última execução (para retry sem duplicar mensagens).
  const lastRunRef = useRef<{ instruction: string; attachment?: Array<{ dataUrl: string; label: string }>; displayText: string } | null>(null);
  function cancelAi() {
    aiAbortRef.current?.abort();
  }
  function handleRetry() {
    const last = lastRunRef.current;
    if (!last || aiRunning) return;
    setAiError(null);
    void runAiInstruction(last.instruction, last.attachment, { displayText: last.displayText, silent: true });
  }

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

  // ===== Site Studio (DaveLovable-like) — Fase 1 (shell/UI) =====
  // A flag mantém o layout legado disponível como fallback enquanto as fases
  // 2–4 (agente/preview/editor) não estão 100% prontas.
  const studioEnabled = useMemo(() => isStudioUiEnabled(), []);

  // C0: tipo do projeto. `react` = nova experiência (WebContainer); `static` = legado.
  const projectKind = useMemo(() => projectKindOf(project), [project]);
  const isReactProject = projectKind === "react";

  // Projeto React entra em modo edição automaticamente (não depende de spec).
  useEffect(() => {
    if (isReactProject && !editMode) setEditMode(true);
  }, [isReactProject, editMode]);

  // Stream do Studio (Fase 2): Router/Planner/Coder + thoughts + tools agrupados.
  const studioChat = useStudioChat();

  // FASE 2 — revisão do workspace que este cliente possui (recebida do runtime).
  // Enviada em /run, /build e /git: se estiver atrasada, o runtime ignora o
  // snapshot e mantém o estado mais novo (evita "A sobrescrever B").
  const workspaceRevRef = useRef<number | null>(null);
  // FASE 7.2 — espelho do draft atual (leitura segura dentro de handlers) e o mapa
  // de "valor anterior" dos arquivos que o runtime mudou (guarda do autosave).
  const draftFilesRef = useRef<Record<string, string>>({});
  const runtimeChangeRef = useRef<RuntimeChangeMap>(new Map());
  useEffect(() => { draftFilesRef.current = draftFiles ?? {}; }, [draftFiles]);

  // FASE 1 (sem automação): abrir um projeto NÃO dispara geração. O cadastro do
  // cliente é contexto; a PRIMEIRA geração (e qualquer alteração) só acontece
  // quando o usuário pede no chat ("gere o site para a minha empresa..."). Uma
  // saudação ("oi, boa tarde") conversa e nunca vira geração.
  // O `briefing.user_prompt` continua sendo usado como texto do pedido quando o
  // usuário pedir a geração no chat (ver handleGeneratePrompt abaixo).

  // FASE 7.2 — AÇÃO EXPLÍCITA do usuário quando o projeto está no RASCUNHO.
  // Usa o MESMO fluxo do chat (runAiInstruction → /run com projectKind react), que
  // roda o agente em modo `generate` porque o projeto ainda é bootstrap. Não é
  // kickoff automático: só acontece quando o usuário clica.
  async function handleGenerateSite() {
    // FASE 7.11 — clique NUNCA é silencioso: se já está trabalhando, o usuário é
    // avisado (antes o clique simplesmente não fazia nada e parecia "botão morto").
    if (!project) { toast.error("Projeto ainda não carregou. Tente novamente em instantes."); return; }
    if (aiRunning || generating) { toast.info("Já estou trabalhando neste site — acompanhe no chat."); return; }
    const nome = project.company_name || project.name || "minha empresa";
    const seg = project.segment ? ` (${project.segment})` : "";
    const prompt = `Crie o site real de ${nome}${seg} agora, substituindo o rascunho inicial pelos arquivos reais do site — use os dados, as fotos e a direção criativa deste cliente.`;
    toast.info("Gerando o site com o agente… acompanhe no chat.");
    await runAiInstruction(prompt, undefined, { media: true });
  }

  // GERAÇÃO IMEDIATA (rascunho): projeto React que ainda é o RASCUNHO não fica esperando um
  // segundo clique — ao entrar, a geração começa sozinha. Cobre TODAS as entradas (clique em
  // "Gerar site" no Lead, criação com prompt e abrir o projeto). Dispara UMA vez e só quando
  // há rascunho real e nada rodando — o card "Gerar site" do preview deixou de existir.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current) return;
    if (!project || !isReactProject) return;
    if (aiRunning || generating) return;
    if (!isBootstrapFiles(draftFiles)) return;
    autoStartRef.current = true;
    void handleGenerateSite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, draftFiles, aiRunning, generating, isReactProject]);

  function handleStudioEvent(event: StudioStreamEvent) {
    studioChat.handleEvent(event);
    // FASE 2 — revisão do workspace (source of truth): o runtime devolve em cada
    // evento e nós a devolvemos nas próximas chamadas; snapshot antigo é ignorado.
    const rev = (event as unknown as { workspace_rev?: number }).workspace_rev;
    if (typeof rev === "number") workspaceRevRef.current = rev;
    if (event.type === "files_ready") {
      const files = (event as StudioFilesReadyEvent).files;
      if (files && Object.keys(files).length > 0) {
        // FASE 7.2 — guarda do autosave: registra o valor ANTERIOR dos arquivos que
        // o runtime acabou de mudar (snapshot antigo nunca devolve o rascunho).
        recordRuntimeChange(draftFilesRef.current, files, runtimeChangeRef.current);
        // O agente alterou o workspace: o editor/Preview refletem na hora.
        prevFilesRef.current = files;
        setDraftFiles(files);
      }
    } else if (event.type === "reload_preview") {
      setPreviewNonce((n) => n + 1);
    }
  }

  function handleStudioFilesChange(nextFiles: Record<string, string>) {
    prevFilesRef.current = nextFiles;
    setDraftFiles(nextFiles);
    setPreviewNonce((n) => n + 1);
    setDirty(true);
  }

  async function handleStudioSave(nextFiles: Record<string, string>) {
    setSaving(true);
    try {
      const res = await persistAutosave(draftSpec, nextFiles, pendingSummary);
      if (!res.ok) {
        toast.error(res.error || "Erro ao salvar alterações");
        return;
      }
      prevFilesRef.current = nextFiles;
      setDraftFiles(nextFiles);
      setPreviewNonce((n) => n + 1);
      toast.success(res.created ? "✓ Alterações salvas" : "Alterações salvas");
      setDirty(false);
      await load();
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
  // C0: projeto React entra direto no Studio (sem spec) e ocupa a tela cheia.
  const hasContent = hasSpec || isReactProject;
  const inStudioFlow = (editMode || isReactProject) && (studioEnabled || isReactProject);

  return (
    <div className={inStudioFlow ? "flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden" : editMode ? "p-4 lg:p-6" : "p-6 lg:p-8 max-w-7xl mx-auto space-y-6"}>
      {versionsOpen && project && (
        <SiteVersionsDialog projectId={project.id} onClose={() => setVersionsOpen(false)} onRestore={handleRestoreFromVersion} />
      )}
      {(studioEnabled || isReactProject) && project && (
        <StudioHistoryDialog
          open={gitHistoryOpen}
          projectId={project.id}
          userId={user?.id}
          files={draftFiles ?? {}}
          dirty={dirty}
          blockedReason={studioUnsaved ? "Salve as alterações do editor antes de restaurar." : undefined}
          busy={saving}
          onClose={() => setGitHistoryOpen(false)}
          onRestore={(files, meta) => handleRestoreGit(files, meta)}
          onOpenInternalVersions={() => { setGitHistoryOpen(false); setVersionsOpen(true); }}
          onOpenFile={(file, line) => { setGitHistoryOpen(false); requestOpenFile(file, line); }}
        />
      )}
      {project && projectLead && (
        <ProposalWhatsAppDialog
          lead={projectLead}
          open={proposalOpen}
          onOpenChange={setProposalOpen}
          projectSite={{ slug: project.slug ?? null, status: project.status ?? null }}
        />
      )}
      <div>
        <Link to="/sites" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1 transition-colors duration-150">
          <ArrowLeft className="h-3 w-3" /> Sites
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight flex items-center gap-2 flex-wrap">
              <Globe className="h-5 w-5 text-primary" /> {project.name}
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {project.company_name || project.name}
              {[project.segment, project.city && project.state ? `${project.city}/${project.state}` : project.city].filter(Boolean).length > 0 && (
                <> · {[project.segment, project.city && project.state ? `${project.city}/${project.state}` : project.city].filter(Boolean).join(" · ")}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{statusLabel(project.status)}</Badge>
            {editMode && (studioEnabled || isReactProject) && (
              <StudioDeviceSwitcher value={previewDevice} onChange={setPreviewDevice} />
            )}
            {(studioEnabled || isReactProject) ? (
              // Ações comerciais no TOPO: libera a área do preview (Sem "Salvar",
              // sem seletor duplicado embaixo).
              <StudioCommercialBar
                commercial={{
                  onProposalPdf: handlePdf,
                  onDownloadZip: handleZip,
                  onGenerateVideo: handleGenerateVideo,
                  onWhatsApp: () => setProposalOpen(true),
                  onPublish: handlePublish,
                  onUnpublish: handleUnpublish,
                  publishing,
                  unpublishing,
                  busyAction,
                  generatingVideo,
                  canPublish: isReactProject || hasSpec,
                  canUnpublish: project.published_status === "published",
                  canWhatsApp: !!projectLead?.whatsapp,
                  canVideo: !!draftFiles && Object.keys(draftFiles).some((p) => p.endsWith("index.html")),
                  onBuild: () => { void handleBuild(); },
                  building,
                  canBuild: isReactProject,
                  publishedUrl: project.published_status === "published" ? publicUrl() : null,
                  onCopyLink: copyPublicLink,
                  githubSlot: <StudioGitConfigDialog projectId={project.id} userId={user?.id} />,
                  integrationsSlot: <StudioIntegrationsButtons />,
                }}
                onOpenHistory={() => (studioEnabled || isReactProject ? setGitHistoryOpen(true) : setVersionsOpen(true))}
                // FASE 7.9 — "Gerar site" no TOPO para projeto React em rascunho:
                // mesmo fluxo do botão do preview (agente, modo generate).
                onGenerateSite={isReactProject && isBootstrapFiles(draftFiles) ? handleGenerateSite : undefined}
                generatingSite={isReactProject ? aiRunning : generating}
              />
            ) : (
              <>
                {hasSpec && (
                  <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)} title="Histórico de versões">
                    <HistoryIcon className="h-3.5 w-3.5 mr-1" /> Histórico
                  </Button>
                )}
                {editMode ? (
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar site
                  </Button>
                ) : (
                  /* FASE 7.8 — REACT: o botão do topo chama o AGENTE (mesmo fluxo do
                     botão no preview). Antes chamava generate() (spec legado) e nada
                     acontecia de verdade no projeto React. */
                  <Button onClick={isReactProject ? handleGenerateSite : generate} disabled={isReactProject ? (aiRunning || generating) : generating} size="sm">
                    {(isReactProject ? aiRunning : generating) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    {isReactProject
                      ? (isBootstrapFiles(draftFiles) ? "Gerar site" : "Regenerar site")
                      : (hasSpec ? "Regenerar com IA" : "Gerar site com IA")}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {hasSpec && !studioEnabled && project.published_status === "published" && project.slug && (
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
            <Button size="sm" variant="outline" onClick={() => setProposalOpen(true)} disabled={!projectLead?.whatsapp}
              title={projectLead?.whatsapp ? `Enviar proposta pelo WhatsApp (${projectLead.whatsapp})` : "Indisponível: lead sem WhatsApp comprovado"}>
              <Send className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Enviar proposta pelo WhatsApp
            </Button>
          </div>
        </Card>
      )}
      {hasSpec && !studioEnabled && project.published_status !== "published" && (
        <Card className="p-3.5 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-primary/5">
          <div>
            <p className="text-sm font-semibold">Publicação</p>
            <p className="text-xs text-muted-foreground">Ao publicar, esta versão fica disponível na URL pública. Alterações futuras exigem nova publicação.</p>
          </div>
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Rocket className="h-3.5 w-3.5 mr-1" />} Publicar site
          </Button>
          <Button size="sm" variant="outline" onClick={() => setProposalOpen(true)} disabled={!projectLead?.whatsapp}
            title={projectLead?.whatsapp ? `Enviar proposta pelo WhatsApp (${projectLead.whatsapp})` : "Indisponível: lead sem WhatsApp comprovado"}>
            <Send className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Enviar proposta pelo WhatsApp
          </Button>
        </Card>
      )}

      {hasSpec && !studioEnabled && (
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
            <GitHubProjectButton projectId={project.id} userId={user?.id} />
            <StudioIntegrationsButtons />
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
                <span className="ml-auto text-xs font-mono text-muted-foreground">{genElapsed}s</span>
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

      {!hasContent ? (
        <Card className="p-12 text-center border-dashed border-border/60 bg-gradient-to-br from-card to-card/40">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display font-semibold text-lg">Projeto em rascunho</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Clique em <strong>Gerar site com IA</strong> para analisar o negócio e criar a especificação estruturada (design, conteúdo, seções e SEO) deste projeto.
          </p>
        </Card>
      ) : (editMode || isReactProject) ? (
        (studioEnabled || isReactProject) ? (
          <div className="min-h-0 flex-1">
            <StudioShell
            projectName={project.name}
            projectSubtitle={project.company_name || project.name}
            statusLabel={statusLabel(project.status)}
            files={draftFiles ?? {}}
            projectId={project.id}
            projectKind={projectKind}
            onFilesChange={handleStudioFilesChange}
            onSaveFiles={handleStudioSave}
            dirty={dirty}
            saving={saving}
            previewRefreshKey={previewNonce}
            previewDevice={previewDevice}
            onPreviewDeviceChange={setPreviewDevice}
            previewFallback={isReactProject ? undefined : <SitePreview spec={draftSpec as SiteSpec | Record<string, unknown> | null} />}
            onGenerateSite={isReactProject ? handleGenerateSite : undefined}
            chat={{
              messages: aiMessages,
              running: aiRunning,
              error: aiError,
              canUndo: aiHistory.length > 0,
              dirty,
              runningLabel: aiRunning && agentStep !== null && EDIT_STEPS[agentStep] ? EDIT_STEPS[agentStep].label : undefined,
              liveActivity: aiRunning ? liveWork : undefined,
              stream: studioChat,
              onApply: runAiInstruction,
              onRevert: undoAi,
              onQuickStrategy: runQuickStrategy,
              onNewConversation: startNewConversation,
              onCancel: cancelAi,
              onRetry: handleRetry,
            }}
            openFileRequest={openFileRequest}
            onApplyWithFiles={(instruction, attachment, files) => { void runAiInstruction(instruction, attachment, { files }); }}
            onUnsavedChange={setStudioUnsaved}
            engineLabel={draftFiles && Object.keys(draftFiles).length > 0 ? "Cline Agent · código real" : "modo compatível"}
            />
          </div>
        ) : (
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
              onQuickStrategy={runQuickStrategy}
              onNewConversation={startNewConversation}
              runningLabel={aiRunning && agentStep !== null && EDIT_STEPS[agentStep] ? EDIT_STEPS[agentStep].label : undefined}
              liveActivity={aiRunning ? liveWork : undefined}
            />
          </div>
          <div className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-display font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Preview ao vivo
              </h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">As alterações confirmadas são salvas automaticamente — use ↶ Voltar para reverter</span>
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
        )
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
