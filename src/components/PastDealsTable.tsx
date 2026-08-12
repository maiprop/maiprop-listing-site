/**
 * PastDealsTable — displays historical auction rounds/deals from the OS database.
 * Shown only for premium users on auction property detail pages.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { accountQueryKey } from "@/lib/identityQueryBoundary";
import { canAccessPastDeals } from "@/lib/pastDealsAccess";

export interface PastDeal {
  round?: number;
  auction_date?: string;
  auctionDate?: string;
  starting_bid?: number;
  first_price?: number;
  final_price?: number;
  sold_price?: number;
  status?: string;
  court?: string;
  [key: string]: unknown;
}

interface PastDealsTableProps {
  listingId: string;
}

import { formatPrice, formatDate } from "@/lib/format";

export function PastDealsTable({ listingId }: PastDealsTableProps) {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const participantType = profile?.role ?? "unknown";
  const canLoadPastDeals = canAccessPastDeals(profile, isPro);

  const { data, isLoading, error } = useQuery({
    queryKey: accountQueryKey(
      user?.id,
      "past-deals",
      participantType,
      listingId,
    ),
    queryFn: async (): Promise<PastDeal[]> => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const { data: res, error: fnErr } = await supabase.functions.invoke(
        "fetch-past-deals-from-os",
        {
          body: { listing_id: listingId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (fnErr) throw fnErr;
      if (!res?.ok && res?.error) throw new Error(res.error);
      return res?.past_deals ?? [];
    },
    enabled: !!user && !!listingId && canLoadPastDeals,
    staleTime: 5 * 60 * 1000,
  });

  const deals = Array.isArray(data) ? data : [];
  const columns = [
    { key: "round", label: "Round" },
    { key: "auction_date", label: "Date", format: (d: PastDeal) => formatDate(d.auction_date ?? d.auctionDate) },
    { key: "starting_bid", label: "First Offer Price", format: (d: PastDeal) => formatPrice(d.starting_bid ?? d.first_price) },
    {
      key: "final_price",
      label: "Result",
      format: (d: PastDeal) => {
        const price = d.final_price ?? d.sold_price;
        if (price != null && Number.isFinite(Number(price))) return formatPrice(Number(price));
        return (d.status as string) ?? "—";
      },
    },
  ];

  if (!user || !canLoadPastDeals) {
    return (
      <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/5 p-6 text-center">
        <Lock className="w-8 h-8 text-brand-gold mx-auto mb-3 opacity-70" />
        <p className="text-sm font-medium text-foreground mb-1">Past Deals (Pro)</p>
        <p className="text-xs text-muted-foreground mb-4">Sign in and upgrade to Pro to see auction history from the OS database.</p>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-gold hover:underline"
        >
          View Pro plans <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
        <p className="text-sm text-muted-foreground">Loading past deals from OS…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
        <p className="text-sm text-destructive font-medium">Could not load past deals</p>
        <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-secondary/20 p-6 text-center">
        <History className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium text-foreground mb-1">No past deals</p>
        <p className="text-xs text-muted-foreground">No prior auction rounds found for this property in the OS database.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/50 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((deal, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              {columns.map((col) => {
                const val = col.format
                  ? col.format(deal)
                  : (deal[col.key] as string | number);
                return (
                  <td key={col.key} className="px-4 py-3 font-medium">
                    {val ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
