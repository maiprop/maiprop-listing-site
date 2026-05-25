import { useState } from "react";
import { CheckCircle2, Loader2, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitConsultation } from "@/hooks/useConsultations";
import { toast } from "sonner";
import { formatLocalDateInput } from "@/lib/localDateTime";

const callbackWindows = [
  { label: "Morning", labelEl: "Πρωί", time: "09:00 - 12:00" },
  { label: "Lunchtime", labelEl: "Μεσημέρι", time: "12:00 - 14:00" },
  { label: "Afternoon", labelEl: "Απόγευμα", time: "14:00 - 17:00" },
  { label: "Evening", labelEl: "Βράδυ", time: "17:00 - 20:00" },
];

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function getNextDays(count: number, locale: string) {
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
}

interface RequestCallbackModalProps {
  open: boolean;
  onClose: () => void;
  professional: {
    id: string;
    display_name?: string | null;
    title?: string | null;
  };
}

const SignInRequired = ({ firstName, isGreek }: { firstName: string; isGreek: boolean }) => (
  <div className="space-y-4 py-4">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground mb-1">{isGreek ? "Συνδεθείτε για να ζητήσετε κλήση" : "Sign in to request a callback"}</p>
      <p>{isGreek ? `${firstName} μπορεί να λάβει αιτήματα κλήσης μόνο από συνδεδεμένους λογαριασμούς mAI prop.` : `${firstName} can receive callback requests only from signed-in mAI prop accounts.`}</p>
    </div>
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" asChild>
      <a href="/login">{isGreek ? "Σύνδεση" : "Sign in"}</a>
    </Button>
  </div>
);

export default function RequestCallbackModal({ open, onClose, professional }: RequestCallbackModalProps) {
  const { user, profile } = useAuth();
  const { i18n } = useTranslation();
  const submitConsultation = useSubmitConsultation();

  const [phone, setPhone] = useState(profile?.phone || "");
  const [selectedDate, setSelectedDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const proName = professional.display_name || "Professional";
  const firstName = proName.split(" ")[0];
  const isGreek = i18n?.language?.toLowerCase().startsWith("el") ?? false;
  const days = getNextDays(5, isGreek ? "el-GR" : "en-GB");

  const handleClose = () => { setDone(false); setPhone(""); setSelectedDate(""); setCallbackTime(""); setNote(""); onClose(); };

  const handleSubmit = async () => {
    if (!user) { toast.error(isGreek ? "Συνδεθείτε για να ζητήσετε κλήση." : "Please sign in to request a callback."); return; }
    if (!phone.trim()) { toast.error(isGreek ? "Συμπληρώστε τον αριθμό τηλεφώνου σας" : "Please enter your phone number"); return; }
    if (!callbackTime) { toast.error(isGreek ? "Επιλέξτε προτιμώμενη ώρα κλήσης" : "Please select a preferred callback window"); return; }
    const resolvedName = profile?.display_name || user.email || "";
    const resolvedEmail = user.email || "";

    try {
      await submitConsultation.mutateAsync({
        professional_id: professional.id,
        requester_name: resolvedName,
        requester_email: resolvedEmail,
        requester_phone: phone,
        request_type: "callback",
        preferred_date: selectedDate || undefined,
        callback_time: callbackTime,
        message: note || undefined,
      });
      setDone(true);
    } catch (_err: unknown) {
      toast.error(isGreek ? "Δεν ήταν δυνατή η υποβολή. Δοκιμάστε ξανά." : "Could not submit request. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            {done ? (isGreek ? "Το αίτημα κλήσης στάλθηκε" : "Callback Requested!") : (isGreek ? `Ζητήστε κλήση από ${firstName}` : `Request a Callback from ${firstName}`)}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isGreek ? "Μοιραστείτε στοιχεία επικοινωνίας και προτιμώμενο χρονικό παράθυρο για επαγγελματική κλήση." : "Share contact details and a preferred time window for a professional callback."}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <SignInRequired firstName={firstName} isGreek={isGreek} />
        ) : done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{isGreek ? "Το αίτημα κλήσης στάλθηκε." : "Callback request sent!"}</p>
              <p className="text-sm text-muted-foreground mt-1">{isGreek ? `${firstName} θα σας καλέσει στο προτιμώμενο χρονικό παράθυρο.` : `${firstName} will call you during your preferred window.`}</p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isGreek ? "Το τηλέφωνό σας" : "Your number"}</span>
                <span className="font-medium">{phone}</span>
              </div>
              {selectedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isGreek ? "Προτιμώμενη ημερομηνία" : "Preferred date"}</span>
                  <span className="font-medium">{days.find(d => d.date === selectedDate)?.display || selectedDate}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isGreek ? "Ώρα κλήσης" : "Time window"}</span>
                <span className="font-medium">{callbackTime}</span>
              </div>
            </div>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleClose}>{isGreek ? "Τέλος" : "Done"}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
              <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
                {proName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-sm">{proName}</div>
                <div className="text-xs text-muted-foreground">{professional.title}</div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{isGreek ? "Τηλέφωνο *" : "Your Phone Number *"}</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+30 6XX XXX XXXX"
                type="tel"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Προτιμώμενη ημερομηνία" : "Preferred Date"} <span className="text-muted-foreground font-normal">({isGreek ? "προαιρετικό" : "optional"})</span></label>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedDate("")}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${!selectedDate ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {isGreek ? "Οποιαδήποτε ημέρα" : "Any day"}
                </button>
                {days.map(day => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${selectedDate === day.date ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {day.label} {day.display}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">{isGreek ? "Προτιμώμενη ώρα κλήσης *" : "Preferred Callback Time *"}</label>
              <div className="grid grid-cols-2 gap-2">
                {callbackWindows.map(w => {
                  const label = isGreek ? w.labelEl : w.label;
                  const value = `${label} (${w.time})`;
                  return (
                    <button
                      key={w.label}
                      onClick={() => setCallbackTime(value)}
                      className={`p-3 rounded-xl border text-sm flex items-center gap-2 transition-all ${
                        callbackTime === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <div className="text-left">
                        <div className="font-medium text-xs">{label}</div>
                        <div className="text-xs opacity-70">{w.time}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{isGreek ? "Σύντομη περιγραφή (προαιρετικό)" : "What's this about? (optional)"}</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder={isGreek ? "Περιγράψτε σύντομα τι χρειάζεστε..." : "Briefly describe what you need..."}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="border-border" onClick={handleClose}>{isGreek ? "Άκυρο" : "Cancel"}</Button>
              <Button
                className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                onClick={handleSubmit}
                disabled={submitConsultation.isPending || !phone.trim() || !callbackTime}
              >
                {submitConsultation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                {isGreek ? "Αίτημα κλήσης" : "Request Callback"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
