// Ticket de execução para o Agent Runtime (Railway).
// Emitido pela Edge Function autenticada agent-ticket (valida ownership do
// projeto). Curto (5min) e com cache local; nunca sai em logs.
import { supabase } from "@/integrations/supabase/client";

interface CachedTicket { token: string; exp: number; pid: string | null }
const cache = new Map<string, CachedTicket>();

export async function getAgentTicket(projectId?: string): Promise<string | null> {
  const pid = projectId && projectId.trim() ? projectId.trim() : null;
  const now = Date.now();
  const cached = pid ? cache.get(pid) : cache.get("__user__");
  if (cached && cached.exp > now + 30_000) return cached.token;
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; token?: string; expiresIn?: number }>(
    "agent-ticket",
    { body: pid ? { projectId: pid } : {} },
  );
  if (error || !data?.ok || !data.token) return null;
  const entry: CachedTicket = { token: data.token, exp: now + (data.expiresIn ?? 300) * 1000, pid };
  cache.set(pid ? pid : "__user__", entry);
  return data.token;
}
