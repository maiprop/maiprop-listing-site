/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { toast } from "sonner";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useContactTasks,
  useCreateContactTask,
  useUpdateContactTask,
  DEAL_STAGES,
} from "@/hooks/useContacts";
import { Button } from "@/components/ui/button";
import {
  Loader2, Users, Plus, Mail, Phone, Trash2, Edit2, Calendar, CheckSquare,
  LayoutGrid, List, Clock, ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LEAD_STAGE_COLORS } from "@/lib/statusColors";

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export default function ContactsCRM() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"pipeline" | "list">("pipeline");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
    notes: "",
    deal_stage: "new",
    follow_up_at: "",
  });
  const [taskForm, setTaskForm] = useState({ title: "", due_at: "" });

  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const createTask = useCreateContactTask();
  const updateTask = useUpdateContactTask();

  const { data: tasks = [] } = useContactTasks(expandedId);

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      source: "",
      notes: "",
      deal_stage: "new",
      follow_up_at: "",
    });
    setAdding(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const updates: Record<string, unknown> = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source || null,
      notes: form.notes || null,
      deal_stage: form.deal_stage,
      follow_up_at: form.follow_up_at || null,
    };
    if (editing) {
      await updateContact.mutateAsync({ id: editing, updates });
    } else {
      await createContact.mutateAsync(updates as Parameters<typeof createContact.mutateAsync>[0]);
    }
    resetForm();
  };

  const handleAddTask = async () => {
    if (!expandedId || !taskForm.title.trim()) return;
    await createTask.mutateAsync({
      contactId: expandedId,
      title: taskForm.title.trim(),
      dueAt: taskForm.due_at || null,
    });
    setTaskForm({ title: "", due_at: "" });
  };

  const handleStageChange = (contactId: string, stage: string) => {
    updateContact.mutate({ id: contactId, updates: { deal_stage: stage } });
  };

  const pipelineCols = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];
  const contactsByStage = pipelineCols.reduce((acc, s) => {
    acc[s] = contacts.filter((c: any) => (c.deal_stage || "new") === s);
    return acc;
  }, {} as Record<string, any[]>);

  const followUpsToday = contacts.filter((c: any) => {
    if (!c.follow_up_at) return false;
    const d = new Date(c.follow_up_at).toDateString();
    return d === new Date().toDateString();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">CRM — pipeline, deal stages, tasks & follow-ups.</p>
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
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={() => {
              setAdding(true);
              setForm({
                name: "",
                email: "",
                phone: "",
                source: "",
                notes: "",
                deal_stage: "new",
                follow_up_at: "",
              });
            }}
          >
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>
      </div>

      {followUpsToday.length > 0 && (
        <div className="glass-card rounded-xl p-4 border-l-4 border-brand-gold flex items-center gap-3">
          <Clock className="w-5 h-5 text-brand-gold shrink-0" />
          <div>
            <p className="font-semibold text-sm">Follow-ups today ({followUpsToday.length})</p>
            <p className="text-xs text-muted-foreground">
              {followUpsToday.map((c: any) => c.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Add/Edit form */}
      {(adding || editing) && (
        <div className="glass-card rounded-xl p-5 border border-primary/20">
          <h3 className="font-display font-semibold text-sm mb-4">{editing ? "Edit Contact" : "New Contact"}</h3>
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
            <input
              placeholder="Source"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Deal stage</label>
              <select
                value={form.deal_stage}
                onChange={(e) => setForm((f) => ({ ...f, deal_stage: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Follow-up date</label>
              <input
                type="datetime-local"
                value={form.follow_up_at}
                onChange={(e) => setForm((f) => ({ ...f, follow_up_at: e.target.value }))}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
      ) : contacts.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No contacts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add contacts to manage your pipeline.</p>
          <Button className="mt-4 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Contact
          </Button>
        </div>
      ) : viewMode === "pipeline" ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {pipelineCols.map((stage) => (
            <div
              key={stage}
              className="w-64 shrink-0 glass-card rounded-xl p-3 border border-border"
            >
              <div className="flex items-center justify-between mb-3">
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", LEAD_STAGE_COLORS[stage])}>
                  {STAGE_LABELS[stage]}
                </span>
                <span className="text-xs text-muted-foreground">{(contactsByStage[stage] || []).length}</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {(contactsByStage[stage] || []).map((c: any) => (
                  <ContactCard
                    key={c.id}
                    contact={c}
                    onEdit={() => {
                      setEditing(c.id);
                      setForm({
                        name: c.name,
                        email: c.email || "",
                        phone: c.phone || "",
                        source: c.source || "",
                        notes: c.notes || "",
                        deal_stage: c.deal_stage || "new",
                        follow_up_at: c.follow_up_at ? c.follow_up_at.slice(0, 16) : "",
                      });
                    }}
                    onDelete={() => setDeleteTarget(c.id)}
                    onStageChange={(s) => handleStageChange(c.id, s)}
                    expanded={expandedId === c.id}
                    onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    tasks={expandedId === c.id ? tasks : []}
                    taskForm={taskForm}
                    onTaskFormChange={setTaskForm}
                    onAddTask={handleAddTask}
                    onCompleteTask={(id) => updateTask.mutate({ id, updates: { completed_at: new Date().toISOString() } })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((c: any) => (
            <div
              key={c.id}
              className="glass-card rounded-xl p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{c.name}</p>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", LEAD_STAGE_COLORS[c.deal_stage || "new"])}>
                    {STAGE_LABELS[c.deal_stage || "new"]}
                  </span>
                  {c.follow_up_at && (
                    <span className="text-xs text-brand-gold flex items-center gap-0.5">
                      <Calendar className="w-3 h-3" /> {new Date(c.follow_up_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="w-3 h-3" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{c.notes}</p>
                )}
                {c.listing_id && c.listings && (
                  <Link
                    to={`/property/${c.listing_id}`}
                    className="text-xs text-primary/80 hover:text-primary flex items-center gap-0.5 mt-1"
                  >
                    <ExternalLink className="w-3 h-3" /> {(c.listings as { title?: string } | null)?.title}
                  </Link>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    setEditing(c.id);
                    setForm({
                      name: c.name,
                      email: c.email || "",
                      phone: c.phone || "",
                      source: c.source || "",
                      notes: c.notes || "",
                      deal_stage: c.deal_stage || "new",
                      follow_up_at: c.follow_up_at ? c.follow_up_at.slice(0, 16) : "",
                    });
                  }}
                  className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Tasks"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(c.id)}
                  className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {expandedId && viewMode === "list" && (
        <div className="glass-card rounded-xl p-4 border border-primary/20">
          <h3 className="font-display font-semibold text-sm mb-3">Tasks</h3>
          <div className="flex gap-2 mb-3">
            <input
              placeholder="Task title"
              value={taskForm.title}
              onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="date"
              value={taskForm.due_at}
              onChange={(e) => setTaskForm((f) => ({ ...f, due_at: e.target.value }))}
              className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button size="sm" onClick={handleAddTask} disabled={!taskForm.title.trim()}>
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {tasks.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                <button
                  onClick={() => updateTask.mutate({ id: t.id, updates: { completed_at: t.completed_at ? null : new Date().toISOString() } })}
                  className="shrink-0"
                >
                  <CheckSquare className={cn("w-4 h-4", t.completed_at ? "text-brand-emerald" : "text-muted-foreground")} />
                </button>
                <span className={cn("flex-1 text-sm", t.completed_at && "line-through text-muted-foreground")}>{t.title}</span>
                {t.due_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.due_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet</p>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete contact?"
        description="This will permanently remove the contact and all their tasks."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteContact.mutate(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ContactCard({
  contact,
  onEdit,
  onDelete,
  onStageChange,
  expanded,
  onToggleExpand,
  tasks,
  taskForm,
  onTaskFormChange,
  onAddTask,
  onCompleteTask,
}: {
  contact: any;
  onEdit: () => void;
  onDelete: () => void;
  onStageChange: (stage: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  tasks: any[];
  taskForm: { title: string; due_at: string };
  onTaskFormChange: (f: typeof taskForm) => void;
  onAddTask: () => void;
  onCompleteTask: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-2 bg-card/50 hover:bg-card transition-colors">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{contact.name}</p>
          {contact.email && <p className="text-[10px] text-muted-foreground truncate">{contact.email}</p>}
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button onClick={onEdit} className="p-1 rounded hover:bg-secondary text-muted-foreground" aria-label="Edit">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={onToggleExpand} className="p-1 rounded hover:bg-secondary text-muted-foreground" aria-label="Tasks">
            <CheckSquare className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <select
        value={contact.deal_stage || "new"}
        onChange={(e) => onStageChange(e.target.value)}
        className="mt-1.5 w-full text-[10px] bg-secondary/50 border border-border rounded px-2 py-0.5 outline-none"
      >
        {DEAL_STAGES.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border space-y-2">
          <div className="flex gap-1">
            <input
              placeholder="New task"
              value={taskForm.title}
              onChange={(e) => onTaskFormChange({ ...taskForm, title: e.target.value })}
              className="flex-1 text-[10px] bg-secondary border border-border rounded px-2 py-1 outline-none"
            />
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={onAddTask} disabled={!taskForm.title.trim()}>
              Add
            </Button>
          </div>
          {tasks.map((t: any) => (
            <div key={t.id} className="flex items-center gap-1 text-[10px]">
              <button onClick={() => onCompleteTask(t.id)}>
                <CheckSquare className={cn("w-3 h-3", t.completed_at ? "text-brand-emerald" : "text-muted-foreground")} />
              </button>
              <span className={cn(t.completed_at && "line-through text-muted-foreground")}>{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
