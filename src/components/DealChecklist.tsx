import { useState } from "react";
import { Check, Plus, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDealChecklist, useUpsertDealChecklist } from "@/hooks/useDealChecklists";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_ITEMS = [
  { label: "Title & deed verification", done: false },
  { label: "Financing pre-approval", done: false },
  { label: "Property inspection", done: false },
  { label: "Legal due diligence", done: false },
  { label: "Tax & ENFIA check", done: false },
];

interface DealChecklistProps {
  entityType: "listing" | "firesale_request";
  entityId: string | undefined;
}

// skipcq: JS-0067 - Exported React component is intentionally module-scoped.
export function DealChecklist({ entityType, entityId }: DealChecklistProps) { // skipcq: JS-R1005 - Checklist UI keeps auth, defaults, mutations, and item actions together.
  const { user } = useAuth();
  const { data: checklist, isLoading } = useDealChecklist(entityType, entityId);
  const upsert = useUpsertDealChecklist();

  const [newItem, setNewItem] = useState("");
  const items: { label: string; done: boolean }[] =
    checklist?.items && Array.isArray(checklist.items)
      ? (checklist.items as { label: string; done: boolean }[])
      : DEFAULT_ITEMS;

  const doneCount = items.filter((i) => i.done).length;

  if (!user || !entityId) return null;

  const toggleItem = (idx: number) => {
    const next = items.map((it, i) =>
      i === idx ? { ...it, done: !it.done } : it
    );
    upsert.mutate({
      entity_type: entityType,
      entity_id: entityId,
      items: next,
      title: checklist?.title ?? "Due diligence",
      status: checklist?.status ?? "in_progress",
    });
  };

  const addItem = () => { // skipcq: JS-R1005 - Add action keeps duplicate checklist mutation defaults together.
    if (!newItem.trim()) return;
    const next = [...items, { label: newItem.trim(), done: false }];
    upsert.mutate({
      entity_type: entityType,
      entity_id: entityId,
      items: next,
      title: checklist?.title ?? "Due diligence",
      status: checklist?.status ?? "in_progress",
    });
    setNewItem("");
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    upsert.mutate({
      entity_type: entityType,
      entity_id: entityId,
      items: next,
      title: checklist?.title ?? "Due diligence",
      status: checklist?.status ?? "in_progress",
    });
  };

  return (
    <div className="glass-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-primary" />
        </div>
        <h4 className="font-display font-semibold text-sm">Due Diligence Checklist</h4>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {doneCount}/{items.length}
        </span>
      </div>

      <p className="px-5 py-2 text-xs text-muted-foreground border-b border-border">
        Track tasks before making an offer. Add your own or use the defaults.
      </p>

      <div className="p-5 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 group"
                >
                  <button
                    onClick={() => toggleItem(idx)}
                    className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      item.done
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {item.done && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={`text-sm flex-1 ${
                      item.done ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                  <button
                    onClick={() => removeItem(idx)}
                    aria-label={`Remove "${item.label}"`}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs transition-opacity"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                placeholder="Add task..."
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              />
              <Button size="sm" onClick={addItem} disabled={!newItem.trim() || upsert.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
