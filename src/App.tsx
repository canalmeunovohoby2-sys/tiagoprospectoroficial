import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppShell } from "@/components/app/AppShell";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";
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
const Placeholder = lazyWithRetry(() => import("./pages/Placeholder"), "Placeholder");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "NotFound");

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/auth" element={<Navigate to="/" replace />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/leads" element={<Leads />} />
                  
                  <Route path="/history" element={<History />} />
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/services" element={<Services />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/sites/:id" element={<SiteProjectPage />} />
                  <Route path="/settings" element={<Placeholder title="Configurações" subtitle="Preferências da conta" />} />
                </Route>
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
