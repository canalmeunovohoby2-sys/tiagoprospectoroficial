import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { BrandingStudio } from "@/components/app/BrandingStudio";
import { toBrandView, type BrandSnapshotLike } from "@/lib/brandingView";
import { toMockupView, type MockupView } from "@/lib/mockupView";
import { toBrandPdfView, type BrandPdfView } from "@/lib/brandPdfView";
import { toBrandPackageView, type BrandPackageView } from "@/lib/brandPackageView";
import { toSiteVideoView, type SiteVideoView } from "@/lib/siteVideoView";
import { loadBrandData, getBrandConversationId, sendBrandInstruction, persistBrandChatMessage, type BrandProjectData } from "@/lib/brandingApi";
import { editorRuntimeUrl } from "@/lib/siteProjectsApi";

export default function BrandingStudioPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<BrandProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [craft, setCraft] = useState<BrandSnapshotLike | null>(null);
  const [mockup, setMockup] = useState<MockupView | null>(null);
  const [brandPdf, setBrandPdf] = useState<BrandPdfView | null>(null);
  const [brandPackage, setBrandPackage] = useState<BrandPackageView | null>(null);
  const [siteVideo, setSiteVideo] = useState<SiteVideoView | null>(null);
  const [mockupBaseUrl, setMockupBaseUrl] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const convId = getBrandConversationId(user.id, id);
      const d = await loadBrandData(id, convId);
      setData(d);
      setMessages(d.messages);
      setCraft(d.snapshot);
      let base: string | undefined;
      try { base = await editorRuntimeUrl(); } catch { base = undefined; }
      setMockupBaseUrl(base);
      setMockup(toMockupView(d.files));
      setBrandPdf(toBrandPdfView(d.files, { base, projectId: id }));
      setBrandPackage(toBrandPackageView(d.files, { base, projectId: id }));
      setSiteVideo(toSiteVideoView(d.files, { base, projectId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar projeto de identidade");
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function apply(instruction: string) {
    if (busy || !data || !user) return;
    setBusy(true);
    const userMsg = { role: "user" as const, text: instruction };
    setMessages((m) => [...m, userMsg]);
    void persistBrandChatMessage(data.projectId, user.id, userMsg, data.conversationId);
    const res = await sendBrandInstruction({ projectId: data.projectId, conversationId: data.conversationId, instruction, files: data.files, projectName: data.projectName, userId: user.id });
    setBusy(false);
    // Só considera sucesso se a alteração foi PERSISTIDA (evita falso sucesso).
    const replyText = res.ok ? (res.reply ?? "Atualizei a identidade.") : (res.error ?? "Não consegui concluir.");
    const assistantMsg = { role: "assistant" as const, text: replyText };
    setMessages((m) => [...m, assistantMsg]);
    void persistBrandChatMessage(data.projectId, user.id, assistantMsg, data.conversationId);
    if (res.ok) {
      setData((d) => (d ? { ...d, files: res.files, conversationId: d.conversationId } : d));
      setCraft(res.snapshot);
      setMockup(toMockupView(res.files));
      setBrandPdf(toBrandPdfView(res.files, { base: mockupBaseUrl, projectId: data?.projectId }));
      setBrandPackage(toBrandPackageView(res.files, { base: mockupBaseUrl, projectId: data?.projectId }));
      setSiteVideo(toSiteVideoView(res.files, { base: mockupBaseUrl, projectId: data?.projectId }));
    }
  }

  const LABEL: Record<"mockup" | "pdf" | "package" | "video", string> = { mockup: "Mockups", pdf: "Proposta de PDF", package: "Pacote (ZIP)", video: "Vídeo do site" };

  // Geração determinística de artefato (mockup/pdf/package/video): mostra estado de
  // processamento, apresenta erro REAL se falhar/não gerar, e só dá sucesso quando
  // o artefato REALMENTE apareceu persistido e validado. Nunca fica "sem resposta".
  async function runGeneration(kind: "mockup" | "pdf" | "package" | "video", instruction: string) {
    if (busy || !data || !user) return;
    setBusy(true);
    const userMsg = { role: "user" as const, text: instruction };
    setMessages((m) => [...m, userMsg]);
    void persistBrandChatMessage(data.projectId, user.id, userMsg, data.conversationId);
    const res = await sendBrandInstruction({ projectId: data.projectId, conversationId: data.conversationId, instruction, files: data.files, projectName: data.projectName, userId: user.id });
    setBusy(false);
    const replyText = res.ok ? (res.reply ?? "ok") : (res.error ?? "Não consegui concluir.");
    const assistantMsg = { role: "assistant" as const, text: replyText };
    setMessages((m) => [...m, assistantMsg]);
    void persistBrandChatMessage(data.projectId, user.id, assistantMsg, data.conversationId);
    const files = res.files ?? data.files;
    setData((d) => (d ? { ...d, files, conversationId: d.conversationId } : d));
    setCraft(res.snapshot ?? (data.snapshot));
    const base = mockupBaseUrl, pid = data?.projectId;
    setMockup(toMockupView(files));
    setBrandPdf(toBrandPdfView(files, { base, projectId: pid }));
    setBrandPackage(toBrandPackageView(files, { base, projectId: pid }));
    setSiteVideo(toSiteVideoView(files, { base, projectId: pid }));
    const ready = kind === "pdf" ? toBrandPdfView(files, { base, projectId: pid }).isReady
      : kind === "mockup" ? toMockupView(files).isReady
        : kind === "package" ? toBrandPackageView(files, { base, projectId: pid }).state === "ready"
          : toSiteVideoView(files, { base, projectId: pid }).state === "ready";
    if (!res.ok) { toast.error(`${LABEL[kind]}: ${res.error ?? "não foi possível concluir."}`); return; }
    if (!ready) { toast.error(`${LABEL[kind]}: o agente não gerou o resultado. ${res.reply ?? ""}`.trim()); return; }
    toast.success(`${LABEL[kind]} pronto.`);
  }

  const generateMockup = useCallback(() => void runGeneration("mockup", "Faça os mockups dessa identidade no PSD Master."), [runGeneration]);
  const generatePdf = useCallback(() => void runGeneration("pdf", "Crie a proposta de PDF da identidade a partir dos mockups atuais."), [runGeneration]);
  const generatePackage = useCallback(() => void runGeneration("package", "Prepare a identidade completa para download (pacote ZIP)."), [runGeneration]);
  const generateVideo = useCallback(() => void runGeneration("video", "Crie um vídeo profissional desse site."), [runGeneration]);

  const view = craft ? toBrandView(craft) : null;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ButtonGhost onClick={() => navigate("/sites")}><ArrowLeft className="h-4 w-4" /></ButtonGhost>
        <span className="text-sm text-muted-foreground">Branding Studio</span>
      </div>
      {loading ? (
        <CenterState icon={<Loader2 className="h-5 w-5 animate-spin" />} text="Carregando projeto de identidade…" />
      ) : error ? (
        <CenterState icon="⚠️" text={`Não foi possível carregar o projeto de identidade. ${error}`} />
      ) : !view ? (
        <BrandingStudio
          view={{ projectName: data?.projectName ?? "Marca", concepts: [], selectedConceptId: null, variants: {}, palette: { primary: "#111", secondary: "#666", accent: "#f90", background: "#fff", foreground: "#111" }, typography: { heading: "Inter", body: "Inter", weights: "700" }, identity: { hierarchy: "", photoDirection: "", applicationRules: "" }, versions: [], currentVersionId: null, hasBrand: false }}
          messages={messages}
          loading={busy}
          empty
          mockup={mockup ?? undefined}
          brandPdf={brandPdf ?? undefined}
          brandPackage={brandPackage ?? undefined}
          siteVideo={siteVideo ?? undefined}
          onGenerateMockup={generateMockup}
          onGeneratePdf={generatePdf}
          onGeneratePackage={generatePackage}
          onGenerateVideo={generateVideo}
          mockupBaseUrl={mockupBaseUrl}
          mockupProjectId={data?.projectId}
          onSelect={() => {}}
          onReject={() => {}}
          onRevert={() => {}}
          onSend={apply}
        />
      ) : (
        <BrandingStudio
          view={view}
          messages={messages}
          loading={busy}
          mockup={mockup ?? undefined}
          brandPdf={brandPdf ?? undefined}
          brandPackage={brandPackage ?? undefined}
          siteVideo={siteVideo ?? undefined}
          onGenerateMockup={generateMockup}
          onGeneratePdf={generatePdf}
          onGeneratePackage={generatePackage}
          onGenerateVideo={generateVideo}
          mockupBaseUrl={mockupBaseUrl}
          mockupProjectId={data?.projectId}
          onSelect={(cid) => void apply(`Gostei do conceito ${cid}.`)}
          onReject={(cid) => void apply(`Rejeite o conceito ${cid}.`)}
          onRevert={() => void apply("Volta para a versão anterior.")}
          onSend={apply}
        />
      )}
    </div>
  );
}

function ButtonGhost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground">{children}</button>;
}
function CenterState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="py-20 flex flex-col items-center gap-2 text-muted-foreground"><span className="text-lg">{icon}</span><p className="text-sm max-w-md text-center">{text}</p></div>;
}
