import { useState } from "react";
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from "@/hooks/useContacts";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Plus, Mail, Phone, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

export default function ContactsCRM() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "", notes: "" });

  const { data: contacts = [], isLoading } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const resetForm = () => {
    setForm({ name: "", email: "", phone: "", source: "", notes: "" });
    setAdding(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      await updateContact.mutateAsync({
        id: editing,
        updates: form,
      });
    } else {
      await createContact.mutateAsync(form);
    }
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">CRM — manage your leads and contacts.</p>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setAdding(true);
            setForm({ name: "", email: "", phone: "", source: "", notes: "" });
          }}
        >
          <Plus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      {/* Add/Edit form */}
      {(adding || editing) && (
        <div className="glass-card rounded-xl p-5 border border-primary/20">
          <h3 className="font-semibold text-sm mb-4">{editing ? "Edit Contact" : "New Contact"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              placeholder="Source"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full mt-3 px-3 py-2 rounded-lg border border-border bg-background text-sm min-h-[60px]"
          />
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={resetForm}>
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
          <Button className="mt-4" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Contact
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((c: any) => (
            <div
              key={c.id}
              className="glass-card rounded-xl p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{c.name}</p>
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
                    });
                  }}
                  className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this contact?")) deleteContact.mutate(c.id);
                  }}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
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
