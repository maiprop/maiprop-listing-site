import { useState } from "react";
import {
  useLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  LEAD_STATUSES,
  LEAD_SOURCES,
} from "@/hooks/useLeads";
import { Button } from "@/components/ui/button";
import {
  Loader2, UserPlus, Plus, Mail, Phone, Trash2, Edit2, Calendar,
  LayoutGrid, List, Clock, ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-brand-gold/15 text-brand-gold border-brand-gold/20",
  contacted: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  qualified: "bg-primary/15 text-primary border-primary/20",
  proposal: "bg-accent/15 text-accent border-accent/20",
  negotiation: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  won: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/20",
  lost: "bg-muted text-muted-foreground border-border",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  listing_inquiry: "Listing",
  consultation: "Consultation",
  callback: "Callback",
  project_inquiry: "Project",
  viewing: "Viewing",
  message: "Message",
};

export default function LeadsCRM() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"pipeline" | "list">("pipeline");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    notes: "",
    source: "manual" as const,
    status: "new" as const,
    follow_up_at: "",
  });

  const { data: leads = [], isLoading } = useLeads();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      message: "",
      notes: "",
      source: "manual",
      status: "new",
      follow_up_at: "",
    });
    setAdding(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const updates = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      message: form.message || null,
      source: form.source,
      status: form.status,
      notes: form.notes || null,
      follow_up_at: form.follow_up_at || null,
    };
    if (editing) {
      await updateLead.mutateAsync({ id: editing, updates });
    } else {
      await createLead.mutateAsync(updates);
    }
    resetForm();
  };

  const handleStatusChange = (leadId: string, status: string) => {
    updateLead.mutate({ id: leadId, updates: { status } });
  };

  const pipelineCols = [...LEAD_STATUSES];
  const leadsByStatus = pipelineCols.reduce((acc, s) => {
    acc[s] = leads.filter((l: any) => (l.status || "new") === s);
    return acc;
  }, {} as Record<string, any[]>);

  const followUpsToday = leads.filter((l: any) => {
    if (!l.follow_up_at) return false;
    return new Date(l.follow_up_at).toDateString() === new Date().toDateString();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Incoming inquiries — pipeline, status & follow-ups.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("pipeline")}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                viewMode === "pipeline" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-4 h-4 inline mr-1.5" /> Pipeline
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-4 h-4 inline mr-1.5" /> List
            </button>
          </div>
          <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add Lead
          </Button>
        </div>
      </div>

      {followUpsToday.length > 0 && (
        <div className="glass-card rounded-xl p-4 border-l-4 border-brand-gold flex items-center gap-3">
          <Clock className="w-5 h-5 text-brand-gold shrink-0" />
          <div>
            <p className="font-semibold text-sm">Follow-ups today ({followUpsToday.length})</p>
            <p className="text-xs text-muted-foreground">
              {followUpsToday.map((l: any) => l.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {(adding || editing) && (
        <div className="glass-card rounded-xl p-5 border border-primary/20">
          <h3 className="font-display font-semibold text-sm mb-4">{editing ? "Edit Lead" : "New Lead"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <select
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as any }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Follow-up</label>
              <input
                type="datetime-local"
                value={form.follow_up_at}
                onChange={(e) => setForm((f) => ({ ...f, follow_up_at: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <textarea
            placeholder="Message / Notes"
            value={form.message || form.notes}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value, notes: e.target.value }))}
            className="w-full mt-3 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm min-h-[60px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
          />
          <div className="flex gap-2 mt-4">
            <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" className="border-border" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : leads.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <UserPlus className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No leads yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add leads manually or capture from listing inquiries.</p>
          <Button className="mt-4 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Lead
          </Button>
        </div>
      ) : viewMode === "pipeline" ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {pipelineCols.map((stage) => (
            <div key={stage} className="w-64 shrink-0 glass-card rounded-xl p-3 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", STATUS_COLORS[stage])}>
                  {STATUS_LABELS[stage]}
                </span>
                <span className="text-xs text-muted-foreground">{(leadsByStatus[stage] || []).length}</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {(leadsByStatus[stage] || []).map((l: any) => (
                  <div
                    key={l.id}
                    className="glass-card rounded-lg p-3 border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{l.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {SOURCE_LABELS[l.source] || l.source}
                        </p>
                        {l.email && (
                          <a href={`mailto:${l.email}`} className="text-xs text-primary/80 hover:text-primary flex items-center gap-0.5 mt-1 truncate">
                            <Mail className="w-3 h-3 shrink-0" /> {l.email}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditing(l.id);
                            setForm({
                              name: l.name,
                              email: l.email || "",
                              phone: l.phone || "",
                              message: l.message || "",
                              source: l.source || "manual",
                              status: l.status || "new",
                              notes: l.notes || "",
                              follow_up_at: l.follow_up_at ? l.follow_up_at.slice(0, 16) : "",
                            });
                          }}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Delete this lead?")) deleteLead.mutate(l.id); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {pipelineCols.filter((s) => s !== (l.status || "new")).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(l.id, s)}
                          className={cn("text-[10px] px-1.5 py-0.5 rounded border transition-colors", STATUS_COLORS[s], "hover:opacity-80")}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {l.listing_id && l.listings && (
                      <Link
                        to={`/property/${l.listing_id}`}
                        className="text-[10px] text-primary/80 hover:text-primary flex items-center gap-0.5 mt-2"
                      >
                        <ExternalLink className="w-3 h-3" /> {(l.listings as any).title}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((l: any) => (
            <div key={l.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{l.name}</p>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", STATUS_COLORS[l.status || "new"])}>
                    {STATUS_LABELS[l.status || "new"]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{SOURCE_LABELS[l.source] || l.source}</span>
                  {l.follow_up_at && (
                    <span className="text-xs text-brand-gold flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" /> {new Date(l.follow_up_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                  {l.email && <a href={`mailto:${l.email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="w-3 h-3" /> {l.email}</a>}
                  {l.phone && <a href={`tel:${l.phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="w-3 h-3" /> {l.phone}</a>}
                </div>
                {(l.message || l.notes) && <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{l.message || l.notes}</p>}
                {l.listing_id && l.listings && (
                  <Link to={`/property/${l.listing_id}`} className="text-xs text-primary/80 hover:text-primary flex items-center gap-0.5 mt-1">
                    <ExternalLink className="w-3 h-3" /> {(l.listings as any).title}
                  </Link>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { setEditing(l.id); setForm({ name: l.name, email: l.email || "", phone: l.phone || "", message: l.message || "", source: l.source || "manual", status: l.status || "new", notes: l.notes || "", follow_up_at: l.follow_up_at ? l.follow_up_at.slice(0, 16) : "" }); }}
                  className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => { if (confirm("Delete?")) deleteLead.mutate(l.id); }} className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
