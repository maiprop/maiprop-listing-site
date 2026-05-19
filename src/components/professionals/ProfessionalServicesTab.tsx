import { Button } from "@/components/ui/button";
import { Briefcase, Video, Calendar, MessageSquare, Lock } from "lucide-react";
import type { ProfessionalService, ProfessionalAvailability } from "@/hooks/useProfessionalServices";
import { stripSupervisorTestMarkers } from "@/lib/displayText";

const PRICING_LABELS: Record<string, string> = { hourly: "/hr", daily: "/day", fixed: " fixed" };
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  dbServices: ProfessionalService[];
  dbAvailability: ProfessionalAvailability[];
  professionalIsPro: boolean;
  user: { id: string } | null;
  onOpenModal: (key: "consult" | "msg") => void;
}

const ServiceIcon = ({ videoEnabled }: { videoEnabled: boolean }) => (
  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${videoEnabled ? "bg-primary/10" : "bg-gradient-primary"}`}>
    {videoEnabled
      ? <Video className="w-4 h-4 text-primary" />
      : <Briefcase className="w-4 h-4 text-primary-foreground" />}
  </div>
);

const ServiceTitle = ({ service }: { service: ProfessionalService }) => (
  <div>
    <span className="text-sm font-semibold">{service.service_name}</span>
    {Boolean(service.is_premium) && (
      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold font-medium">Pro</span>
    )}
  </div>
);

const ServicePrice = ({ service }: { service: ProfessionalService }) => (
  <span className="text-sm font-bold text-brand-gold shrink-0">
    {service.rate_amount ? `EUR ${service.rate_amount}${PRICING_LABELS[service.pricing_model] ?? ""}` : "On Request"}
  </span>
);

const ServiceHeader = ({ service }: { service: ProfessionalService }) => (
  <div className="flex items-start justify-between gap-3 flex-wrap">
    <ServiceTitle service={service} />
    <ServicePrice service={service} />
  </div>
);

const ServiceDescription = ({ description }: { description: string | null }) => {
  const cleanDescription = stripSupervisorTestMarkers(description);
  return cleanDescription
    ? <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{cleanDescription}</p>
    : null;
};

const ServiceRemotePill = () => (
  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
    <Video className="w-2.5 h-2.5" /> Remote available
  </span>
);

const ServiceMeta = ({ service }: { service: ProfessionalService }) => (
  <div className="flex items-center gap-2 mt-2 flex-wrap">
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground capitalize">
      {service.pricing_model}
    </span>
    {Boolean(service.video_enabled) && <ServiceRemotePill />}
  </div>
);

const ServiceActionButton = ({
  professionalIsPro,
  user,
  onOpenModal,
}: {
  professionalIsPro: boolean;
  user: { id: string } | null;
  onOpenModal: (key: "consult" | "msg") => void;
}) => {
  if (professionalIsPro && user) {
    return (
      <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground text-xs shrink-0 self-center" onClick={() => onOpenModal("consult")}>
        Book
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" className="border-border text-xs shrink-0 self-center" onClick={() => onOpenModal("msg")}>
      Enquire
    </Button>
  );
};

const ProfessionalServiceCard = ({
  service,
  professionalIsPro,
  user,
  onOpenModal,
}: {
  service: ProfessionalService;
  professionalIsPro: boolean;
  user: { id: string } | null;
  onOpenModal: (key: "consult" | "msg") => void;
}) => (
  <div className="flex items-start gap-4 p-4 bg-secondary rounded-xl border border-border hover:border-primary/20 transition-colors">
    <ServiceIcon videoEnabled={service.video_enabled} />
    <div className="flex-1 min-w-0">
      <ServiceHeader service={service} />
      <ServiceDescription description={service.description} />
      <ServiceMeta service={service} />
    </div>
    <ServiceActionButton professionalIsPro={professionalIsPro} user={user} onOpenModal={onOpenModal} />
  </div>
);

export function ProfessionalServicesTab({ dbServices, dbAvailability, professionalIsPro, user, onOpenModal }: Props) {
  return (
    <div className="space-y-5">
      {/* Service Cards */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" /> Services Offered
          </h2>
          <span className="text-xs text-muted-foreground">{dbServices.length > 0 ? `${dbServices.length} services` : ""}</span>
        </div>

        {dbServices.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {dbServices.map((svc) => (
              <ProfessionalServiceCard
                key={svc.id}
                service={svc}
                professionalIsPro={professionalIsPro}
                user={user}
                onOpenModal={onOpenModal}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No services listed yet.
          </div>
        )}

        {professionalIsPro && user ? (
          <Button className="w-full mt-4 bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => onOpenModal("consult")}>
            <Calendar className="w-4 h-4" /> Book a Consultation
          </Button>
        ) : (
          <Button variant="outline" className="w-full mt-4 border-border gap-2" onClick={() => onOpenModal("msg")}>
            <MessageSquare className="w-4 h-4" /> Send an Inquiry
          </Button>
        )}
      </div>

      {/* Availability Grid */}
      <div className="glass-card rounded-xl p-6">
        <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-emerald" /> Weekly Availability
        </h2>
        {dbAvailability.length > 0 ? (
          <>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_LABELS.map((day, i) => {
                const avail = dbAvailability.find(a => a.day_of_week === i);
                return (
                  <div key={day} className={`text-center py-2.5 px-1 rounded-xl text-xs border transition-colors ${
                    avail
                      ? "bg-brand-emerald/10 text-brand-emerald border-brand-emerald/25"
                      : "bg-secondary text-muted-foreground/40 border-border"
                  }`}>
                    <div className="font-semibold">{day}</div>
                    <div className="mt-0.5 text-[10px]">{avail ? "✓" : "—"}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1">
              {dbAvailability.map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{DAY_LABELS[a.day_of_week]}</span>
                  <span>{a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Times shown in local time (EET/EEST).</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Availability not yet configured — contact to confirm times.
          </p>
        )}
        {!professionalIsPro && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Lock className="w-3 h-3 text-brand-gold" /> Online booking is a Pro feature — send an inquiry to arrange a time.
          </p>
        )}
      </div>
    </div>
  );
}
