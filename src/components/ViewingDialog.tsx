import { useState, useMemo } from "react";
import { Calendar, Video, MapPin, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Property } from "@/components/PropertyCard";
import { useBookViewing } from "@/hooks/useViewings";
import { createLocalDateTimeIso, formatLocalDateInput } from "@/lib/localDateTime";

interface ViewingDialogProps {
  open: boolean;
  onClose: () => void;
  property: Property;
  ownerId: string;
  /** If false, video viewing is disabled (Pro or buyers only). */
  canVideoView?: boolean;
}

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function buildDynamicDays(dayNames: string[], locale = "en-GB", isGreek = false): { label: string; date: string; iso: string }[] {
  const days: { label: string; date: string; iso: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const month = d.toLocaleString(locale, { month: "short" });
    const dayNum = d.getDate();
    days.push({
      label: dayNames[d.getDay()],
      date: isGreek ? `${dayNum} ${month}` : `${month} ${dayNum}`,
      iso: formatLocalDateInput(d),
    });
  }
  return days;
}

export default function ViewingDialog({ open, onClose, property, ownerId, canVideoView = true }: ViewingDialogProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isGreek = i18n?.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const [viewType, setViewType] = useState<"in-person" | "video">("in-person");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const bookViewing = useBookViewing();
  const loading = bookViewing.isPending;

  const translatedDayNames = useMemo(() => [
    t("viewingDialog.days.sun"),
    t("viewingDialog.days.mon"),
    t("viewingDialog.days.tue"),
    t("viewingDialog.days.wed"),
    t("viewingDialog.days.thu"),
    t("viewingDialog.days.fri"),
    t("viewingDialog.days.sat"),
  ], [t]);
  // `open` intentionally included to recompute fresh dates each time dialog opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => buildDynamicDays(translatedDayNames, dateLocale, isGreek), [open, translatedDayNames, dateLocale, isGreek]);

  const handleDaySelect = (day: { label: string; date: string; iso: string }) => {
    setSelectedDay(day.date);
    setSelectedIso(day.iso);
    setSelectedTime(null);
  };

  const handleBook = async () => {
    if (!user) { toast.error(isGreek ? "Συνδεθείτε για να ζητήσετε επίσκεψη" : "Please sign in to request a viewing"); return; }
    if (!ownerId) { toast.error(isGreek ? "Δεν ήταν δυνατός ο εντοπισμός του ιδιοκτήτη." : "Could not determine property owner."); return; }
    if (!selectedIso || !selectedTime) {
      toast.error(isGreek ? "Επιλέξτε ημερομηνία και ώρα" : "Please select a date and time");
      return;
    }
    try {
      await bookViewing.mutateAsync({
        listing_id: property.id,
        owner_id: ownerId,
        viewing_type: viewType === "video" ? "video" : "in_person",
        scheduled_at: createLocalDateTimeIso(selectedIso, selectedTime),
        note: note.trim() || undefined,
      });
    } catch (_err: unknown) {
      return;
    }
    setConfirmed(true);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {confirmed ? t("viewingDialog.successTitle") : t("viewingDialog.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isGreek ? "Επιλέξτε τύπο επίσκεψης, ημερομηνία, ώρα και προαιρετική σημείωση για αυτό το ακίνητο." : "Choose a viewing type, date, time, and optional note for this property."}
          </DialogDescription>
        </DialogHeader>

        {confirmed ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold">{property.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {viewType === "video" ? (isGreek ? "📹 Βιντεοκλήση" : "📹 Video viewing") : (isGreek ? "🏠 Επίσκεψη με φυσική παρουσία" : "🏠 In-person viewing")} {isGreek ? "στις" : "on"} {selectedDay} {isGreek ? "ώρα" : "at"} {selectedTime}
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-left space-y-2">
              <p className="text-muted-foreground">{t("viewingDialog.successMessage")}</p>
              {viewType === "video" && (
                <p className="text-primary">{t("viewingDialog.videoNote")}</p>
              )}
            </div>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={onClose}>
              {t("viewingDialog.done")}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Property mini card */}
            <div className="flex gap-3 p-3 bg-secondary rounded-xl">
              {property.images?.[0] && <img src={property.images[0]} className="w-14 h-14 rounded-lg object-cover" alt="" />}
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{property.title}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {property.city}
                </div>
              </div>
            </div>

            {/* Viewing type */}
            <div>
              <label className="text-sm font-medium block mb-2">{t("viewingDialog.viewingType")}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setViewType("in-person")}
                  className={`p-3 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${
                    viewType === "in-person"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {t("viewingDialog.inPerson")}
                </button>
                <button
                  onClick={() => canVideoView && setViewType("video")}
                  disabled={!canVideoView}
                  className={`p-3 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${
                    !canVideoView ? "opacity-60 cursor-not-allowed border-border" : viewType === "video"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  <Video className="w-4 h-4" />
                  {t("viewingDialog.video")}{!canVideoView && (isGreek ? " (Pro ή αγοραστές)" : " (Pro or buyers)")}
                </button>
              </div>
            </div>

            {/* Day selection */}
            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Επιλογή ημέρας" : "Select Day"}</label>
              <div className="grid grid-cols-7 gap-1">
                {days.map(day => (
                  <button
                    key={day.iso}
                    onClick={() => handleDaySelect(day)}
                    className={`p-2 rounded-lg text-center text-xs transition-all ${
                      selectedDay === day.date
                        ? "bg-gradient-primary text-primary-foreground"
                        : "bg-secondary border border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-semibold">{day.label}</div>
                    <div className="mt-0.5 opacity-70">{isGreek ? day.date.split(" ")[0] : day.date.split(" ")[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            {selectedDay && (
              <div>
                <label className="text-sm font-medium block mb-2">{isGreek ? "Επιλογή ώρας" : "Select Time"}</label>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map(time => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`py-2 rounded-lg text-sm transition-all ${
                        selectedTime === time
                          ? "bg-gradient-primary text-primary-foreground"
                          : "bg-secondary border border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Σημείωση (προαιρετικά)" : "Note (optional)"}</label>
              <textarea
                placeholder={isGreek ? "Τυχόν ειδικές απαιτήσεις ή ερωτήσεις..." : "Any specific requirements or questions..."}
                className="w-full bg-secondary border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground"
              disabled={!selectedDay || !selectedTime || loading}
              onClick={handleBook}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Calendar className="w-4 h-4 mr-2" />
              {isGreek ? "Επιβεβαίωση κράτησης" : "Confirm Booking"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
