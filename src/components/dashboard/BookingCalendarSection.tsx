/* eslint-disable @typescript-eslint/no-explicit-any */
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { VIEWING_STATUS_COLORS as LEAD_STATUS_COLORS } from "@/lib/statusColors";

type AgendaItem =
  | { type: "viewing"; date: string; item: any }
  | { type: "lead"; date: string; item: any };

export function BookingCalendarSection({
  viewings,
  leads,
  onGoToLeads,
  onGoToViewings,
  onGoToServices,
}: {
  viewings: any[];
  leads: any[];
  onGoToLeads: () => void;
  onGoToViewings: () => void;
  onGoToServices: () => void;
}) {
  const items: AgendaItem[] = [
    ...viewings
      .filter((v: any) => v.scheduled_at && ["pending", "confirmed"].includes(v.status))
      .map((v: any) => ({
        type: "viewing" as const,
        date: new Date(v.scheduled_at).toISOString().split("T")[0],
        item: v,
      })),
    ...leads
      .filter((l: any) => l.preferred_date && ["pending", "reviewed", "confirmed"].includes(l.status))
      .map((l: any) => ({ type: "lead" as const, date: l.preferred_date, item: l })),
  ];

  const byDate = items.reduce<Record<string, AgendaItem[]>>((acc, it) => {
    if (!acc[it.date]) acc[it.date] = [];
    acc[it.date].push(it);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="border-primary/40 text-primary" onClick={onGoToLeads}>
          View Leads
        </Button>
        <Button variant="outline" size="sm" className="border-border" onClick={onGoToViewings}>
          View Viewings
        </Button>
        <Button variant="outline" size="sm" className="border-border" onClick={onGoToServices}>
          Set Availability
        </Button>
      </div>

      {sortedDates.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No scheduled items</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Consultation requests and viewings will appear here when scheduled.
          </p>
          <Button variant="outline" className="border-primary/40 text-primary" onClick={onGoToLeads}>
            View Leads
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((dateStr) => (
            <div key={dateStr}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {new Date(dateStr).toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short", year: "numeric",
                })}
              </p>
              <div className="space-y-2">
                {byDate[dateStr].map((it, idx) => (
                  <div
                    key={`${it.type}-${it.item.id}-${idx}`}
                    className="glass-card rounded-xl p-4 flex items-center gap-4"
                  >
                    {it.type === "viewing" ? (
                      <>
                        <div className="w-2 h-10 rounded-full bg-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{it.item.listings?.title || "Viewing"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(it.item.scheduled_at).toLocaleTimeString([], {
                              hour: "2-digit", minute: "2-digit",
                            })}{" "}
                            · {it.item.viewing_type === "video" ? "Video" : "In-person"}
                          </p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                              it.item.status === "confirmed"
                                ? "bg-brand-emerald/20 text-brand-emerald"
                                : "bg-brand-gold/20 text-brand-gold"
                            }`}
                          >
                            {it.item.status}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-10 rounded-full bg-brand-gold shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{it.item.requester_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {it.item.service || "Consultation"} · {it.item.request_type}
                          </p>
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full mt-1 inline-block capitalize",
                              LEAD_STATUS_COLORS[it.item.status] ?? "bg-secondary text-muted-foreground",
                            )}
                          >
                            {it.item.status}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
