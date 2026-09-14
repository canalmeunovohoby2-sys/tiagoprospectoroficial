import { CircleDot, Code2, FileCode2, HardDrive, Loader2 } from "lucide-react";

export interface StatusBarProps {
  filesCount: number;
  activePath?: string | null;
  line?: number;
  column?: number;
  language?: string;
  dirty?: boolean;
  saving?: boolean;
  /** Rótulo do motor de IA realmente em uso (ex.: "IA validada"). */
  engineLabel?: string;
}

export function StatusBar({
  filesCount,
  activePath,
  line,
  column,
  language,
  dirty = false,
  saving = false,
  engineLabel = "IA validada do Prospector",
}: StatusBarProps) {
  const hasCursor = typeof line === "number" && typeof column === "number";
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/80 px-3 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5">
          <HardDrive className="h-3 w-3 text-primary/80" />
          {filesCount} arquivo(s)
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Code2 className="h-3 w-3 text-primary/80" />
          <span className="truncate">{engineLabel}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {saving && (
          <span className="flex items-center gap-1.5 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> salvando…
          </span>
        )}
        {activePath && (
          <span className="hidden items-center gap-1.5 sm:flex">
            <FileCode2 className="h-3 w-3" />
            <span className="max-w-[220px] truncate">{activePath}</span>
          </span>
        )}
        {language && <span className="uppercase tracking-wide">{language}</span>}
        <span className="flex items-center gap-1.5">
          <CircleDot className={`h-3 w-3 ${dirty ? "animate-pulse text-amber-500" : "text-emerald-500/80"}`} />
          {dirty ? "não salvo" : "salvo"}
        </span>
        {hasCursor && <span>Ln {line}, Col {column}</span>}
        <span className="hidden sm:inline">UTF-8</span>
      </div>
    </footer>
  );
}
