import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Briefcase, Pencil, GripVertical, Undo2, CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type ServiceType =
  | "Logomarca"
  | "Fachada"
  | "Flyer"
  | "Cartão de visita"
  | "Site"
  | "Outros";

interface ServiceItem {
  id: string;
  identifier: string;
  type: ServiceType;
  total: number;
  paid: number;
  createdAt: number;
  done?: boolean;
}

const STORAGE_KEY = "leadhunter:services:v1";
const MIGRATED_KEY = "leadhunter:services:migrated:v1";
const TYPES: ServiceType[] = [
  "Logomarca",
  "Fachada",
  "Flyer",
  "Cartão de visita",
  "Site",
  "Outros",
];

const PRESET_TYPES = new Set<string>(TYPES);

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ServiceRow = {
  id: string;
  identifier: string;
  type: string;
  total: number | string;
  paid: number | string;
  done: boolean;
  position: number;
  created_at: string;
};

const rowToItem = (r: ServiceRow): ServiceItem => ({
  id: r.id,
  identifier: r.identifier,
  type: r.type as ServiceType,
  total: Number(r.total) || 0,
  paid: Number(r.paid) || 0,
  createdAt: new Date(r.created_at).getTime(),
  done: !!r.done,
});

// ---------------- Undo history ----------------
type UndoAction =
  | { kind: "delete"; item: ServiceItem; index: number; label: string }
  | { kind: "create"; id: string; label: string }
  | {
      kind: "edit";
      id: string;
      prev: Pick<ServiceItem, "identifier" | "type" | "total" | "paid">;
      label: string;
    }
  | { kind: "toggle"; id: string; prevDone: boolean; label: string }
  | { kind: "reorder"; prevOrder: string[]; label: string };

const HISTORY_LIMIT = 20;

export default function Services() {
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [type, setType] = useState<ServiceType>("Logomarca");
  const [total, setTotal] = useState("");
  const [paid, setPaid] = useState("");
  const [customType, setCustomType] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const historyRef = useRef<UndoAction[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  const pushHistory = (action: UndoAction) => {
    const next = [...historyRef.current, action];
    if (next.length > HISTORY_LIMIT) next.shift();
    historyRef.current = next;
    setHistoryLen(next.length);
  };

  // Load from backend + one-time migration from localStorage
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("[services] load error", error);
        toast.error("Erro ao carregar serviços");
        setLoading(false);
        return;
      }

      const rows = (data || []) as ServiceRow[];

      const migratedFlag = localStorage.getItem(`${MIGRATED_KEY}:${user.id}`);
      if (rows.length === 0 && !migratedFlag) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const local: ServiceItem[] = raw ? JSON.parse(raw) : [];
          if (Array.isArray(local) && local.length > 0) {
            const payload = local.map((s, idx) => ({
              user_id: user.id,
              identifier: String(s.identifier ?? ""),
              type: String(s.type ?? "Outros"),
              total: Number(s.total) || 0,
              paid: Number(s.paid) || 0,
              done: !!s.done,
              position: idx,
            }));
            const { data: inserted, error: insErr } = await supabase
              .from("services")
              .insert(payload)
              .select("*");
            if (insErr) {
              console.error("[services] migration error", insErr);
              toast.error("Não foi possível migrar serviços locais");
            } else {
              localStorage.setItem(`${MIGRATED_KEY}:${user.id}`, new Date().toISOString());
              toast.success(`${inserted?.length || 0} serviço(s) migrado(s) para a nuvem`);
              const migrated = ((inserted || []) as ServiceRow[])
                .sort((a, b) => a.position - b.position)
                .map(rowToItem);
              setItems(migrated);
              setLoading(false);
              return;
            }
          } else {
            localStorage.setItem(`${MIGRATED_KEY}:${user.id}`, new Date().toISOString());
          }
        } catch (e) {
          console.error("[services] migration parse error", e);
        }
      }

      setItems(rows.map(rowToItem));
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reset = () => {
    setEditingId(null);
    setIdentifier("");
    setType("Logomarca");
    setTotal("");
    setPaid("");
    setCustomType("");
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (s: ServiceItem) => {
    setEditingId(s.id);
    setIdentifier(s.identifier);
    if (PRESET_TYPES.has(s.type)) {
      setType(s.type);
      setCustomType("");
    } else {
      setType("Outros");
      setCustomType(s.type);
    }
    setTotal(String(s.total));
    setPaid(String(s.paid));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!user) return toast.error("Sessão expirada");
    const idNum = identifier.trim();
    if (!idNum) return toast.error("Informe o número de identificação");
    const t = parseFloat(total.replace(",", "."));
    const p = parseFloat(paid.replace(",", ".")) || 0;
    if (isNaN(t) || t < 0) return toast.error("Valor total inválido");
    if (p < 0 || p > t) return toast.error("Sinal pago inválido");
    const finalType =
      type === "Outros"
        ? customType.trim()
          ? (customType.trim() as ServiceType)
          : null
        : type;
    if (type === "Outros" && !finalType) {
      return toast.error("Informe qual o tipo de serviço");
    }

    setSaving(true);
    if (editingId) {
      const previous = items.find((s) => s.id === editingId);
      const { error } = await supabase
        .from("services")
        .update({
          identifier: idNum,
          type: finalType as string,
          total: t,
          paid: p,
        })
        .eq("id", editingId);
      setSaving(false);
      if (error) {
        console.error("[services] update error", error);
        return toast.error("Erro ao salvar");
      }
      setItems((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? { ...s, identifier: idNum, type: finalType as ServiceType, total: t, paid: p }
            : s,
        ),
      );
      if (previous) {
        pushHistory({
          kind: "edit",
          id: editingId,
          prev: {
            identifier: previous.identifier,
            type: previous.type,
            total: previous.total,
            paid: previous.paid,
          },
          label: `Edição do Cliente #${previous.identifier}`,
        });
      }
      toast.success("Serviço atualizado");
    } else {
      const minPos = items.reduce((m, s: any) => {
        const p = typeof s.position === "number" ? s.position : 0;
        return p < m ? p : m;
      }, 0);
      const newPos = minPos - 1;
      const { data, error } = await supabase
        .from("services")
        .insert({
          user_id: user.id,
          identifier: idNum,
          type: finalType as string,
          total: t,
          paid: p,
          done: false,
          position: newPos,
        })
        .select("*")
        .single();
      setSaving(false);
      if (error || !data) {
        console.error("[services] insert error", error);
        return toast.error("Erro ao salvar");
      }
      const newItem = rowToItem(data as ServiceRow);
      setItems((prev) => [newItem, ...prev]);
      pushHistory({
        kind: "create",
        id: newItem.id,
        label: `Criação do Cliente #${newItem.identifier}`,
      });
      toast.success("Serviço adicionado");
    }
    setOpen(false);
    reset();
  };

  const handleRemove = async (id: string) => {
    const index = items.findIndex((s) => s.id === id);
    if (index < 0) return;
    const item = items[index];
    // optimistic
    setItems((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      console.error("[services] delete error", error);
      setItems((prev) => {
        const next = [...prev];
        next.splice(index, 0, item);
        return next;
      });
      return toast.error("Erro ao remover");
    }
    pushHistory({
      kind: "delete",
      item,
      index,
      label: `Exclusão do Cliente #${item.identifier}`,
    });
    toast.success("Serviço removido — use Desfazer se preciso");
  };

  const handleToggleDone = async (id: string) => {
    const current = items.find((s) => s.id === id);
    if (!current) return;
    const nextDone = !current.done;
    const prevDone = !!current.done;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, done: nextDone } : x)));
    const { error } = await supabase.from("services").update({ done: nextDone }).eq("id", id);
    if (error) {
      console.error("[services] toggle done error", error);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, done: prevDone } : x)));
      return toast.error("Erro ao atualizar");
    }
    pushHistory({
      kind: "toggle",
      id,
      prevDone,
      label: `${nextDone ? "Marcado" : "Desmarcado"} Cliente #${current.identifier}`,
    });
  };

  const persistOrder = async (ordered: ServiceItem[]) => {
    const updates = ordered.map((s, idx) =>
      supabase.from("services").update({ position: idx }).eq("id", s.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[services] reorder error", failed.error);
      toast.error("Erro ao salvar nova ordem");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const prevOrder = prev.map((s) => s.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      persistOrder(next);
      pushHistory({ kind: "reorder", prevOrder, label: "Reordenação" });
      return next;
    });
  };

  // ---------------- UNDO ----------------
  const handleUndo = async () => {
    if (!user) return;
    const action = historyRef.current[historyRef.current.length - 1];
    if (!action) return toast.info("Nada para desfazer");
    setUndoing(true);
    try {
      if (action.kind === "delete") {
        const { item, index } = action;
        const { data, error } = await supabase
          .from("services")
          .insert({
            user_id: user.id,
            identifier: item.identifier,
            type: item.type as string,
            total: item.total,
            paid: item.paid,
            done: !!item.done,
            position: index,
          })
          .select("*")
          .single();
        if (error || !data) {
          console.error("[services] undo delete error", error);
          return toast.error("Não foi possível desfazer");
        }
        setItems((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, rowToItem(data as ServiceRow));
          return next;
        });
        toast.success(`Desfeito: ${action.label}`);
      } else if (action.kind === "create") {
        const { error } = await supabase.from("services").delete().eq("id", action.id);
        if (error) {
          console.error("[services] undo create error", error);
          return toast.error("Não foi possível desfazer");
        }
        setItems((prev) => prev.filter((s) => s.id !== action.id));
        toast.success(`Desfeito: ${action.label}`);
      } else if (action.kind === "edit") {
        const { error } = await supabase
          .from("services")
          .update({
            identifier: action.prev.identifier,
            type: action.prev.type as string,
            total: action.prev.total,
            paid: action.prev.paid,
          })
          .eq("id", action.id);
        if (error) {
          console.error("[services] undo edit error", error);
          return toast.error("Não foi possível desfazer");
        }
        setItems((prev) =>
          prev.map((s) => (s.id === action.id ? { ...s, ...action.prev } : s)),
        );
        toast.success(`Desfeito: ${action.label}`);
      } else if (action.kind === "toggle") {
        const { error } = await supabase
          .from("services")
          .update({ done: action.prevDone })
          .eq("id", action.id);
        if (error) {
          console.error("[services] undo toggle error", error);
          return toast.error("Não foi possível desfazer");
        }
        setItems((prev) =>
          prev.map((s) => (s.id === action.id ? { ...s, done: action.prevDone } : s)),
        );
        toast.success(`Desfeito: ${action.label}`);
      } else if (action.kind === "reorder") {
        // Reconstruct previous order using stored ids
        setItems((prev) => {
          const byId = new Map(prev.map((s) => [s.id, s]));
          const rebuilt: ServiceItem[] = [];
          action.prevOrder.forEach((id) => {
            const it = byId.get(id);
            if (it) {
              rebuilt.push(it);
              byId.delete(id);
            }
          });
          // any items not in prevOrder go to the end
          byId.forEach((it) => rebuilt.push(it));
          persistOrder(rebuilt);
          return rebuilt;
        });
        toast.success(`Desfeito: ${action.label}`);
      }
      // pop action from history
      historyRef.current = historyRef.current.slice(0, -1);
      setHistoryLen(historyRef.current.length);
    } finally {
      setUndoing(false);
    }
  };

  const totalGeral = items.reduce((acc, s) => acc + s.total, 0);
  const restanteGeral = items.reduce((acc, s) => acc + (s.total - s.paid), 0);
  const lastAction = historyRef.current[historyRef.current.length - 1];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Serviços
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle de trabalhos fechados — sincronizado na sua conta
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleUndo}
            disabled={historyLen === 0 || undoing}
            className="gap-2"
            title={lastAction ? `Desfazer: ${lastAction.label}` : "Nada para desfazer"}
          >
            {undoing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            Desfazer
            {historyLen > 0 && (
              <span className="text-xs text-muted-foreground">({historyLen})</span>
            )}
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar Serviço
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 bg-card/60 backdrop-blur border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total de serviços</div>
            <div className="text-2xl font-bold mt-1">{items.length}</div>
          </Card>
          <Card className="p-4 bg-card/60 backdrop-blur border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Valor total</div>
            <div className="text-2xl font-bold mt-1">{fmt(totalGeral)}</div>
          </Card>
          <Card className="p-4 bg-card/60 backdrop-blur border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">A receber</div>
            <div className="text-2xl font-bold mt-1 text-primary">{fmt(restanteGeral)}</div>
          </Card>
        </div>
      )}

      {loading ? (
        <Card className="p-12 text-center border-dashed bg-card/40">
          <Loader2 className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3 animate-spin" />
          <p className="text-muted-foreground">Carregando serviços…</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center border-dashed bg-card/40">
          <Briefcase className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-muted-foreground">
            Nenhum serviço adicionado ainda.
          </p>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((s) => (
                <SortableServiceCard
                  key={s.id}
                  item={s}
                  onRemove={() => handleRemove(s.id)}
                  onEdit={() => openEdit(s)}
                  onToggleDone={() => handleToggleDone(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Serviço" : "Adicionar Serviço"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="svc-id">Cliente Nº</Label>
              <Input
                id="svc-id"
                type="number"
                inputMode="numeric"
                placeholder="Ex: 1024"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de serviço</Label>
              <Select value={type} onValueChange={(v) => setType(v as ServiceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type === "Outros" && (
                <div className="pt-2">
                  <Label htmlFor="svc-custom">Qual serviço?</Label>
                  <Input
                    id="svc-custom"
                    placeholder="Descreva o serviço"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    className="mt-1.5"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-total">Valor total (R$)</Label>
                <Input
                  id="svc-total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-paid">Sinal pago (R$)</Label>
                <Input
                  id="svc-paid"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>
            </div>

            {total && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm flex justify-between">
                <span className="text-muted-foreground">Valor restante</span>
                <span className="font-bold text-primary">
                  {fmt(
                    Math.max(
                      0,
                      (parseFloat(total.replace(",", ".")) || 0) -
                        (parseFloat(paid.replace(",", ".")) || 0)
                    )
                  )}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Salvar alterações" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableServiceCard({
  item: s,
  onRemove,
  onEdit,
  onToggleDone,
}: {
  item: ServiceItem;
  onRemove: () => void;
  onEdit: () => void;
  onToggleDone: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : "auto",
  };
  const restante = s.total - s.paid;
  const done = !!s.done;

  const accentText = done ? "text-yellow-400" : "text-primary";
  const accentShadow = done
    ? "drop-shadow-[0_0_10px_hsl(48_100%_55%/0.65)]"
    : "drop-shadow-[0_0_8px_hsl(0_84%_55%/0.4)]";
  const accentBorder = done
    ? "border-yellow-400/40 hover:border-yellow-400/70"
    : "border-primary/15 hover:border-primary/40";
  const dragRing = isDragging
    ? done
      ? "ring-2 ring-yellow-400/70 shadow-[0_0_28px_hsl(48_100%_55%/0.5)]"
      : "ring-2 ring-primary/60 shadow-[0_0_24px_hsl(0_84%_55%/0.35)]"
    : "";
  const restanteColor = done
    ? "text-yellow-400 drop-shadow-[0_0_6px_hsl(48_100%_55%/0.55)]"
    : restante > 0
    ? "text-primary"
    : "text-emerald-500";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing touch-none ${dragRing}`}
    >
      <Card className={`p-4 bg-card/60 backdrop-blur transition-colors ${accentBorder}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="mt-1 text-muted-foreground" aria-label="Arrastar">
              <GripVertical className="h-4 w-4" />
            </span>
            <div>
              <div className={`text-2xl font-display font-bold leading-tight ${accentText} ${accentShadow}`}>
                Cliente #{s.identifier}
              </div>
              <div className="font-semibold mt-1.5 flex items-center gap-2">
                {s.type}
                {done && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 border border-yellow-400/40">
                    Feito
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              onPointerDown={(e) => e.stopPropagation()}
              className="hover:text-primary hover:bg-primary/10"
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              aria-label="Remover"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor total</span>
            <span className="font-medium">{fmt(s.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sinal pago</span>
            <span className="font-medium">{fmt(s.paid)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-border/50">
            <span className="text-muted-foreground">Restante</span>
            <span className={`font-bold ${restanteColor}`}>{fmt(restante)}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/50">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={
              done
                ? "w-full gap-2 bg-transparent border border-yellow-400/50 text-yellow-400 hover:bg-yellow-400/10 hover:text-yellow-300 shadow-[0_0_18px_hsl(48_100%_55%/0.35)]"
                : "w-full gap-2 bg-yellow-400 text-black hover:bg-yellow-300 shadow-[0_0_22px_hsl(48_100%_55%/0.55)] hover:shadow-[0_0_32px_hsl(48_100%_55%/0.85)] transition-shadow"
            }
          >
            {done ? (
              <>
                <RotateCcw className="h-4 w-4" /> Desmarcar
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Feito
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
