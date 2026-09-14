import { GitHubProjectButton } from "@/components/app/GitHubProjectButton";

export interface StudioGitConfigDialogProps {
  projectId: string;
  userId?: string;
}

/**
 * Integração Git do Studio. Na Fase 1 expõe a integração GitHub já existente
 * (conectar, criar/vincular repositório, sincronizar). A Fase 6 incorpora aqui
 * o estado de branch/commit do runtime e o fluxo de diff/checkout.
 */
export function StudioGitConfigDialog({ projectId, userId }: StudioGitConfigDialogProps) {
  return <GitHubProjectButton projectId={projectId} userId={userId} />;
}
