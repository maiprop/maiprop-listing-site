import { useState } from "react";
import { Calendar, Clock, CheckCircle2, Loader2, Euro, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitConsultation } from "@/hooks/useConsultations";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const servicesByCategory: Record<string, string[]> = {
  architect: ["Architectural Plans", "Building Permits", "Renovation Design", "Site Supervision", "Energy Certificate"],
  civil_engineer: ["Static Report", "Structural Analysis", "Seismic Assessment", "Building Compliance"],
  lawyer: ["Title Search", "Contract Review", "Conveyancing", "Golden Visa", "Auction Representation"],
  notary: ["Property Transfer Deed", "Mortgage Deed", "Company Incorporation", "Wills & Inheritance"],
  electrician: ["Electrical Installation", "Smart Home", "Solar Panels", "EV Charging", "Energy Audit"],
  plumber: ["Pipe Installation", "Bathroom Remodel", "Boiler Install", "Emergency Repair"],
  contractor: ["Full Renovation", "New Build", "Kitchen & Bath", "Structural Work"],
  property_manager: ["Tenant Sourcing", "Rent Collection", "Maintenance", "Short-Term Rental"],
  valuer: ["Market Appraisal", "Mortgage Valuation", "Investment Analysis", "RICS Report"],
  interior_designer: ["Space Planning", "3D Visualisation", "Property Staging", "FF&E Specification"],
  financial_advisor: ["Mortgage Advice", "Investment Strategy", "Tax Planning", "Golden Visa Finance"],
};

const timeSlots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function getNextDays(count: number) {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push({
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        date: d.toISOString().split("T")[0],
        display: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

interface BookConsultationModalProps {
  open: boolean;
  onClose: () => void;
  professional: {
    id: string;
    user_id: string;
    display_name?: string | null;
    title?: string | null;
    category: string;
    hourly_rate?: number | null;
  };
}

export default function BookConsultationModal({ open, onClose, professional }: BookConsultationModalProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const submitConsultation = useSubmitConsultation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [service, setService] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [name, setName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const proName = professional.display_name || "Professional";
  const firstName = proName.split(" ")[0];
  const services = servicesByCategory[professional.category] || ["Consultation"];
  const days = getNextDays(6);

  const handleClose = () => {
    setStep(1); setService(""); setSelectedDate(""); setSelectedTime("");
    setNote(""); setDone(false);
    onClose();
  };

  const handleConfirm = async () => {
    const resolvedName = user ? (profile?.display_name || user.email || name) : name;
    const resolvedEmail = user ? (user.email || email) : email;
    if (!resolvedName || !resolvedEmail) { toast.error("Please fill in your details"); return; }

    try {
      await submitConsultation.mutateAsync({
        professional_id: professional.id,
        requester_name: resolvedName,
        requester_email: resolvedEmail,
        requester_phone: phone || undefined,
        request_type: "consultation",
        service,
        preferred_date: selectedDate,
        preferred_time: selectedTime,
        message: note || undefined,
      });
      setDone(true);
    } catch {
      toast.error("Could not book consultation. Please try again.");
    }
  };

  const selectedDayDisplay = days.find(d => d.date === selectedDate);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {done ? "Consultation Booked!" : `Book Consultation with ${firstName}`}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Consultation request confirmed!</p>
              <p className="text-sm text-muted-foreground mt-1">{firstName} will confirm within 2 hours.</p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{service || "Consultation"}</span>
              </div>
              {selectedDayDisplay && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date & Time</span>
                  <span className="font-medium">{selectedDayDisplay.display} at {selectedTime}</span>
                </div>
              )}
              {professional.hourly_rate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-medium">€{professional.hourly_rate}/hr</span>
                </div>
              )}
            </div>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step === s ? "bg-primary text-primary-foreground" :
                    step > s ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"
                  }`}>
                    {step > s ? "✓" : s}
                  </div>
                  <span className={`text-xs ${step === s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {s === 1 ? "Service" : s === 2 ? "Schedule" : "Details"}
                  </span>
                  {s < 3 && <div className="w-8 h-px bg-border flex-1" />}
                </div>
              ))}
            </div>

            {/* Step 1: Service */}
            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">What do you need help with?</p>
                <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                  {services.map(s => (
                    <button
                      key={s}
                      onClick={() => setService(s)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-sm text-left transition-all ${
                        service === s ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/40"
                      }`}
                    >
                      <Briefcase className="w-4 h-4 shrink-0 text-muted-foreground" />
                      {s}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full bg-gradient-primary border-0 text-primary-foreground"
                  disabled={!service}
                  onClick={() => setStep(2)}
                >
                  Continue
                </Button>
              </div>
            )}

            {/* Step 2: Date & Time */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Select Date</label>
                  <div className="grid grid-cols-3 gap-2">
                    {days.map(day => (
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
                    <label className="text-sm font-medium block mb-2">Select Time</label>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map(time => (
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

                {professional.hourly_rate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg p-3">
                    <Euro className="w-4 h-4 text-brand-gold shrink-0" />
                    Consultation rate: <span className="font-semibold text-foreground">€{professional.hourly_rate}/hr</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground"
                    disabled={!selectedDate || !selectedTime}
                    onClick={() => setStep(3)}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Contact details */}
            {step === 3 && (
              <div className="space-y-4">
                {!user && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Full Name *</label>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Email *</label>
                      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" type="email"
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Phone (optional)</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30 6XX XXX XXXX"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Additional notes (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                    placeholder="Describe your project, property address, or any specific questions..."
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors" />
                </div>

                {/* Summary */}
                <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Service</span><span className="text-foreground font-medium">{service}</span></div>
                  {selectedDayDisplay && <div className="flex justify-between"><span>When</span><span className="text-foreground font-medium">{selectedDayDisplay.display} at {selectedTime}</span></div>}
                  <div className="flex justify-between"><span>With</span><span className="text-foreground font-medium">{proName}</span></div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(2)}>Back</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={handleConfirm}
                    disabled={submitConsultation.isPending || (!user && (!name.trim() || !email.trim()))}
                  >
                    {submitConsultation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    Confirm Booking
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
