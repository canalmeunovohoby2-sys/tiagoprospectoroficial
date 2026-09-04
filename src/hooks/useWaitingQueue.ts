import { useCallback, useEffect, useState } from "react";

export type QueueItem = {
  id: string;            // lead.id + landing url hash to avoid duplicates of same combo
  leadId: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  whatsapp: string | null;
  roiScore: number | null;
  roiTier: string | null;
  template: "A" | "B" | "C" | "D";
  message: string;
  landingUrl: string;
  status: "pending" | "sent";
  createdAt: number;
  sentAt?: number;
};

const STORAGE_KEY = "leadhunter:waiting-queue:v1";

function read(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: QueueItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("leadhunter:queue-changed"));
  } catch {
    /* ignore quota */
  }
}

export function useWaitingQueue() {
  const [items, setItems] = useState<QueueItem[]>(() => read());

  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener("storage", sync);
    window.addEventListener("leadhunter:queue-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("leadhunter:queue-changed", sync as EventListener);
    };
  }, []);

  const add = useCallback((item: Omit<QueueItem, "id" | "status" | "createdAt">) => {
    const current = read();
    const dupId = `${item.leadId}::${item.landingUrl}`;
    if (current.some((x) => x.id === dupId)) {
      return { ok: false as const, reason: "duplicate" as const };
    }
    const next: QueueItem = {
      ...item,
      id: dupId,
      status: "pending",
      createdAt: Date.now(),
    };
    const updated = [next, ...current];
    write(updated);
    setItems(updated);
    return { ok: true as const };
  }, []);

  const remove = useCallback((id: string) => {
    const updated = read().filter((x) => x.id !== id);
    write(updated);
    setItems(updated);
  }, []);

  const markSent = useCallback((id: string) => {
    const updated = read().map((x) =>
      x.id === id ? { ...x, status: "sent" as const, sentAt: Date.now() } : x,
    );
    write(updated);
    setItems(updated);
  }, []);

  const unmarkSent = useCallback((id: string) => {
    const updated = read().map((x) =>
      x.id === id ? { ...x, status: "pending" as const, sentAt: undefined } : x,
    );
    write(updated);
    setItems(updated);
  }, []);

  const clearPending = useCallback(() => {
    const updated = read().filter((x) => x.status !== "pending");
    write(updated);
    setItems(updated);
  }, []);

  return { items, add, remove, markSent, unmarkSent, clearPending };
}
