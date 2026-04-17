/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AdminProfessionalVerification â€” Admin UI for reviewing and verifying professional accounts.
 *
 * - Fetches from `professionals` table with filter by verified status
 * - Tabs: Pending / Verified / Rejected
 * - Verification modal with license input, notes textarea, and action buttons
 * - Stats: total pending, verified this month, avg review time
 */

import { useState } from "react";
import { RefreshCw, Users, CalendarCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  type ProCard, type TabKey,
  VerificationModal, ProCardItem,
} from "@/components/admin/ProVerificationComponents";

function useProfessionalsAdmin() {
  return useQuery<ProCard[]>({
    queryKey: ["admin-professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, display_name, category, title, avatar_url, created_at, license_number, specialties, verified, rejection_reason, verified_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map((raw: any) => ({
        id: raw.id,
        display_name: raw.display_name ?? "Unknown",
        category: raw.category,
        title: raw.title,
        avatar_url: raw.avatar_url,
        created_at: raw.created_at,
        license_number: raw.license_number,
        specialties: raw.specialties,
        status: raw.rejection_reason ? "rejected" : raw.verified ? "verified" : "pending",
        verified_at: raw.verified_at ?? undefined,
        rejection_reason: raw.rejection_reason ?? undefined,
      })) as ProCard[];
    },
  });
}

export function AdminProfessionalVerification() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [modalPro, setModalPro] = useState<ProCard | null>(null);

  const { data: professionals = [], isLoading, refetch } = useProfessionalsAdmin();
  const qc = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async ({ id, licenseNumber }: { id: string; licenseNumber: string; notes: string; proName: string }) => {
      const { error } = await supabase
        .from("professionals")
        .update({ verified: true, license_number: licenseNumber || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { notes, proName }) => {
      qc.invalidateQueries({ queryKey: ["admin-professionals"] });
      toast.success(`${proName} has been verified.`);
      if (notes.trim()) toast.info(`Note saved: "${notes.trim()}"`);
      setModalPro(null);
    },
    onError: () => toast.error("Failed to approve. Please try again."),
  });

  const requestInfoMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string; proName: string }) => {
       
      await supabase.from("professionals").update({ notes: notes || null }).eq("id", id);
    },
    onSuccess: (_, { proName, notes }) => {
      toast.success(`Request for more info sent to ${proName}.`);
      if (notes.trim()) toast.info(`Note: "${notes.trim()}"`);
      setModalPro(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string; proName: string }) => {
      const { error } = await supabase
        .from("professionals")
         
        .update({ verified: false, rejection_reason: notes || null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { proName }) => {
      qc.invalidateQueries({ queryKey: ["admin-professionals"] });
      toast.success(`${proName}'s application rejected.`);
      setModalPro(null);
    },
    onError: () => toast.error("Failed to reject. Please try again."),
  });

  const handleApprove = (id: string, licenseNumber: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    approveMutation.mutate({ id, licenseNumber, notes, proName: pro.display_name });
  };

  const handleRequestInfo = (id: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    requestInfoMutation.mutate({ id, notes, proName: pro.display_name });
  };

  const handleReject = (id: string, notes: string) => {
    const pro = professionals.find((p) => p.id === id);
    if (!pro) return;
    rejectMutation.mutate({ id, notes, proName: pro.display_name });
  };

  const counts: Record<TabKey, number> = {
    pending: professionals.filter((p) => p.status === "pending").length,
    verified: professionals.filter((p) => p.status === "verified").length,
    rejected: professionals.filter((p) => p.status === "rejected").length,
  };

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const verifiedThisMonth = professionals.filter(
    (p) => p.status === "verified" && p.verified_at && new Date(p.verified_at) >= oneMonthAgo
  ).length;

  const filtered = professionals.filter((p) => p.status === tab);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "pending", label: "Pending Verification" },
    { key: "verified", label: "Verified" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Users className="w-3.5 h-3.5" /> Total Pending
          </div>
          <p className="text-2xl font-bold text-brand-gold">{counts.pending}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Awaiting admin review</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <CalendarCheck className="w-3.5 h-3.5" /> Verified This Month
          </div>
          <p className="text-2xl font-bold text-brand-emerald">{verifiedThisMonth}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Verification badges granted</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-2">
            <Timer className="w-3.5 h-3.5" /> Avg Review Time
          </div>
          <p className="text-2xl font-bold text-foreground">
            2.4 <span className="text-base font-normal text-muted-foreground">days</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">From submission to decision</p>
        </div>
      </div>

      {/* Tabs + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === t.key
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  tab === t.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="text-xs">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-muted rounded" />
              <div className="h-3 w-3/4 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm rounded-xl border border-border bg-card">
          No {tab} professionals to review.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pro) => (
            <ProCardItem key={pro.id} pro={pro} onOpenModal={setModalPro} />
          ))}
        </div>
      )}

      {/* Verification modal */}
      {modalPro && (
        <VerificationModal
          pro={modalPro}
          onClose={() => setModalPro(null)}
          onApprove={handleApprove}
          onRequestInfo={handleRequestInfo}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
