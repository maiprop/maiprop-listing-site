import { useState } from "react";
import { useMyConsultationRequests, useUpdateConsultationRequest, useBulkUpdateConsultationRequests } from "@/hooks/useConsultations";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckSquare, Square, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

export default function LeadManagement() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const { data: requests = [], isLoading } = useMyConsultationRequests();
  const updateOne = useUpdateConsultationRequest();
  const bulkUpdate = useBulkUpdateConsultationRequests();

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === requests.length) setSelected(new Set());
    else setSelected(new Set(requests.map((r: any) => r.id)));
  };

  const handleBulkStatus = () => {
    if (!bulkStatus || selected.size === 0) return;
    bulkUpdate.mutate({
      ids: Array.from(selected),
      updates: { lead_status: bulkStatus },
    });
    setSelected(new Set());
    setBulkStatus("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Lead Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consultation requests and inquiries. Update status, add notes, and bulk actions.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No leads yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Leads appear when clients request consultations from your profile.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">Set status…</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleBulkStatus} disabled={!bulkStatus}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {requests.map((r: any) => (
              <div
                key={r.id}
                className="glass-card rounded-xl p-4 flex items-start gap-4"
              >
                <button
                  onClick={() => toggleSelect(r.id)}
                  className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {selected.has(r.id) ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{r.requester_name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        (r.lead_status || "new") === "converted"
                          ? "bg-brand-emerald/20 text-brand-emerald"
                          : (r.lead_status || "new") === "lost"
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary"
                      }`}
                    >
                      {STATUS_LABELS[r.lead_status || "new"]}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {r.request_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <a href={`mailto:${r.requester_email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="w-3 h-3" /> {r.requester_email}
                    </a>
                    {r.requester_phone && (
                      <a href={`tel:${r.requester_phone}`} className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="w-3 h-3" /> {r.requester_phone}
                      </a>
                    )}
                  </div>
                  {r.message && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.message}</p>
                  )}
                  {r.notes && (
                    <p className="text-xs text-foreground/80 mt-1 italic">Note: {r.notes}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <select
                    value={r.lead_status || "new"}
                    onChange={(e) =>
                      updateOne.mutate({
                        id: r.id,
                        updates: { lead_status: e.target.value },
                      })
                    }
                    className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const note = prompt("Add or edit notes:", r.notes || "");
                      if (note !== null)
                        updateOne.mutate({ id: r.id, updates: { notes: note } });
                    }}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary"
                  >
                    {r.notes ? "Edit note" : "Add note"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
