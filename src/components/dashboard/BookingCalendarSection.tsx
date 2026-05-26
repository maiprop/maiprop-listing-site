import { Calendar, Check, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createProfessionalVideoRoomPath } from "@/lib/videoRooms";

import { VIEWING_STATUS_COLORS as LEAD_STATUS_COLORS } from "@/lib/statusColors";

export type BookingCalendarViewing = {
  id: string;
  scheduled_at?: string | null;
  status?: string | null;
  viewing_type?: string | null;
  listings?: { title?: string | null } | null;
};

export type BookingCalendarLead = {
  id: string;
  preferred_date?: string | null;
  status?: string | null;
  requester_name?: string | null;
  request_type?: string | null;
  service?: string | null;
  meeting_type?: string | null;
  message?: string | null;
  professional_id?: string | null;
};

type ScheduledViewing = BookingCalendarViewing & { scheduled_at: string; status: string };
type ScheduledLead = BookingCalendarLead & { preferred_date: string; status: string };

type AgendaItem =
  | { type: "viewing"; date: string; item: ScheduledViewing }
  | { type: "lead"; date: string; item: ScheduledLead };

function isVideoConsultation(item: BookingCalendarLead) {
  return item.meeting_type === "video" || /video consultation requested/i.test(item.message ?? "");
}

const isScheduledViewing = (viewing: BookingCalendarViewing): viewing is ScheduledViewing =>
  Boolean(viewing.scheduled_at && viewing.status && ["pending", "confirmed"].includes(viewing.status));

const isScheduledLead = (lead: BookingCalendarLead): lead is ScheduledLead =>
  Boolean(lead.preferred_date && lead.status && ["pending", "reviewed", "confirmed"].includes(lead.status));

export function BookingCalendarSection({
  viewings,
  leads,
  onGoToLeads,
  onGoToViewings,
  onGoToServices,
  onUpdateConsultation,
  consultationUpdating = false,
}: {
  viewings: BookingCalendarViewing[];
  leads: BookingCalendarLead[];
  onGoToLeads: () => void;
  onGoToViewings: () => void;
  onGoToServices: () => void;
  onUpdateConsultation?: (id: string, status: "confirmed" | "cancelled") => void;
  consultationUpdating?: boolean;
}) {
  const items: AgendaItem[] = [
    ...viewings
      .filter(isScheduledViewing)
      .map((v) => ({
        type: "viewing" as const,
        date: new Date(v.scheduled_at).toISOString().split("T")[0],
        item: v,
      })),
    ...leads
      .filter(isScheduledLead)
      .map((l) => ({ type: "lead" as const, date: l.preferred_date, item: l })),
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
                          {it.item.status === "confirmed" && isVideoConsultation(it.item) && it.item.professional_id && (
                            <Button
                              asChild
                              size="sm"
                              className="mt-3 h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              <a href={createProfessionalVideoRoomPath(it.item.professional_id, it.item.id)}>
                                <Video className="w-3.5 h-3.5" />
                                Join room
                              </a>
                            </Button>
                          )}
                          {it.item.status === "pending" && onUpdateConsultation && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                className="h-8 gap-1.5 bg-brand-emerald hover:bg-brand-emerald/90 text-white"
                                disabled={consultationUpdating}
                                onClick={() => onUpdateConsultation(it.item.id, "confirmed")}
                              >
                                <Check className="w-3.5 h-3.5" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                                disabled={consultationUpdating}
                                onClick={() => onUpdateConsultation(it.item.id, "cancelled")}
                              >
                                <X className="w-3.5 h-3.5" />
                                Decline
                              </Button>
                            </div>
                          )}
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
