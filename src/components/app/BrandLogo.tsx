import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";

// Marca do app (no lugar do texto "LeadHunter Brasil").
// Arquivos em /public:
//   - branca.png → usada em fundo CLARO (nome branco)
//   - preta.png  → usada em fundo ESCURO (nome preto)
// Se o arquivo faltar, mostra um marcador neutro (não quebra nada).
export function BrandLogo({ className = "h-10 w-auto", alt = "Logo" }: { className?: string; alt?: string }) {
  const { theme } = useTheme();
  const [err, setErr] = useState(false);
  const src = theme === "dark" ? "/preta.png" : "/branca.png";

  if (err) {
    return (
      <span className={`inline-flex items-center justify-center rounded-lg border border-border/60 bg-sidebar-accent px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground`}>
        Logo
      </span>
    );
  }
  return <img src={src} alt={alt} onError={() => setErr(true)} className={`object-contain ${className}`} />;
}
