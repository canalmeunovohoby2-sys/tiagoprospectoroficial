import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { StatusBar } from "./StatusBar";
import { StudioChatPanel, type StudioChatPanelProps } from "./StudioChatPanel";
import { StudioCodeEditor } from "./StudioCodeEditor";
import { StudioEditorTabs } from "./StudioEditorTabs";
import { StudioFileExplorer } from "./StudioFileExplorer";
import { StudioPreviewPanel } from "./StudioPreviewPanel";
import { StudioToolbar } from "./StudioToolbar";
import { StudioVisualEditorPanel, type VisualEditOutcome } from "./StudioVisualEditorPanel";
import { deleteFilePath, createFilePath, renameFilePath, mergeEffectiveFiles, computeDirtyPaths, baseName, languageForPath } from "@/lib/studio/fileTree";
import { resolveElementSource, buildVisualAgentInstruction } from "@/lib/studio/sourceMap";
import { applyVisualEdit, verifyVisualEdit, type VisualEditPlan, type VisualEditTarget } from "@/lib/studio/visualEdit";
import { invokeVisualEdit } from "@/lib/studio/visualEditApi";
import type { StudioElementDescriptor } from "@/lib/studio/bridgeProtocol";
import type { StudioDevice, StudioFileMap, StudioSelection, StudioTab, StudioView } from "@/lib/studio/types";

export interface StudioShellProps {
  projectName: string;
  projectSubtitle?: string;
  statusLabel?: string;
  /** Arquivos fonte (generated_code/draft do projeto). */
  files: StudioFileMap;
  /** Atualiza o estado do projeto em memória (preview ao vivo) sem persistir. */
  onFilesChange: (files: StudioFileMap) => void;
  /** Persiste o mapa efetivo (com edições não salvas). */
  onSaveFiles: (files: StudioFileMap) => Promise<void> | void;
  dirty: boolean;
  saving: boolean;
  previewRefreshKey?: string | number;
  previewFallback?: ReactNode;
  /** Device CONTROLADO do preview (barra do projeto: Desktop/Tablet/Mobile). */
  previewDevice?: StudioDevice;
  onPreviewDeviceChange?: (device: StudioDevice) => void;
  /** FASE 7.2 — ação explícita "Gerar site" (projeto em rascunho). */
  onGenerateSite?: () => void;
  /** Projeto (para o preview React/WebContainer — C0). */
  projectId?: string;
  /** `static` (legado, srcDoc) ou `react` (C0, WebContainer). */
  projectKind?: "static" | "react";
  /** C4: pedido de abrir arquivo/linha no Monaco (histórico/diff). */
  openFileRequest?: { file: string; line?: number; nonce: number } | null;
  chat: StudioChatPanelProps;
  /**
   * Envia a instrução ao agente JUNTO com o estado ATUAL do editor (rascunhos
   * não salvos inclusos) — evita que o agente trabalhe sobre uma cópia antiga.
   */
  onApplyWithFiles?: (instruction: string, attachment: { dataUrl: string; label: string } | undefined, files: StudioFileMap) => void;
  /** Informa ao container se há alterações não salvas no editor (rascunhos). */
  onUnsavedChange?: (dirty: boolean) => void;
  engineLabel?: string;
}

function planToVisualRequest(plan: VisualEditPlan): string {
  if (plan.kind === "text") return `Altere o texto do elemento selecionado para: "${plan.text ?? ""}"`;
  if (plan.kind === "attribute" && plan.attribute) {
    return `Altere o atributo "${plan.attribute.name}" do elemento selecionado para: "${plan.attribute.value}"`;
  }
  return `Aplique no elemento selecionado: ${(plan.changes ?? []).map((c) => `${c.property}: ${c.value}`).join("; ")}`;
}

export function StudioShell({
  projectName,
  projectSubtitle,
  statusLabel,
  files,
  onFilesChange,
  onSaveFiles,
  dirty,
  saving,
  previewRefreshKey,
  previewFallback,
  previewDevice: previewDeviceProp,
  onPreviewDeviceChange,
  onGenerateSite,
  projectId,
  projectKind,
  openFileRequest,
  chat,
  onApplyWithFiles,
  onUnsavedChange,
  engineLabel,
}: StudioShellProps) {
  const [activeView, setActiveView] = useState<StudioView>("preview");
  const [visualMode, setVisualMode] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [selection, setSelection] = useState<StudioSelection | null>(null);
  const [localPreviewNonce, setLocalPreviewNonce] = useState(0);
  const [previewDeviceState, setPreviewDeviceState] = useState<StudioDevice>("desktop");
  // CONTROLADO pela barra do projeto quando fornecido; senão, interno.
  const previewDevice = previewDeviceProp ?? previewDeviceState;
  const setPreviewDevice = (d: StudioDevice) => { setPreviewDeviceState(d); onPreviewDeviceChange?.(d); };
  const [visualOutcome, setVisualOutcome] = useState<VisualEditOutcome | null>(null);
  const [applyingVisual, setApplyingVisual] = useState(false);

  const sortedPaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b, "pt-BR")), [files]);

  // Fonte ÚNICA: arquivos persistidos + rascunhos do editor (overrides). O merge
  // descarta override de arquivo removido e override igual ao salvo.
  const effectiveFiles = useMemo<StudioFileMap>(() => mergeEffectiveFiles(files, pendingEdits), [files, pendingEdits]);

  const dirtyPaths = useMemo(() => computeDirtyPaths(pendingEdits, files), [pendingEdits, files]);

  // Auto-seleciona index.html (ou o primeiro arquivo) quando necessário.
  useEffect(() => {
    if (selectedPath && files[selectedPath] !== undefined) return;
    const fallback = sortedPaths.find((p) => p === "index.html")
      ?? sortedPaths.find((p) => p.endsWith("/index.html"))
      ?? sortedPaths[0]
      ?? null;
    setSelectedPath(fallback);
    if (fallback) setTabs((prev) => (prev.includes(fallback) ? prev : [...prev, fallback]));
  }, [sortedPaths, selectedPath, files]);

  const openFile = (path: string) => {
    setSelectedPath(path);
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
  };

  // C4: abrir arquivo/linha no Monaco a partir do histórico/diff.
  useEffect(() => {
    const req = openFileRequest;
    if (!req || effectiveFiles[req.file] === undefined) return;
    openFile(req.file);
    if (req.line && req.line > 0) setCursor({ line: req.line, column: 1 });
    setActiveView((v) => (v === "preview" ? "split" : v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFileRequest?.nonce]);

  const closeTab = (path: string) => {
    setTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      if (selectedPath === path) setSelectedPath(next.length ? next[next.length - 1] : null);
      return next;
    });
  };

  const handleFileChange = (path: string, content: string) => {
    setPendingEdits((prev) => ({ ...prev, [path]: content }));
  };

  const applyStructural = (updater: (map: StudioFileMap) => StudioFileMap) => {
    const next = updater(effectiveFiles);
    setPendingEdits({});
    onFilesChange(next);
  };

  const handleCreate = (path: string) => {
    applyStructural((map) => createFilePath(map, path));
    openFile(path);
  };

  const handleRename = (oldPath: string, newPath: string) => {
    applyStructural((map) => renameFilePath(map, oldPath, newPath));
    if (selectedPath === oldPath) setSelectedPath(newPath);
    setTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
  };

  const handleDelete = (path: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Excluir "${path}"? Esta ação remove o arquivo do projeto.`)) return;
    applyStructural((map) => deleteFilePath(map, path));
    if (selectedPath === path) setSelectedPath(null);
    closeTab(path);
  };

  const handleSave = async () => {
    const next = effectiveFiles;
    await onSaveFiles(next);
    setPendingEdits({});
  };

  // Ctrl/Cmd+S salva o MESMO estado do botão Salvar (não duplica autosave/versão).
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // O agente recebe o estado ATUAL do editor (rascunhos não salvos inclusos).
  const chatWithFiles = useMemo<StudioChatPanelProps>(() => ({
    ...chat,
    onApply: (instruction, attachment) => {
      if (onApplyWithFiles) onApplyWithFiles(instruction, attachment, effectiveFiles);
      else chat.onApply(instruction, attachment);
    },
  }), [chat, effectiveFiles, onApplyWithFiles]);

  // Fase 4/C3: seleção no preview → descritor → source map → seleção do Studio.
  const handleElementSelected = (element: StudioElementDescriptor) => {
    const sourceLocation = resolveElementSource(effectiveFiles, element);
    setSelection({
      selector: element.selector,
      tagName: element.tagName,
      text: element.text,
      id: element.id,
      classes: element.classes,
      attributes: element.attributes,
      path: element.path,
      rect: element.rect,
      source: element.pfsrc ?? (element.reactSource?.file ? `${element.reactSource.file}${element.reactSource.line ? `:${element.reactSource.line}` : ""}` : undefined),
      componentName: element.reactSource?.componentName,
      sourceLocation,
    });
    setVisualMode(true);
  };

  const handleSelectionCleared = () => setSelection(null);

  const handleOpenSource = (file: string, line?: number) => {
    if (effectiveFiles[file] === undefined) return;
    openFile(file);
    if (line && line > 0) setCursor({ line, column: 1 });
    setActiveView((v) => (v === "preview" ? "split" : v));
  };

  // Fase 5/C3: edição direta não aplicável → Coder com contexto estruturado.
  const routeVisualToAgent = (snapshot: StudioSelection, plan: VisualEditPlan, target: VisualEditTarget, note?: string) => {
    const instruction = buildVisualAgentInstruction({
      selection: {
        selector: snapshot.selector,
        tagName: snapshot.tagName,
        text: snapshot.text,
        classes: snapshot.classes,
        attributes: snapshot.attributes,
        rect: snapshot.rect,
        sourceLocation: snapshot.sourceLocation,
        componentName: snapshot.componentName,
      },
      request: planToVisualRequest(plan),
      device: previewDevice,
      scope: target.scope,
      changes: (plan.changes ?? []).map((c) => ({ property: c.property, value: c.value })),
    });
    chatWithFiles.onApply(instruction);
    setVisualOutcome({ ok: false, message: `${note ?? "Edição direta não aplicável."} Encaminhado ao Coder.` });
  };

  // C3: React → `/visual-edit` determinístico; se não for inequívoco, Coder (C1).
  const handleApplyVisualReact = async (plan: VisualEditPlan, target: VisualEditTarget) => {
    if (!selection || !projectId) return;
    const resolvedFile = selection.sourceLocation?.status === "resolved" ? selection.sourceLocation.file : undefined;
    const res = await invokeVisualEdit({
      projectId,
      projectKind: "react",
      files: effectiveFiles,
      file: resolvedFile ?? selection.source,
      line: selection.sourceLocation?.line,
      selector: target.selector,
      tagName: target.tagName,
      classes: target.classes,
      text: plan.kind === "text" ? selection.text : undefined,
      newText: plan.kind === "text" ? plan.text : undefined,
      changes: plan.kind === "style" ? (plan.changes ?? []) : undefined,
      scope: target.scope,
    });
    if (!res.ok) {
      setVisualOutcome({ ok: false, message: res.error ?? "Falha na edição visual." });
      return;
    }
    if (res.applied && res.files) {
      setApplyingVisual(true);
      try {
        await onSaveFiles(res.files);
        setVisualOutcome({ ok: true, message: `Alteração aplicada direto no código (${res.mode ?? "determinístico"}).` });
      } finally {
        setApplyingVisual(false);
      }
      return;
    }
    routeVisualToAgent(selection, plan, target, res.reason ?? "Edição direta não segura.");
  };

  // Closed-loop: aplica → salva (filesystem) → preview re-renderiza → verifica
  // no ARQUIVO final; se algo falha, encaminha ao Coder.
  const handleApplyVisual = async (plan: VisualEditPlan, target: VisualEditTarget) => {
    if (!selection) return;
    setVisualOutcome(null);
    if (projectKind === "react") {
      await handleApplyVisualReact(plan, target);
      return;
    }
    const result = applyVisualEdit(effectiveFiles, target, plan);
    if (!result.ok || !result.files) {
      routeVisualToAgent(selection, plan, target, result.reason);
      return;
    }
    const verification = verifyVisualEdit(result.files, target, plan, result);
    if (!verification.ok) {
      routeVisualToAgent(selection, plan, target, `Verificação falhou (${verification.detail}).`);
      return;
    }
    setApplyingVisual(true);
    try {
      await onSaveFiles(result.files);
      setVisualOutcome({ ok: true, message: `${verification.detail} · modo: ${result.mode ?? "direto"}.` });
    } finally {
      setApplyingVisual(false);
    }
  };

  const globalDirty = dirty || dirtyPaths.length > 0;

  // Informa o container sobre alterações não salvas no editor (bloqueia restore).
  useEffect(() => {
    onUnsavedChange?.(globalDirty);
  }, [globalDirty, onUnsavedChange]);
  const tabItems: StudioTab[] = tabs
    .filter((p) => effectiveFiles[p] !== undefined)
    .map((p) => ({ path: p, name: baseName(p), dirty: dirtyPaths.includes(p) }));

  const showCode = activeView === "code" || activeView === "split";
  const showPreview = activeView === "preview" || activeView === "split";
  const showFiles = showExplorer && showCode && sortedPaths.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <ResizablePanelGroup id="studio-main" direction="horizontal" autoSaveId="studio-main-layout" className="min-h-0 flex-1">
        {showChat && (
          <>
            <ResizablePanel id="studio-chat" order={1} defaultSize={22} minSize={16} maxSize={30} className="min-w-0">
              <div className="relative h-full min-h-0 p-1.5">
                <StudioChatPanel
                  {...chatWithFiles}
                  projectKind={projectKind}
                  visualMode={visualMode}
                  onToggleVisual={() => { setVisualMode((v) => !v); setSelection(null); }}
                />
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg border border-border/50 bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground"
                  title="Ocultar chat"
                  aria-label="Ocultar chat"
                >
                  <PanelLeftOpen className="h-4 w-4 rotate-180" />
                </button>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel id="studio-main" order={2} defaultSize={showChat ? 68 : 100} className="min-w-0">
          <div className="relative flex h-full flex-col">
            {!showChat && (
              <button
                type="button"
                onClick={() => setShowChat(true)}
                className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-r-lg border border-border/50 bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground"
                title="Mostrar chat"
                aria-label="Mostrar chat"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <StudioToolbar
              activeView={activeView}
              onViewChange={setActiveView}
              visualMode={visualMode}
              onToggleVisual={() => { setVisualMode((v) => !v); setSelection(null); }}
              onReloadPreview={() => setLocalPreviewNonce((n) => n + 1)}
            />

            {/* Abas de código SÓ quando existe código na tela (code/split). Em
                Preview puro a faixa de abas só consumia altura do site. Abrir um
                arquivo muda para split (openFile), então as abas reaparecem. */}
            {showCode && (
              <StudioEditorTabs
                tabs={tabItems}
                activePath={selectedPath}
                onSelect={openFile}
                onClose={closeTab}
                onSave={handleSave}
                saving={saving}
                dirty={globalDirty}
              />
            )}

            <div className="relative min-h-0 flex-1">
              <ResizablePanelGroup id="studio-code-preview" direction="horizontal" autoSaveId="studio-code-preview-layout" className="h-full">
                {showFiles && (
                  <>
                    <ResizablePanel id="studio-explorer" order={1} defaultSize={14} minSize={10} maxSize={28} className="min-w-0 border-r border-border/60">
                      <StudioFileExplorer
                        files={effectiveFiles}
                        selectedPath={selectedPath}
                        dirtyPaths={dirtyPaths}
                        onSelect={openFile}
                        onCreate={handleCreate}
                        onRename={handleRename}
                        onDelete={handleDelete}
                      />
                    </ResizablePanel>
                    <ResizableHandle />
                  </>
                )}

                {showCode && (
                  <ResizablePanel id="studio-code" order={2} defaultSize={activeView === "split" ? 50 : showFiles ? 82 : 100} className="min-w-0">
                    <StudioCodeEditor
                      path={selectedPath}
                      value={selectedPath ? effectiveFiles[selectedPath] ?? "" : ""}
                      onChange={handleFileChange}
                      onCursorChange={setCursor}
                    />
                  </ResizablePanel>
                )}

                {activeView === "split" && <ResizableHandle withHandle />}

                {showPreview && (
                  <ResizablePanel id="studio-preview" order={3} defaultSize={activeView === "split" ? 50 : 100} className="min-w-0">
                    <StudioPreviewPanel
                      files={effectiveFiles}
                      refreshKey={`${previewRefreshKey ?? ""}:${localPreviewNonce}`}
                      fallback={previewFallback}
                      projectId={projectId}
                      projectKind={projectKind}
                      device={previewDevice}
                      bridgeEnabled
                      inspectMode={visualMode}
                      onElementSelected={handleElementSelected}
                      onSelectionCleared={handleSelectionCleared}
                      onViewportChange={setPreviewDevice}
                      onGenerateSite={onGenerateSite}
                    />
                  </ResizablePanel>
                )}
              </ResizablePanelGroup>

              <StudioVisualEditorPanel
                open={visualMode}
                selection={selection}
                onClose={() => { setVisualMode(false); setSelection(null); }}
                onApplyVisual={(plan, target) => { void handleApplyVisual(plan, target); }}
                onAskAgent={(instruction) => {
                  if (!selection) { chatWithFiles.onApply(instruction); return; }
                  const structured = buildVisualAgentInstruction({
                    selection: {
                      selector: selection.selector,
                      tagName: selection.tagName,
                      text: selection.text,
                      classes: selection.classes,
                      attributes: selection.attributes,
                      rect: selection.rect,
                      sourceLocation: selection.sourceLocation,
                      componentName: selection.componentName,
                    },
                    request: instruction,
                    device: previewDevice,
                  });
                  chatWithFiles.onApply(structured);
                }}
                onOpenSource={handleOpenSource}
                editOutcome={visualOutcome}
                applying={applyingVisual}
                device={previewDevice}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StatusBar
        filesCount={sortedPaths.length}
        activePath={selectedPath}
        line={cursor.line}
        column={cursor.column}
        language={selectedPath ? languageForPath(selectedPath) : undefined}
        dirty={globalDirty}
        saving={saving}
        engineLabel={engineLabel}
      />
    </div>
  );
}
