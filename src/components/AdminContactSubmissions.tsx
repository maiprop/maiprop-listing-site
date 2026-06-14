/**
 * AdminContactSubmissions - platform contact/document-share inbox.
 */

import { useMemo, useState } from "react";
import { Ban, CheckCircle, Clock, FileText, Inbox, Loader2, Mail, RefreshCw, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/format";
import { parseMutationInput, rowUpdateMutationSchema } from "@/lib/mutationSchemas";

type SubmissionStatus = "new" | "in_review" | "handled" | "spam";
type SubmissionFilter = "all" | SubmissionStatus;

type ContactSubmission = {
  id: string;
  type: string;
  name: string | null;
  email: string;
  company: string | null;
  message: string | null;
  document_type: string | null;
  listing_title: string | null;
  share_to_email: string | null;
  status: SubmissionStatus;
  handled_at: string | null;
  handled_by: string | null;
  admin_notes: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string; icon: typeof Clock }> = {
  new: {
    label: "New",
    className: "border-brand-gold/30 bg-brand-gold/10 text-brand-gold",
    icon: Clock,
  },
  in_review: {
    label: "In Review",
    className: "border-primary/30 bg-primary/10 text-primary",
    icon: Search,
  },
  handled: {
    label: "Handled",
    className: "border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald",
    icon: CheckCircle,
  },
  spam: {
    label: "Spam",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: Ban,
  },
};

const FILTERS: { key: SubmissionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_review", label: "In Review" },
  { key: "handled", label: "Handled" },
  { key: "spam", label: "Spam" },
];

function useAdminContactSubmissions() {
  return useQuery<ContactSubmission[]>({
    queryKey: ["admin-contact-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_submissions")
        .select("id, type, name, email, company, message, document_type, listing_title, share_to_email, status, handled_at, handled_by, admin_notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactSubmission[];
    },
  });
}

function useUpdateSubmission() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"contact_submissions"> }) => {
      const payload: TablesUpdate<"contact_submissions"> = { ...updates };
      if (updates.status === "handled" || updates.status === "spam") {
        payload.handled_at = new Date().toISOString();
        payload.handled_by = user?.id ?? null;
      }
      if (updates.status === "new" || updates.status === "in_review") {
        payload.handled_at = null;
        payload.handled_by = null;
      }
      const validated = parseMutationInput(
        rowUpdateMutationSchema,
        { id, updates: payload },
        "contact submission update",
      );

      const { error } = await supabase
        .from("contact_submissions")
        .update(validated.updates as TablesUpdate<"contact_submissions">)
        .eq("id", validated.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contact-submissions"] });
      toast.success("Submission updated");
    },
    onError: () => toast.error("Could not update submission"),
  });
}

function submissionTitle(row: ContactSubmission): string {
  return row.name || row.company || row.email;
}

function submissionContext(row: ContactSubmission): string {
  if (row.type === "document_share") {
    return [row.document_type, row.listing_title, row.share_to_email].filter(Boolean).join(" - ") || "Document share";
  }
  return row.company || "General inquiry";
}

export default function AdminContactSubmissions() {
  const [filter, setFilter] = useState<SubmissionFilter>("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const { data: submissions = [], isLoading, refetch } = useAdminContactSubmissions();
  const updateSubmission = useUpdateSubmission();

  const counts = useMemo(() => ({
    all: submissions.length,
    new: submissions.filter(s => s.status === "new").length,
    in_review: submissions.filter(s => s.status === "in_review").length,
    handled: submissions.filter(s => s.status === "handled").length,
    spam: submissions.filter(s => s.status === "spam").length,
  }), [submissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return [
        row.name,
        row.email,
        row.company,
        row.message,
        row.listing_title,
        row.share_to_email,
      ].some(value => value?.toLowerCase().includes(q));
    });
  }, [filter, search, submissions]);

  const startNotesEdit = (row: ContactSubmission) => {
    setEditingId(row.id);
    setDraftNotes(row.admin_notes ?? "");
  };

  const saveNotes = (id: string) => {
    updateSubmission.mutate(
      { id, updates: { admin_notes: draftNotes.trim() || null } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Contact Submissions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Platform contact, enterprise, and document-share requests.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 self-start"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {FILTERS.map(({ key, label }) => {
          const count = counts[key];
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/60"
              }`}
            >
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
              <span className="font-display text-2xl font-black text-foreground">{count}</span>
            </button>
          );
        })}
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search submissions"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </label>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-16 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No submissions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const status = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.new;
            const StatusIcon = status.icon;
            const isEditing = editingId === row.id;
            const isPending = updateSubmission.isPending;

            return (
              <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={status.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {row.type.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
                    </div>
                    <div>
                      <p className="font-display font-semibold text-base break-words">{submissionTitle(row)}</p>
                      <p className="text-xs text-muted-foreground break-words">{submissionContext(row)}</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <a className="text-primary hover:underline" href={`mailto:${row.email}`}>{row.email}</a>
                      </span>
                      {row.type === "document_share" && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {row.share_to_email || "No recipient"}
                        </span>
                      )}
                    </div>
                    {row.message && (
                      <p className="max-w-4xl whitespace-pre-wrap rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground/90">
                        {row.message}
                      </p>
                    )}
                    {row.admin_notes && !isEditing && (
                      <p className="max-w-4xl whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                        {row.admin_notes}
                      </p>
                    )}
                    {isEditing && (
                      <div className="space-y-2">
                        <textarea
                          value={draftNotes}
                          onChange={(event) => setDraftNotes(event.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          placeholder="Admin notes"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-9" onClick={() => saveNotes(row.id)} disabled={isPending}>
                            Save notes
                          </Button>
                          <Button size="sm" variant="outline" className="h-9" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap xl:justify-end gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => updateSubmission.mutate({ id: row.id, updates: { status: "in_review" } })}
                      disabled={isPending || row.status === "in_review"}
                    >
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => updateSubmission.mutate({ id: row.id, updates: { status: "handled" } })}
                      disabled={isPending || row.status === "handled"}
                    >
                      Mark handled
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-muted-foreground"
                      onClick={() => startNotesEdit(row)}
                    >
                      Notes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-destructive hover:text-destructive"
                      onClick={() => updateSubmission.mutate({ id: row.id, updates: { status: "spam" } })}
                      disabled={isPending || row.status === "spam"}
                    >
                      Spam
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
