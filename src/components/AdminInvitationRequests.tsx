/**
 * Admin view for Quick Sale invitation requests. Admin can approve by adding to investor_subscriptions.
 */

import { useState, useEffect } from "react";
import { MailPlus, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isPlatformAdmin } from "@/lib/authUtils";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

type InvitationRequest = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  investment_focus: string | null;
  deal_size_range: string | null;
  investment_vehicle: string | null;
  message: string | null;
  user_id: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
};

export default function AdminInvitationRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<InvitationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const isAdmin = isPlatformAdmin(profile);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("invitation_requests" as any)
        .select("id, email, full_name, phone, company, job_title, investment_focus, deal_size_range, investment_vehicle, message, user_id, created_at, status")
        .order("created_at", { ascending: false });
      if (!mounted) return;
      if (error) {
        setRequests([]);
      } else {
        setRequests((data as any) || []);
      }
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [isAdmin]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from("invitation_requests" as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      toast.success(status === "approved" ? "Marked as approved" : "Marked as rejected");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Could not update");
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <MailPlus className="w-5 h-5 text-primary" /> Invitation Requests
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Users requesting Quick Sale™ investor access. Approve by adding them in{" "}
          <Link to="/admin?tab=subscribers" className="text-primary hover:underline">Subscribers</Link>.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No invitation requests yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Focus</th>
                  <th className="text-left px-4 py-3 font-medium">Deal size</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium w-24" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.company ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.job_title ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs capitalize">{r.investment_focus ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.deal_size_range ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.status === "pending" ? "bg-amber-500/15 text-amber-600" :
                        r.status === "approved" ? "bg-emerald-500/15 text-emerald-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-primary border-primary/30 hover:bg-primary/10"
                            onClick={() => updateStatus(r.id, "approved")}
                            disabled={updating === r.id}
                          >
                            {updating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => updateStatus(r.id, "rejected")}
                            disabled={updating === r.id}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
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
