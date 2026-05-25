import { useState } from "react";
import { Video, CheckCircle2, Loader2, MapPin, Wifi } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBookViewing } from "@/hooks/useViewings";
import { useSubmitConsultation } from "@/hooks/useConsultations";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { createLocalDateTimeIso, formatLocalDateInput } from "@/lib/localDateTime";

const timeSlots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const platforms = [
  { id: "maiprop", label: "mAI prop video room", icon: "Video" },
  { id: "zoom", label: "Zoom", icon: "Video" },
  { id: "meet", label: "Google Meet", icon: "Camera" },
  { id: "teams", label: "MS Teams", icon: "Briefcase" },
  { id: "whatsapp", label: "WhatsApp Video", icon: "MessageCircle" },
];

const getNextDays = (count: number, locale = "en-GB") => {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push({
        label: d.toLocaleDateString(locale, { weekday: "short" }),
        date: formatLocalDateInput(d),
        display: d.toLocaleDateString(locale, { day: "numeric", month: "short" }),
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
};

interface OnlineViewingModalProps {
  open: boolean;
  onClose: () => void;
  listing?: {
    id: string;
    owner_id: string;
    title: string;
    city?: string | null;
    cover_image_url?: string | null;
  };
  professional?: {
    id: string;
    display_name?: string | null;
    title?: string | null;
  };
}

const OnlineViewingModal = ({ open, onClose, listing, professional }: OnlineViewingModalProps) => {
  const { user, profile } = useAuth();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const bookViewing = useBookViewing();
  const submitConsultation = useSubmitConsultation();

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [platform, setPlatform] = useState("maiprop");
  const [name, setName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const days = getNextDays(6, dateLocale);
  const isProperty = !!listing;
  const entityName = listing?.title ?? professional?.display_name ?? (isGreek ? "Επαγγελματίας" : "Professional");
  const isLoading = bookViewing.isPending || submitConsultation.isPending;

  const handleClose = () => {
    setDone(false);
    setSelectedDate("");
    setSelectedTime("");
    setNote("");
    onClose();
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) {
      toast.error(isGreek ? "Επιλέξτε ημερομηνία και ώρα" : "Please select a date and time");
      return;
    }
    const resolvedName = user ? (profile?.display_name || user.email || name) : name;
    const resolvedEmail = user ? (user.email || email) : email;
    if (!user && (!resolvedName.trim() || !resolvedEmail.trim())) {
      toast.error(isGreek ? "Συμπληρώστε όνομα και email" : "Please fill in your name and email");
      return;
    }

    try {
      if (listing) {
        if (!user) {
          toast.error(isGreek ? "Συνδεθείτε για να ζητήσετε βιντεοκλήση" : "Please sign in to request a video viewing");
          return;
        }
        await bookViewing.mutateAsync({
          listing_id: listing.id,
          owner_id: listing.owner_id,
          viewing_type: "video",
          scheduled_at: createLocalDateTimeIso(selectedDate, selectedTime),
          note: note || undefined,
        });
      } else if (professional) {
        await submitConsultation.mutateAsync({
          professional_id: professional.id,
          requester_name: resolvedName,
          requester_email: resolvedEmail,
          request_type: "consultation",
          preferred_date: selectedDate,
          preferred_time: selectedTime,
          message: [
            `Preferred meeting platform: ${platforms.find((p) => p.id === platform)?.label ?? "Video call"}`,
            note,
          ].filter(Boolean).join("\n"),
        });
      } else {
        toast.error(isGreek ? "Συνδεθείτε για να ζητήσετε βιντεοκλήση" : "Please sign in to request a video viewing");
        return;
      }
      setDone(true);
    } catch (_err: unknown) {
      toast.error(isGreek ? "Δεν ήταν δυνατή η υποβολή του αιτήματος. Δοκιμάστε ξανά." : "Could not submit the request. Please try again.");
    }
  };

  const selectedDayDisplay = days.find((d) => d.date === selectedDate);
  const selectedPlatform = platforms.find((p) => p.id === platform);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            {done ? (isGreek ? "Το αίτημα βιντεοκλήσης εστάλη" : "Video Request Sent") : (isGreek ? "Αίτημα βιντεοκλήσης" : "Request a Video Viewing")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isGreek ? "Επιλέξτε ημερομηνία, ώρα και προτιμώμενη πλατφόρμα για το αίτημα βιντεοκλήσης." : "Choose a date, time, and preferred platform for a video viewing request."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{isGreek ? "Το αίτημα βιντεοκλήσης υποβλήθηκε." : "Video request submitted."}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isGreek ? "Ο οικοδεσπότης πρέπει να επιβεβαιώσει την ώρα και τις λεπτομέρειες πριν ενεργοποιηθεί η συνεδρία." : "The host still needs to confirm the time and delivery details before the session is live."}
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isProperty ? (isGreek ? "Ακίνητο" : "Property") : (isGreek ? "Με" : "With")}</span>
                <span className="font-medium truncate max-w-[180px]">{entityName}</span>
              </div>
              {selectedDayDisplay && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isGreek ? "Ημερομηνία & ώρα" : "Date & Time"}</span>
                  <span className="font-medium">{selectedDayDisplay.display} {isGreek ? "στις" : "at"} {selectedTime}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isGreek ? "Προτιμώμενη πλατφόρμα" : "Preferred Platform"}</span>
                <span className="font-medium">{selectedPlatform?.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg p-3 text-left">
              <Wifi className="w-4 h-4 text-primary shrink-0" />
              {isProperty
                ? (isGreek ? "Ο ιδιοκτήτης μπορεί να επιβεβαιώσει την κράτηση και να χρησιμοποιήσει την ενσωματωμένη αίθουσα βίντεο mAI prop ή να προσθέσει εξωτερικό σύνδεσμο." : "The listing owner can confirm the booking and use the built-in mAI prop video room, or add an external meeting link.")
                : (isGreek ? "Ο επαγγελματίας μπορεί να επιβεβαιώσει αυτή την πλατφόρμα, να στείλει διαφορετικό σύνδεσμο ή να χρησιμοποιήσει την ενσωματωμένη αίθουσα βίντεο mAI prop." : "The professional may confirm this platform, share a different link, or use the built-in mAI prop video room.")}
            </div>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleClose}>{isGreek ? "Τέλος" : "Done"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
              {isProperty && listing?.cover_image_url ? (
                <img src={listing.cover_image_url} alt={entityName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
                  {isProperty ? "PR" : entityName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{entityName}</div>
                {isProperty && listing?.city && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3" /> {listing.city}
                  </div>
                )}
                {!isProperty && professional?.title && (
                  <div className="text-xs text-muted-foreground mt-0.5">{professional.title}</div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Προτιμώμενη πλατφόρμα βίντεο" : "Preferred Video Platform"}</label>
              <div className="grid grid-cols-2 gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={`p-2.5 rounded-xl border text-sm flex items-center gap-2 transition-all ${
                      platform === p.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span className="font-medium text-xs">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Επιλογή ημερομηνίας" : "Select Date"}</label>
              <div className="grid grid-cols-3 gap-2">
                {days.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`p-2.5 rounded-xl border text-center text-xs transition-all ${
                      selectedDate === day.date ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-semibold">{day.label}</div>
                    <div className="mt-0.5 opacity-80">{day.display}</div>
                  </button>
                ))}
              </div>
            </div>

            {selectedDate && (
              <div>
                <label className="text-sm font-medium block mb-2">{isGreek ? "Επιλογή ώρας" : "Select Time"}</label>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`py-2 rounded-lg border text-sm transition-all ${
                        selectedTime === time ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!user && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{isGreek ? "Ονοματεπώνυμο *" : "Your Name *"}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isGreek ? "Ονοματεπώνυμο" : "Full name"}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Email *</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    type="email"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{isGreek ? "Μήνυμα (προαιρετικά)" : "Message (optional)"}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={isGreek ? "Ερωτήσεις ή συγκεκριμένα σημεία που θέλετε να δείτε..." : "Any questions or specific areas you'd like to focus on..."}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="border-border" onClick={handleClose}>{isGreek ? "Άκυρο" : "Cancel"}</Button>
              <Button className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={handleBook} disabled={isLoading || !selectedDate || !selectedTime}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                {isGreek ? "Αίτημα βιντεοκλήσης" : "Request Video Viewing"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OnlineViewingModal;
