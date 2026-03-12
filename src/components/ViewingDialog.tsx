import { useState } from "react";
import { Calendar, Clock, Video, MapPin, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Property } from "@/components/PropertyCard";

interface ViewingDialogProps {
  open: boolean;
  onClose: () => void;
  property: Property;
  /** If false, video viewing is disabled (Pro or retailers only). */
  canVideoView?: boolean;
}

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

const days = [
  { label: "Mon", date: "Mar 10" },
  { label: "Tue", date: "Mar 11" },
  { label: "Wed", date: "Mar 12" },
  { label: "Thu", date: "Mar 13" },
  { label: "Fri", date: "Mar 14" },
  { label: "Sat", date: "Mar 15" },
];

export default function ViewingDialog({ open, onClose, property, canVideoView = true }: ViewingDialogProps) {
  const [viewType, setViewType] = useState<"in-person" | "video">("in-person");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleBook = () => {
    if (selectedDay && selectedTime) {
      setConfirmed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {confirmed ? "Viewing Confirmed! 🎉" : "Book a Viewing"}
          </DialogTitle>
        </DialogHeader>

        {confirmed ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold">{property.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {viewType === "video" ? "📹 Video viewing" : "🏠 In-person viewing"} on {selectedDay} at {selectedTime}
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-left space-y-2">
              <p className="text-muted-foreground">A confirmation has been sent to your email with all the details.</p>
              {viewType === "video" && (
                <p className="text-primary">A video call link will be sent 15 minutes before the viewing.</p>
              )}
            </div>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Property mini card */}
            <div className="flex gap-3 p-3 bg-secondary rounded-xl">
              <img src={property.images[0]} className="w-14 h-14 rounded-lg object-cover" alt="" />
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
              <label className="text-sm font-medium block mb-2">Viewing Type</label>
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
                  In-Person
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
                  Video Call{!canVideoView && " (Pro or retailers)"}
                </button>
              </div>
            </div>

            {/* Day selection */}
            <div>
              <label className="text-sm font-medium block mb-2">Select Day</label>
              <div className="grid grid-cols-6 gap-1">
                {days.map(day => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDay(day.date)}
                    className={`p-2 rounded-lg text-center text-xs transition-all ${
                      selectedDay === day.date
                        ? "bg-gradient-primary text-primary-foreground"
                        : "bg-secondary border border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-semibold">{day.label}</div>
                    <div className="mt-0.5 opacity-70">{day.date.split(" ")[1]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            {selectedDay && (
              <div>
                <label className="text-sm font-medium block mb-2">Select Time</label>
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
              <label className="text-sm font-medium block mb-2">Note (optional)</label>
              <textarea
                placeholder="Any specific requirements or questions..."
                className="w-full bg-secondary border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
                rows={2}
              />
            </div>

            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground"
              disabled={!selectedDay || !selectedTime}
              onClick={handleBook}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Confirm Booking
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
