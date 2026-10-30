import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, WifiOff } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

import Dashboard from "./pages/Dashboard";

// Lazy-loaded routes — reduces initial JS bundle for the landing/Dashboard.
// `lazyWithRetry` protege contra "Failed to fetch dynamically imported module"
// causado por cache de HTML apontando para chunks antigos após novo deploy.

const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"), "ResetPassword");
const Search = lazyWithRetry(() => import("./pages/Search"), "Search");
const Leads = lazyWithRetry(() => import("./pages/Leads"), "Leads");

const History = lazyWithRetry(() => import("./pages/History"), "History");
const Queue = lazyWithRetry(() => import("./pages/Queue"), "Queue");
const Services = lazyWithRetry(() => import("./pages/Services"), "Services");
const Sites = lazyWithRetry(() => import("./pages/Sites"), "Sites");
const SiteProjectPage = lazyWithRetry(() => import("./pages/SiteProjectPage"), "SiteProjectPage");
const BrandingStudioPage = lazyWithRetry(() => import("./pages/BrandingStudioPage"), "BrandingStudioPage");
const Placeholder = lazyWithRetry(() => import("./pages/Placeholder"), "Placeholder");
const Settings = lazyWithRetry(() => import("./pages/Settings"), "Settings");
const PublicSitePage = lazyWithRetry(() => import("./pages/PublicSitePage"), "PublicSitePage");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "NotFound");

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>
);

// Tela de diagnóstico quando o backend não inicia a sessão. Evita que as páginas
// (leads, projetos etc.) fiquem com o spinner infinito quando não há sessão.
const SessionGate = () => {
  const { authError, ensureSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [bypass, setBypass] = useState(false);
  const host = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL as string).host;
    } catch {
      return "Supabase";
    }
  })();

  if (bypass) return <Outlet />;

  async function retry() {
    setBusy(true);
    try {
      await ensureSession();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 space-y-4 border-border/60 bg-card/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <WifiOff className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">Não foi possível conectar</h1>
            <p className="text-xs text-muted-foreground">{host}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {authError ||
            "O backend não respondeu no tempo esperado. Verifique se o projeto Supabase está ativo e se a URL/chave configuradas estão corretas."}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button className="flex-1" onClick={retry} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Tentar novamente
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setBypass(true)} disabled={busy}>
            Entrar sem sessão
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sem sessão, leads e projetos não são carregados (as consultas dependem da autenticação).
        </p>
      </Card>
    </div>
  );
};

const RequireAuth = () => {
  const { session, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!session) return <SessionGate />;
  return <Outlet />;
};

// Fecha o popup do OAuth do GitHub quando ele volta ao app via ?github_connected=1
// e avisa a janela original (que atualiza o painel e fecha a conexão visual).
const OAuthPopupCloser = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github_connected") !== "1") return;
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "github_oauth_success" }, window.location.origin);
        setTimeout(() => { try { window.close(); } catch { /* não fecha em alguns browsers */ } }, 250);
      } else {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch { /* ignore */ }
  }, []);
  return null;
};

// Remonta a página por projectId: isola chat, arquivos, preview e WebContainer
// entre projetos (nenhum estado do projeto A sobrevive ao abrir o projeto B).
function SiteProjectPageRoute() {
  const { id } = useParams<{ id: string }>();
  return <SiteProjectPage key={id} />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <OAuthPopupCloser />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Navigate to="/" replace />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/leads" element={<Leads />} />
                    
                    <Route path="/history" element={<History />} />
                    <Route path="/queue" element={<Queue />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/sites" element={<Sites />} />
                    <Route path="/sites/:id" element={<SiteProjectPageRoute />} />
                    <Route path="/branding/:id" element={<BrandingStudioPage />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>
                </Route>
                <Route path="/public/:slug" element={<PublicSitePage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
