import { useMemo, useState } from "react";
import { Inbox, RefreshCw, FileText, Mail, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

type SubmissionType = "all" | "contact" | "document_share";

type ContactSubmission = {
  id: string;
  type: "contact" | "document_share";
  name: string | null;
  email: string;
  company: string | null;
  message: string | null;
  document_type: string | null;
  listing_title: string | null;
  share_to_email: string | null;
  created_at: string;
};

export default function AdminContactSubmissions() {
  const [filter, setFilter] = useState<SubmissionType>("all");
  const { data = [], isLoading, refetch } = useQuery<ContactSubmission[]>({
    queryKey: ["admin-contact-submissions"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("contact_submissions")
        .select("id, type, name, email, company, message, document_type, listing_title, share_to_email, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (rows ?? []) as ContactSubmission[];
    },
  });

  const filtered = useMemo(
    () => data.filter((row) => filter === "all" || row.type === filter),
    [data, filter],
  );

  const counts = {
    all: data.length,
    contact: data.filter((row) => row.type === "contact").length,
    document_share: data.filter((row) => row.type === "document_share").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" /> Contact Inbox
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Public contact and document-share submissions.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "contact", "document_share"] as SubmissionType[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary/40"
            }`}
          >
            {key === "document_share" ? "Document shares" : key[0].toUpperCase() + key.slice(1)} ({counts[key]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          No submissions found.
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={row.type === "document_share" ? "secondary" : "outline"} className="gap-1">
                      {row.type === "document_share" ? <FileText className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                      {row.type === "document_share" ? "Document share" : "Contact"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground">
                    {row.name || row.email}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <a href={`mailto:${row.email}`} className="hover:text-primary">{row.email}</a>
                    {row.company && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {row.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {row.type === "document_share" && (
                <div className="grid sm:grid-cols-3 gap-2 text-xs">
                  <p><span className="text-muted-foreground">Document:</span> {row.document_type || "N/A"}</p>
                  <p><span className="text-muted-foreground">Listing:</span> {row.listing_title || "N/A"}</p>
                  <p><span className="text-muted-foreground">Share to:</span> {row.share_to_email || "N/A"}</p>
                </div>
              )}

              {row.message && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{row.message}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
