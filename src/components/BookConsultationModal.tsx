import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, CheckCircle2, Loader2, Euro, Briefcase, Video, Users, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitConsultation } from "@/hooks/useConsultations";
import { useProfessionalServices, useProfessionalAvailability, type ProfessionalService } from "@/hooks/useProfessionalServices";
import { toast } from "sonner";
import { stripSupervisorTestMarkers } from "@/lib/displayText";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

const PRICING_LABELS: Record<string, string> = { hourly: "/hr", daily: "/day", fixed: "fixed" };
const SLOT_INTERVAL_MINUTES = 60;

const CONSULTATION_FALLBACKS: Record<string, string> = {
  "common.at": "at",
  "common.back": "Back",
  "consultation.remoteAvailable": "Remote available",
  "consultation.premiumService": "Pro",
  "consultation.onRequest": "On request",
  "consultation.emptyServices": "No services are configured yet. You can still send a general consultation request.",
  "consultation.continueGeneral": "Continue as general consultation",
  "consultation.servicePrompt": "What service do you need?",
  "consultation.continue": "Continue",
  "consultation.signInTitle": "Sign in to book a consultation",
  "consultation.signInDescription": "{{name}} can receive booking requests only from signed-in mAI prop accounts.",
  "consultation.signIn": "Sign in",
  "consultation.professionalFallback": "Professional",
  "consultation.toastSignIn": "Please sign in to book a consultation.",
  "consultation.toastMissingDetails": "Please fill in your details.",
  "consultation.toastSubmitError": "Could not book consultation. Please try again.",
  "consultation.videoMessageHosted": "Video consultation requested via mAI prop video room",
  "consultation.videoMessageLink": "Video consultation requested via professional meeting link",
  "consultation.inPersonMessage": "In-person consultation requested",
  "consultation.calendarTitle": "Tentative consultation with {{name}}",
  "consultation.calendarDescription": "{{service}} request on mAI prop. The professional still needs to confirm this session.",
  "consultation.genericService": "Consultation",
  "consultation.dialogTitleDone": "Consultation request sent",
  "consultation.dialogTitleBook": "Book with {{name}}",
  "consultation.dialogDescription": "Select a professional service, preferred time, and contact details for a consultation request.",
  "consultation.successTitle": "Consultation request received.",
  "consultation.successDescription": "{{name}} still needs to confirm the session details before anything is scheduled.",
  "consultation.service": "Service",
  "consultation.type": "Type",
  "consultation.video": "Video",
  "consultation.inPerson": "In-person",
  "consultation.dateTime": "Date & time",
  "consultation.rate": "Rate",
  "consultation.hostedVideoAccepted": "If the request is accepted, the professional can meet you in the built-in mAI prop video room.",
  "consultation.externalVideoAccepted": "If the request is accepted, the professional will share or confirm the final meeting link.",
  "consultation.downloadIcs": "Download .ics",
  "consultation.done": "Done",
  "consultation.steps.service": "Service",
  "consultation.steps.type": "Type",
  "consultation.steps.schedule": "Schedule",
  "consultation.steps.details": "Details",
  "consultation.meetingPrompt": "How would you like to meet?",
  "consultation.meetInPerson": "In-Person",
  "consultation.meetInPersonDescription": "Meet at their office or site",
  "consultation.videoRequest": "Video Request",
  "consultation.hostedVideoRoom": "mAI prop video room after confirmation",
  "consultation.professionalMeetingLink": "Professional meeting link",
  "consultation.notAvailable": "Not available",
  "consultation.videoUnavailableToast": "This service is not available via video",
  "consultation.noAvailability": "No availability has been set yet. You can still send a request and the professional will confirm manually.",
  "consultation.selectDay": "Select a day",
  "consultation.selectTime": "Select time",
  "consultation.phoneOptional": "Phone (optional)",
  "consultation.notesOptional": "Additional notes (optional)",
  "consultation.notesPlaceholder": "Describe your project, address, or any specific questions...",
  "consultation.when": "When",
  "consultation.with": "With",
  "consultation.sendRequest": "Send Request",
  "consultation.pricingModels.hourly": "Hourly",
  "consultation.pricingModels.daily": "Daily",
  "consultation.pricingModels.fixed": "Fixed",
  "consultation.rateSuffixes.hourly": "/hr",
  "consultation.rateSuffixes.daily": "/day",
  "consultation.rateSuffixes.fixed": "",
};

const getTranslatedValue = (t: TFunction, key: string, fallback = CONSULTATION_FALLBACKS[key] ?? key) => {
  const value = t(key);
  return value === key ? fallback : value;
};

const interpolateTranslation = (t: TFunction, key: string, values: Record<string, string>) =>
  getTranslatedValue(t, key).replace(/{{\s*(\w+)\s*}}/g, (_match, name) => values[name] ?? "");

const getPricingModelLabel = (model: string, t: TFunction) =>
  getTranslatedValue(t, `consultation.pricingModels.${model}`, model);

const getServiceRateLabel = (service: ProfessionalService, t: TFunction) => {
  if (!service.rate_amount) return getTranslatedValue(t, "consultation.onRequest");
  const suffix = getTranslatedValue(t, `consultation.rateSuffixes.${service.pricing_model}`, PRICING_LABELS[service.pricing_model] ?? "");
  return `EUR ${service.rate_amount}${suffix}`;
};

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

const getAvailableDays = (availability: { day_of_week: number; start_time: string; end_time: string }[], count = 14, locale = "en-GB") => {
  const days: { label: string; date: string; display: string; dayOfWeek: number; startTime: string; endTime: string }[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  let checked = 0;
  while (days.length < count && checked < 60) {
    const dow = d.getDay();
    const avail = availability.find((a) => a.day_of_week === dow);
    if (avail) {
      days.push({
        label: d.toLocaleDateString(locale, { weekday: "short" }),
        date: d.toISOString().split("T")[0],
        display: d.toLocaleDateString(locale, { day: "numeric", month: "short" }),
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

const RemoteAvailablePill = () => {
  const { t } = useTranslation();
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
      <Video className="w-2.5 h-2.5" /> {getTranslatedValue(t, "consultation.remoteAvailable")}
    </span>
  );
};

const PremiumServicePill = () => {
  const { t } = useTranslation();
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold">
      {getTranslatedValue(t, "consultation.premiumService")}
    </span>
  );
};

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

const ServiceRatePill = ({ service }: { service: ProfessionalService }) => {
  const { t } = useTranslation();
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      service.rate_amount ? "bg-brand-gold/15 text-brand-gold" : "bg-secondary text-muted-foreground"
    }`}>
      {getServiceRateLabel(service, t)}
    </span>
  );
};

const ServiceOptionDescription = ({ description }: { description: string | null }) => {
  const cleanDescription = stripSupervisorTestMarkers(description);
  return cleanDescription
    ? <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cleanDescription}</p>
    : null;
};

const ServiceOptionMeta = ({ service }: { service: ProfessionalService }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
        {getPricingModelLabel(service.pricing_model, t)}
      </span>
      {Boolean(service.video_enabled) && <RemoteAvailablePill />}
      {Boolean(service.is_premium) && <PremiumServicePill />}
    </div>
  );
};

const ServiceOptionCard = ({ // skipcq: JS-R1005 - The card composes small leaf helpers; conditional rendering lives in focused subcomponents.
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

const EmptyServicesPanel = ({ onContinue }: { onContinue: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="text-center py-6 text-sm text-muted-foreground">
      <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
      {getTranslatedValue(t, "consultation.emptyServices")}
      <Button className="w-full mt-3 bg-gradient-primary border-0 text-primary-foreground" onClick={onContinue}>
        {getTranslatedValue(t, "consultation.continueGeneral")}
      </Button>
    </div>
  );
};

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
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{getTranslatedValue(t, "consultation.servicePrompt")}</p>
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
            {getTranslatedValue(t, "consultation.continue")}
          </Button>
        </>
      )}
    </div>
  );
};

const SignInRequired = ({ firstName }: { firstName: string }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 py-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">{getTranslatedValue(t, "consultation.signInTitle")}</p>
        <p>{interpolateTranslation(t, "consultation.signInDescription", { name: firstName })}</p>
      </div>
      <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" asChild>
        <a href="/login">{getTranslatedValue(t, "consultation.signIn")}</a>
      </Button>
    </div>
  );
};

// skipcq: JS-0067 - React modal component is intentionally module-scoped.
export default function BookConsultationModal({ open, onClose, allowVideoCall = true, professional }: BookConsultationModalProps) { // skipcq: JS-R1005, JS-W1044 - Booking modal coordinates service selection, scheduling, contact capture, and submission flow.
  const { user, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const dateLocale = isGreek ? "el-GR" : "en-GB";
  const submitConsultation = useSubmitConsultation();

  const { data: services = [] } = useProfessionalServices(professional.id);
  const { data: availability = [] } = useProfessionalAvailability(professional.id);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedService, setSelectedService] = useState<typeof services[0] | null>(null);
  const [bookingType, setBookingType] = useState<"in_person" | "video">("in_person");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const proName = professional.display_name || getTranslatedValue(t, "consultation.professionalFallback");
  const firstName = proName.split(" ")[0];

  const availableDays = useMemo(() => getAvailableDays(availability, 14, dateLocale), [availability, dateLocale]);
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

  const handleConfirm = async () => { // skipcq: JS-R1005 - Submit flow resolves guest/user contact details and booking metadata in one mutation payload.
    if (!user) {
      toast.error(getTranslatedValue(t, "consultation.toastSignIn"));
      return;
    }
    const resolvedName = profile?.display_name || user.email || "";
    const resolvedEmail = user.email || "";
    if (!resolvedName || !resolvedEmail) {
      toast.error(getTranslatedValue(t, "consultation.toastMissingDetails"));
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
            ? (usesHostedRoom ? getTranslatedValue(t, "consultation.videoMessageHosted") : getTranslatedValue(t, "consultation.videoMessageLink"))
            : getTranslatedValue(t, "consultation.inPersonMessage"),
          note,
        ].filter(Boolean).join("\n"),
      });
      setDone(true);
    } catch (_err: unknown) {
      toast.error(getTranslatedValue(t, "consultation.toastSubmitError"));
    }
  };

  const pricingLabel = selectedService
    ? getServiceRateLabel(selectedService, t)
    : null;
  const calendarEvent = getCalendarEvent(
    selectedDate,
    selectedTime,
    interpolateTranslation(t, "consultation.calendarTitle", { name: proName }),
    interpolateTranslation(t, "consultation.calendarDescription", { service: selectedService?.service_name || getTranslatedValue(t, "consultation.genericService") }),
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {done ? getTranslatedValue(t, "consultation.dialogTitleDone") : interpolateTranslation(t, "consultation.dialogTitleBook", { name: firstName })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {getTranslatedValue(t, "consultation.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <SignInRequired firstName={firstName} />
        ) : done ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-emerald/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-brand-emerald" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{getTranslatedValue(t, "consultation.successTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {interpolateTranslation(t, "consultation.successDescription", { name: firstName })}
              </p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-sm text-left space-y-2">
              {selectedService && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{getTranslatedValue(t, "consultation.service")}</span>
                  <span className="font-medium">{selectedService.service_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{getTranslatedValue(t, "consultation.type")}</span>
                <span className="font-medium flex items-center gap-1">
                  {bookingType === "video" ? <><Video className="w-3.5 h-3.5" /> {getTranslatedValue(t, "consultation.video")}</> : <><Users className="w-3.5 h-3.5" /> {getTranslatedValue(t, "consultation.inPerson")}</>}
                </span>
              </div>
              {selectedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{getTranslatedValue(t, "consultation.dateTime")}</span>
                  <span className="font-medium">{selectedDate} {getTranslatedValue(t, "common.at")} {selectedTime}</span>
                </div>
              )}
              {pricingLabel && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{getTranslatedValue(t, "consultation.rate")}</span>
                  <span className="font-medium">{pricingLabel}</span>
                </div>
              )}
            </div>
            {bookingType === "video" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground text-left">
                {usesHostedRoom ? getTranslatedValue(t, "consultation.hostedVideoAccepted") : getTranslatedValue(t, "consultation.externalVideoAccepted")}
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
                  {getTranslatedValue(t, "consultation.downloadIcs")}
                </Button>
              </div>
            )}
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground" onClick={handleClose}>{getTranslatedValue(t, "consultation.done")}</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-1.5">
              {(allowVideoCall ? [1, 2, 3, 4] : [1, 2, 3]).map((s, idx) => { // skipcq: JS-R1005 - Stepper branches for video-enabled and in-person-only booking flows.
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
                        ? (s === 1 ? getTranslatedValue(t, "consultation.steps.service") : s === 2 ? getTranslatedValue(t, "consultation.steps.type") : s === 3 ? getTranslatedValue(t, "consultation.steps.schedule") : getTranslatedValue(t, "consultation.steps.details"))
                        : (s === 1 ? getTranslatedValue(t, "consultation.steps.service") : s === 2 ? getTranslatedValue(t, "consultation.steps.schedule") : getTranslatedValue(t, "consultation.steps.details"))}
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
                <p className="text-sm text-muted-foreground">{getTranslatedValue(t, "consultation.meetingPrompt")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setBookingType("in_person")}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      bookingType === "in_person" ? "border-primary bg-primary/8" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Users className={`w-7 h-7 mx-auto mb-2 ${bookingType === "in_person" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="font-semibold text-sm">{getTranslatedValue(t, "consultation.meetInPerson")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{getTranslatedValue(t, "consultation.meetInPersonDescription")}</div>
                  </button>
                  <button
                    onClick={() => canVideo ? setBookingType("video") : toast.info(getTranslatedValue(t, "consultation.videoUnavailableToast"))}
                    className={`p-4 rounded-xl border-2 text-center transition-all relative ${
                      bookingType === "video" ? "border-primary bg-primary/10" : canVideo ? "border-border hover:border-primary/30" : "border-border opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <Video className={`w-7 h-7 mx-auto mb-2 ${bookingType === "video" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="font-semibold text-sm">{getTranslatedValue(t, "consultation.videoRequest")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {usesHostedRoom ? getTranslatedValue(t, "consultation.hostedVideoRoom") : getTranslatedValue(t, "consultation.professionalMeetingLink")}
                    </div>
                    {!canVideo && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                        <span className="text-[10px] bg-secondary/90 px-2 py-1 rounded-full text-muted-foreground">{getTranslatedValue(t, "consultation.notAvailable")}</span>
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(1)}>{getTranslatedValue(t, "common.back")}</Button>
                  <Button className="flex-1 bg-gradient-primary border-0 text-primary-foreground" onClick={() => setStep(3)}>{getTranslatedValue(t, "consultation.continue")}</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {availableDays.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {getTranslatedValue(t, "consultation.noAvailability")}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium block mb-2">{getTranslatedValue(t, "consultation.selectDay")}</label>
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
                        <label className="text-sm font-medium block mb-2">{getTranslatedValue(t, "consultation.selectTime")}</label>
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

                {selectedService && Boolean(selectedService.rate_amount) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary rounded-lg p-3">
                    <Euro className="w-4 h-4 text-brand-gold shrink-0" />
                    <span>{selectedService.service_name}: </span>
                    <span className="font-semibold text-foreground">{pricingLabel}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(previousStepFromSchedule)}>{getTranslatedValue(t, "common.back")}</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground"
                    disabled={availableDays.length > 0 && (!selectedDate || !selectedTime)}
                    onClick={() => setStep(4)}
                  >
                    {getTranslatedValue(t, "consultation.continue")}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{getTranslatedValue(t, "consultation.phoneOptional")}</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+30 6XX XXX XXXX"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{getTranslatedValue(t, "consultation.notesOptional")}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={getTranslatedValue(t, "consultation.notesPlaceholder")}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors"
                  />
                </div>

                <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground space-y-1.5">
                  {selectedService && <div className="flex justify-between"><span>{getTranslatedValue(t, "consultation.service")}</span><span className="text-foreground font-medium">{selectedService.service_name}</span></div>}
                  <div className="flex justify-between">
                    <span>{getTranslatedValue(t, "consultation.type")}</span>
                    <span className="text-foreground font-medium flex items-center gap-1">
                      {bookingType === "video" ? <><Video className="w-3 h-3" /> {getTranslatedValue(t, "consultation.video")}</> : <><Users className="w-3 h-3" /> {getTranslatedValue(t, "consultation.inPerson")}</>}
                    </span>
                  </div>
                  {selectedDate && <div className="flex justify-between"><span>{getTranslatedValue(t, "consultation.when")}</span><span className="text-foreground font-medium">{selectedDate} {getTranslatedValue(t, "common.at")} {selectedTime}</span></div>}
                  {pricingLabel && <div className="flex justify-between"><span>{getTranslatedValue(t, "consultation.rate")}</span><span className="text-foreground font-medium">{pricingLabel}</span></div>}
                  <div className="flex justify-between"><span>{getTranslatedValue(t, "consultation.with")}</span><span className="text-foreground font-medium">{proName}</span></div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => setStep(3)}>{getTranslatedValue(t, "common.back")}</Button>
                  <Button
                    className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={handleConfirm}
                    disabled={submitConsultation.isPending}
                  >
                    {submitConsultation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    {getTranslatedValue(t, "consultation.sendRequest")}
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
