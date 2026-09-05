import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Globe } from "lucide-react";
import { fetchPublicSite } from "@/lib/siteProjectsApi";
import { SitePreview } from "@/components/sites/SitePreview";
import { prepareProjectPreview } from "@/lib/projectPreviewRuntime";
import type { SiteSpec } from "@/data/siteProjects";

export default function PublicSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{ name: string; spec: SiteSpec; code?: Record<string, string> | null } | null>(null);
  const [state, setState] = useState<"loading" | "found" | "notfound">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchPublicSite(slug ?? "")
      .then((site) => {
        if (!active) return;
        if (site) {
          setData({ name: site.name, spec: site.published_spec, code: site.published_code });
          setState("found");
        } else {
          setState("notfound");
        }
      })
      .catch(() => {
        if (active) setState("notfound");
      });
    return () => { active = false; };
  }, [slug]);

  // Código publicado (code-first): se existir generated_code publicado, o site
  // público renderiza o CÓDIGO REAL num iframe sandbox — não a spec reconstruída.
  const preview = useMemo(() => {
    if (data?.code && Object.keys(data.code).length > 0) {
      return prepareProjectPreview(data.code);
    }
    return null;
  }, [data?.code]);

  // SEO básico dinâmico.
  useEffect(() => {
    if (!data) return;
    const business = (data.spec.business ?? {}) as { segment?: string };
    const segment = business.segment ?? "";
    document.title = segment ? `${data.name} — ${segment}` : data.name;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = `Site profissional de ${data.name}${segment ? ` — ${segment}` : ""}.`;
    return () => { /* mantém título */ };
  }, [data]);

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>;
  }

  if (state === "notfound" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold">Site não encontrado</h1>
          <p className="text-sm text-muted-foreground mt-2">Este site não existe ou ainda não foi publicado.</p>
        </div>
      </div>
    );
  }

  if (preview?.ok && preview.document) {
    return (
      <iframe
        title={data.name}
        srcDoc={preview.document}
        sandbox="allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox"
        className="block h-screen w-full border-0 bg-white"
      />
    );
  }

  return <SitePreview spec={data.spec as SiteSpec | Record<string, unknown> | null} bare />;
}
