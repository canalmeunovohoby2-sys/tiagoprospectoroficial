import { X } from "lucide-react";
import type { StudioTab } from "@/lib/studio/types";

export interface StudioEditorTabsProps {
  tabs: StudioTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function StudioEditorTabs({ tabs, activePath, onSelect, onClose }: StudioEditorTabsProps) {
  if (tabs.length === 0) {
    return (
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 bg-card/60 px-3">
        <span className="text-[11px] text-muted-foreground">Nenhum arquivo aberto</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-card/60 pr-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:thin]">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              className={`group inline-flex h-9 max-w-[200px] shrink-0 items-center gap-1.5 border-r border-border/50 px-2.5 text-[11.5px] transition-colors ${active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
            >
              <button type="button" onClick={() => onSelect(tab.path)} className="min-w-0 flex-1 truncate text-left" title={tab.path}>
                {tab.name}
              </button>
              {tab.dirty ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="alterações não salvas" />
              ) : (
                <button
                  type="button"
                  onClick={() => onClose(tab.path)}
                  className="shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Fechar aba"
                  aria-label={`Fechar ${tab.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {tab.dirty && (
                <button
                  type="button"
                  onClick={() => onClose(tab.path)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  title="Fechar aba"
                  aria-label={`Fechar ${tab.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
