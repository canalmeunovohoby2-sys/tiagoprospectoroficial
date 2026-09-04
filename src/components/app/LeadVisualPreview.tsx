import { memo, useState } from "react";
import { ChevronDown, ChevronUp, Image as ImageIcon, Instagram, Globe, MapIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Lead } from "@/data/types";

interface Props { lead: Lead }

function thumbForUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Google s2 favicons as a lightweight, no-auth thumbnail
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return null;
  }
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 h-28 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground">
      <ImageIcon className="h-5 w-5 opacity-60" />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-[10px] opacity-70">Indisponível</span>
    </div>
  );
}

function LeadVisualPreviewBase({ lead }: Props) {
  const [open, setOpen] = useState(false);

  const siteThumb = thumbForUrl(lead.website);
  const logoThumb = thumbForUrl(lead.website) || thumbForUrl(lead.instagram) || thumbForUrl(lead.facebook);
  const mapsThumb =
    typeof lead.latitude === "number" && typeof lead.longitude === "number"
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${lead.latitude},${lead.longitude}&zoom=15&size=400x200&markers=${lead.latitude},${lead.longitude},red-pushpin`
      : null;

  return (
    <Card className="border-border/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-sm font-semibold"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" /> Preview Visual
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Google Business</div>
            {mapsThumb ? (
              <a href={lead.google_url ?? "#"} target="_blank" rel="noreferrer" className="block">
                <img
                  src={mapsThumb}
                  alt="Mapa do negócio"
                  loading="lazy"
                  className="h-28 w-full object-cover rounded-lg border border-border/60"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </a>
            ) : (
              <Placeholder label="Mapa" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Logo</div>
            {logoThumb ? (
              <div className="h-28 w-full rounded-lg border border-border/60 flex items-center justify-center bg-muted/20">
                <img src={logoThumb} alt="Logo (favicon)" loading="lazy" className="h-12 w-12 rounded" />
              </div>
            ) : (
              <Placeholder label="Logo" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Site Atual</div>
            {lead.website && siteThumb ? (
              <a href={lead.website} target="_blank" rel="noreferrer" className="block">
                <div className="h-28 w-full rounded-lg border border-border/60 flex flex-col items-center justify-center bg-muted/20 gap-1">
                  <img src={siteThumb} alt="Favicon do site" loading="lazy" className="h-10 w-10 rounded" />
                  <span className="text-[10px] text-muted-foreground truncate max-w-[90%]">{lead.website.replace(/^https?:\/\//, "")}</span>
                </div>
              </a>
            ) : (
              <Placeholder label="Site" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Instagram</div>
            {lead.instagram ? (
              <a href={lead.instagram} target="_blank" rel="noreferrer" className="block">
                <div className="h-28 w-full rounded-lg border border-border/60 flex flex-col items-center justify-center bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-amber-500/10 gap-1">
                  <Instagram className="h-7 w-7 text-pink-500" />
                  <span className="text-[10px] text-muted-foreground truncate max-w-[90%]">Abrir perfil</span>
                </div>
              </a>
            ) : (
              <Placeholder label="Instagram" />
            )}
          </div>

          <div className="col-span-2 md:col-span-4 flex flex-wrap gap-2 pt-1">
            {lead.website && (
              <Button size="sm" variant="outline" asChild>
                <a href={lead.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5 mr-1" /> Visitar site</a>
              </Button>
            )}
            {lead.google_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={lead.google_url} target="_blank" rel="noreferrer"><MapIcon className="h-3.5 w-3.5 mr-1" /> Ver no Google</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export const LeadVisualPreview = memo(LeadVisualPreviewBase);
