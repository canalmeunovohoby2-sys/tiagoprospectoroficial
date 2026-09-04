import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { calculateLeadROI } from "@/lib/leadROI";
import type { Lead } from "@/data/types";

interface Props {
  lead: Lead;
  showScore?: boolean;
  className?: string;
}

function RoiBadgeBase({ lead, showScore, className }: Props) {
  const { tier, label, emoji, score, reasons } = calculateLeadROI(lead);
  const cls =
    tier === "high"
      ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
      : tier === "medium"
        ? "border-amber-500/40 text-amber-500 bg-amber-500/5"
        : "border-muted-foreground/30 text-muted-foreground bg-muted/30";

  const title = `${label} · ${score}/100\n${reasons.join("\n") || "Sem critérios atendidos"}`;

  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${cls} ${className ?? ""}`} title={title}>
      <span aria-hidden>{emoji}</span>
      {label}
      {showScore ? <span className="opacity-70">· {score}</span> : null}
    </Badge>
  );
}

export const RoiBadge = memo(RoiBadgeBase);
