import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, CheckCircle2, Loader2, Euro, Briefcase, Video, Users, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitConsultation } from "@/hooks/useConsultations";
import { useProfessionalServices, useProfessionalAvailability, type ProfessionalService } from "@/hooks/useProfessionalServices";
import { toast } from "sonner";
import { stripSupervisorTestMarkers } from "@/lib/displayText";

const PRICING_LABELS: Record<string, string> = { hourly: "/hr", daily: "/day", fixed: "fixed" };
const SLOT_INTERVAL_MINUTES = 60;

const normalizeSlotMinute = (minute: number) => (minute === 30 ? 30 : 0);

const parseSlotStart = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + normalizeSlotMinute(minute);
};

const parseSlotEnd = (time: string) => Number(time.split(":")[0]) * 60;

const formatSlotTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const getAvailableDays = (availability: { day_of_week: number; start_time: string; end_time: string }[], count = 14) => {
  const days: { label: string; date: string; display: string; dayOfWeek: number; startTime: string; endTime: string }[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  let checked = 0;
  while (days.length < count && checked < 60) {
    const dow = d.getDay();
    const avail = availability.find((a) => a.day_of_week === dow);
    if (avail) {
      days.push({
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        date: d.toISOString().split("T")[0],
        display: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        dayOfWeek: dow,
        startTime: avail.start_time,
        endTime: avail.end_time,
      });
    }
    d.setDate(d.getDate() + 1);
    checked++;
  }
  return days;
};

const getSlotCount = (startMinutes: number, endMinutes: number) =>
  Math.max(0, Math.floor((endMinutes - startMinutes) / SLOT_INTERVAL_MINUTES) + 1);

const getSlotAtIndex = (startMinutes: number, index: number) =>
  formatSlotTime(startMinutes + index * SLOT_INTERVAL_MINUTES);

const getCalendarEvent = (selectedDate: string, selectedTime: string, title: string, description: string) => {
  if (!selectedDate || !selectedTime) return null;
  const start = new Date(`${selectedDate}T${selectedTime}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const format = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dates = `${format(start)}/${format(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
    details: description,
  });
  const outlookParams = new URLSearchParams({
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: description,
  });
  return {
    googleUrl: `https://calendar.google.com/calendar/render?${params.toString()}`,
    outlookUrl: `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`,
    ics: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//maiProp//Professional Consultation//EN",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}@maiprop.co`,
      `DTSTAMP:${format(new Date())}`,
      `DTSTART:${format(start)}`,
      `DTEND:${format(end)}`,
      `SUMMARY:${title.replace(/\r?\n/g, " ")}`,
      `DESCRIPTION:${description.replace(/\r?\n/g, "\\n")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  };
};

const downloadIcs = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

interface BookConsultationModalProps {
  open: boolean;
  onClose: () => void;
  allowVideoCall?: boolean;
  professional: {
    id: string;
    user_id: string;
    display_name?: string | null;
    title?: string | null;
    category: string;
    hourly_rate?: number | null;
    video_link?: string | null;
  };
}

const RemoteAvailablePill = () => (
  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
    <Video className="w-2.5 h-2.5" /> Remote available
  </span>
);

const PremiumServicePill = () => (
  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold">Pro</span>
);

const getServiceOptionClass = (selected: boolean) =>
  `w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
    selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/30 bg-secondary/40"
  }`;

const getServiceIconShellClass = (selected: boolean) =>
  `w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${selected ? "bg-primary/20" : "bg-secondary"}`;

const getServiceChevronClass = (selected: boolean) =>
  `w-4 h-4 shrink-0 mt-2 transition-colors ${selected ? "text-primary" : "text-muted-foreground/30"}`;

const ServiceOptionIcon = ({ videoEnabled, selected }: { videoEnabled: boolean; selected: boolean }) => (
  <div className={getServiceIconShellClass(selected)}>
    {videoEnabled
      ? <Video className="w-3.5 h-3.5 text-primary" />
      : <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />}
  </div>
);

const ServiceRatePill = ({ service }: { service: ProfessionalService }) => (
  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
    service.rate_amount ? "bg-brand-gold/15 text-brand-gold" : "bg-secondary text-muted-foreground"
  }`}>
    {service.rate_amount ? `EUR ${service.rate_amount}${PRICING_LABELS[service.pricing_model] ?? ""}` : "On Request"}
  </span>
);

const ServiceOptionDescription = ({ description }: { description: string | null }) => {
  const cleanDescription = stripSupervisorTestMarkers(description);
  return cleanDescription
    ? <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cleanDescription}</p>
    : null;
};

const ServiceOptionMeta = ({ service }: { service: ProfessionalService }) => (
  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground capitalize">
      {service.pricing_model}
    </span>
    {Boolean(service.video_enabled) && <RemoteAvailablePill />}
    {Boolean(service.is_premium) && <PremiumServicePill />}
  </div>
);

const ServiceOptionCard = ({
  service,
  selected,
  onSelect,
}: {
  service: ProfessionalService;
  selected: boolean;
  onSelect: (service: ProfessionalService) => void;
}) => {
  return (
    <button onClick={() => onSelect(service)} className={getServiceOptionClass(selected)}>
      <ServiceOptionIcon videoEnabled={service.video_enabled} selected={selected} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium">{service.service_name}</span>
          <ServiceRatePill service={service} />
        </div>
        <ServiceOptionDescription description={service.description} />
        <ServiceOptionMeta service={service} />
      </div>
      <ChevronRight className={getServiceChevronClass(selected)} />
    </button>
  );
};

const EmptyServicesPanel = ({ onContinue }: { onContinue: () => void }) => (
  <div className="text-center py-6 text-sm text-muted-foreground">
    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
    No services are configured yet. You can still send a general consultation request.
    <Button className="w-full mt-3 bg-gradient-primary border-0 text-primary-foreground" onClick={onContinue}>
      Continue as General Consultation
    </Button>
  </div>
);

const ServiceSelectionStep = ({
  services,
  selectedService,
  onSelectService,
  onContinue,
}: {
  services: ProfessionalService[];
  selectedService: ProfessionalService | null;
  onSelectService: (service: ProfessionalService) => void;
  onContinue: () => void;
}) => (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">What service do you need?</p>
    {services.length === 0 ? (
      <EmptyServicesPanel onContinue={onContinue} />
    ) : (
      <>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {services.map((service) => (
            <ServiceOptionCard
              key={service.id}
              service={service}
              selected={selectedService?.id === service.id}
              onSelect={onSelectService}
            />
          ))}
        </div>
        <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" disabled={!selectedService} onClick={onContinue}>
          Continue
        </Button>
      </>
    )}
  </div>
);

export default function BookConsultationModal({ open, onClose, allowVideoCall = true, professional }: BookConsultationModalProps) {
  const { user, profile } = useAuth();
  const submitConsultation = useSubmitConsultation();

  const { data: services = [] } = useProfessionalServices(professional.id);
  const { data: availability = [] } = useProfessionalAvailability(professional.id);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedService, setSelectedService] = useState<typeof services[0] | null>(null);
  const [bookingType, setBookingType] = useState<"in_person" | "video">("in_person");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [name, setName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const proName = professional.display_name || "Professional";
  const firstName = proName.split(" ")[0];

  const availableDays = useMemo(() => getAvailableDays(availability), [availability]);
  const selectedDayData = availableDays.find((d) => d.date === selectedDate);
  const timeSlots = useMemo(() => {
    if (!selectedDayData) return [];
    const startMinutes = parseSlotStart(selectedDayData.startTime);
    const endMinutes = parseSlotEnd(selectedDayData.endTime);
    return Array.from({ length: getSlotCount(startMinutes, endMinutes) }, (_, index) =>
      getSlotAtIndex(startMinutes, index)
    );
  }, [selectedDayData]);

  const hasProfessionalMeetingLink = Boolean(professional.video_link?.trim());
  const serviceSupportsVideo = selectedService ? Boolean(selectedService.video_enabled) : allowVideoCall;
  const usesHostedRoom = !hasProfessionalMeetingLink;
  const canVideo = allowVideoCall && (hasProfessionalMeetingLink || serviceSupportsVideo);
  const nextStepAfterService = allowVideoCall ? 2 : 3;
  const previousStepFromSchedule = allowVideoCall ? 2 : 1;

  useEffect(() => {
    if (!allowVideoCall && step === 2) setStep(3);
  }, [allowVideoCall, step]);

  useEffect(() => {
    if (!canVideo && bookingType === "video") setBookingType("in_person");
  }, [canVideo, bookingType]);

  const handleClose = () => {
    setStep(1);
    setSelectedService(null);
    setBookingType("in_person");
    setSelectedDate("");
    setSelectedTime("");
    setNote("");
    setDone(false);
    onClose();
  };

  const handleConfirm = async () => {
    const resolvedName = user ? (profile?.display_name || user.email || name) : name;
    const resolvedEmail = user ? (user.email || email) : email;
    if (!resolvedName || !resolvedEmail) {
      toast.error("Please fill in your details");
      return;
    }

    try {
      await submitConsultation.mutateAsync({
        professional_id: professional.id,
        requester_name: resolvedName,
        requester_email: resolvedEmail,
        requester_phone: phone || undefined,
        request_type: "consultation",
        service: selectedService?.service_name,
        preferred_date: selectedDate,
        preferred_time: selectedTime,
        message: [
          bookingType === "video"
            ? `Video consultation requested via ${usesHostedRoom ? "mAI prop video room" : "professional meeting link"}`
            : "In-person consultation requested",
          note,
        ].filter(Boolean).join("\n"),
      });
      setDone(true);
    } catch (_err: unknown) {
      toast.error("Could not book consultation. Please try again.");
    }
  };

  const pricingLabel = selectedService
    ? selectedService.rate_amount
      ? `EUR ${selectedService.rate_amount}${PRICING_LABELS[selectedService.pricing_model] ?? ""}`
      : "On Request"
    : null;
  const calendarEvent = getCalendarEvent(
    selectedDate,
    selectedTime,
    `Tentative consultation with ${proName}`,
    `${selectedService?.service_name || "Consultation"} request on maiProp. The professional still needs to confirm this session.`,
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {done ? "Consultation Request Sent" : `Book with ${firstName}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select a professional service, preferred time, and contact details for a consultation request.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Consultation request received.</p>
              <p className="text-sm text-muted-foreground mt-1">
                {firstName} still needs to confirm the session details before anything is scheduled.
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-left space-y-2">
              {selectedService && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium">{selectedService.service_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium flex items-center gap-1">
                  {bookingType === "video" ? <><Video className="w-3.5 h-3.5" /> Video</> : <><Users className="w-3.5 h-3.5" /> In-person</>}
                </span>
              </div>
              {selectedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date & Time</span>
                  <span className="font-medium">{selectedDate} at {selectedTime}</span>
                </div>
              )}
              {pricingLabel && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-medium">{pricingLabel}</span>
                </div>
              )}
            </div>
            {bookingType === "video" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground text-left">
                {usesHostedRoom
                  ? "If the request is accepted, the professional can meet you in the built-in mAI prop video room."
                  : "If the request is accepted, the professional will share or confirm the final meeting link."}
              </div>
            )}
            {calendarEvent && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button variant="outline" className="border-border" asChild>
                  <a href={calendarEvent.googleUrl} target="_blank" rel="noopener noreferrer">Google Calendar</a>
                </Button>
                <Button variant="outline" className="border-border" asChild>
                  <a href={calendarEvent.outlookUrl} target="_blank" rel="noopener noreferrer">Outlook</a>
                </Button>
                <Button
                  variant="outline"
                  className="border-border"
                  onClick={() => downloadIcs("maiprop-consultation.ics", calendarEvent.ics)}
                >
                  Download .ics
                </Button>
              </div>
            )}
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-1.5">
              {(allowVideoCall ? [1, 2, 3, 4] : [1, 2, 3]).map((s, idx) => {
                const actualStep = allowVideoCall ? s : (s === 1 ? 1 : s === 2 ? 3 : 4);
                const isActive = step === actualStep;
                const isDone = step > actualStep;
                return (
                  <div key={s} className="flex items-center gap-1.5 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                      isActive ? "bg-primary text-primary-foreground" :
                      isDone ? "bg-brand-emerald/20 text-brand-emerald" : "bg-secondary text-muted-foreground"
                    }`}>
                      {isDone ? "\u2713" : idx + 1}
                    </div>
                    <span className={`text-[11px] hidden sm:block ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {allowVideoCall
                        ? (s === 1 ? "Service" : s === 2 ? "Type" : s === 3 ? "Schedule" : "Details")
                        : (s === 1 ? "Service" : s === 2 ? "Schedule" : "Details")}
                    </span>
                    {idx < (allowVideoCall ? 4 : 3) - 1 && <div className="flex-1 h-px bg-border" />}
                  </div>
                );
              })}
            </div>

            {step === 1 && (
              <ServiceSelectionStep
                services={services}
                selectedService={selectedService}
                onSelectService={setSelectedService}
                onContinue={() => setStep(nextStepAfterService)}
              />
            )}

            {allowVideoCall && step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">How would you like to meet?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBookingType("in_person")}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      bookingType === "in_person" ? "border-primary bg-primary/8" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Users className={`w-7 h-7 mx-auto mb-2 ${bookingType === "in_person" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="font-semibold text-sm">In-Person</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Meet at their office or site</div>
                  </button>
                  <button
                    onClick={() => canVideo ? setBookingType("video") : toast.info("This service is not available via video")}
                    className={`p-4 rounded-xl border-2 text-center transition-all relative ${
                      bookingType === "video" ? "border-primary bg-primary/10" : canVideo ? "border-border hover:border-primary/30" : "border-border opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <Video className={`w-7 h-7 mx-auto mb-2 ${bookingType === "video" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="font-semibold text-sm">Video Request</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {usesHostedRoom ? "mAI prop video room after confirmation" : "Professional meeting link"}
                    </div>
                    {!canVideo && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                        <span className="text-[10px] bg-secondary/90 px-2 py-1 rounded-full text-muted-foreground">Not available</span>
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(1)}>Back</Button>
                  <Button className="flex-1 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setStep(3)}>Continue</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {availableDays.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No availability has been set yet. You can still send a request and the professional will confirm manually.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium block mb-2">Select a day</label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
                        {availableDays.map((day) => (
                          <button
                            key={day.date}
                            onClick={() => { setSelectedDate(day.date); setSelectedTime(""); }}
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

                    {selectedDate && timeSlots.length > 0 && (
                      <div>
                        <label className="text-sm font-medium block mb-2">Select time</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {timeSlots.map((time) => (
                            <button
                              key={time}
                              onClick={() => setSelectedTime(time)}
                              className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                                selectedTime === time ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!!selectedService?.rate_amount && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg p-3">
                    <Euro className="w-4 h-4 text-brand-gold shrink-0" />
                    <span>{selectedService.service_name}: </span>
                    <span className="font-semibold text-foreground">{pricingLabel}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(previousStepFromSchedule)}>Back</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground"
                    disabled={availableDays.length > 0 && (!selectedDate || !selectedTime)}
                    onClick={() => setStep(4)}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                {!user && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Full Name *</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
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
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Phone (optional)</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+30 6XX XXX XXXX"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Additional notes (optional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Describe your project, address, or any specific questions..."
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
                  />
                </div>

                <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground space-y-1.5">
                  {selectedService && <div className="flex justify-between"><span>Service</span><span className="text-foreground font-medium">{selectedService.service_name}</span></div>}
                  <div className="flex justify-between">
                    <span>Type</span>
                    <span className="text-foreground font-medium flex items-center gap-1">
                      {bookingType === "video" ? <><Video className="w-3 h-3" /> Video</> : <><Users className="w-3 h-3" /> In-Person</>}
                    </span>
                  </div>
                  {selectedDate && <div className="flex justify-between"><span>When</span><span className="text-foreground font-medium">{selectedDate} at {selectedTime}</span></div>}
                  {pricingLabel && <div className="flex justify-between"><span>Rate</span><span className="text-foreground font-medium">{pricingLabel}</span></div>}
                  <div className="flex justify-between"><span>With</span><span className="text-foreground font-medium">{proName}</span></div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(3)}>Back</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={handleConfirm}
                    disabled={submitConsultation.isPending || (!user && (!name.trim() || !email.trim()))}
                  >
                    {submitConsultation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    Send Request
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
