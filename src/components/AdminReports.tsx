/**
 * Listing reports for admin. Shows entity id, reporter user id, date.
 */

import { useState, useEffect } from "react";
import { Flag, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

type ReportRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  reporter_id: string | null;
  created_at: string;
};

export default function AdminReports() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("listing_reports" as any)
        .select("id, entity_type, entity_id, reporter_id, created_at")
        .order("created_at", { ascending: false });
      if (!mounted) return;
      if (error) {
        setReports([]);
        setLoading(false);
        return;
      }
      setReports((data as any) || []);
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getLinkForEntity = (entityType: string, entityId: string) => {
    if (entityType === "firesale_request") return `/admin?tab=pipeline`;
    return `/property/${entityId}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <Flag className="w-5 h-5 text-brand-gold" /> Listing Reports
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          User reports on listings, auctions, open houses, and firesale requests. Review and take action as needed.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No reports yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Property / Entity ID</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Reporter User ID</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.entity_id}</td>
                    <td className="px-4 py-3 capitalize">{r.entity_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.reporter_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={getLinkForEntity(r.entity_type, r.entity_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
