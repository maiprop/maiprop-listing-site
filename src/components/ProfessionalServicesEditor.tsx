/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import {
  Wrench, Plus, Trash2, Video, Calendar,
  Clock, Save, ChevronDown, ChevronUp, Loader2, Check, Link as LinkIcon,
  Phone, CalendarDays, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useMyProfessional,
  useProfessionalServices,
  useProfessionalAvailability,
  useUpsertProfessionalServices,
  useUpsertProfessionalAvailability,
  useUpdateProfessional,
  type ProfessionalService,
  type ProfessionalAvailability,
} from "@/hooks/useProfessionalServices";
import { getServicesForCategory, type ServiceTemplate, type PricingModel } from "@/lib/professionalServiceCatalog";

const PRICING_DISPLAY: Record<string, string> = { hourly: "/hr", daily: "/day", fixed: " fixed" };
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRICING_OPTIONS: { value: PricingModel; label: string }[] = [
  { value: "hourly", label: "Per Hour" },
  { value: "daily", label: "Per Day" },
  { value: "fixed", label: "Fixed Price" },
];

const parseServiceRate = (rate: string): number | null => {
  if (rate.trim() === "") return null;
  const parsed = Number(rate);
  return Number.isFinite(parsed) ? parsed : null;
};

interface SelectedService {
  template: ServiceTemplate;
  pricingModel: PricingModel;
  rate: string;
  videoEnabled: boolean;
}

interface DayAvail {
  enabled: boolean;
  start: string;
  end: string;
}

const VideoLinkField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground block mb-1.5">External meeting URL (optional)</label>
    <div className="flex gap-2">
      <div className="relative flex-1">
        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
        />
      </div>
    </div>
    <p className="text-xs text-muted-foreground mt-1.5">
      Leave blank to use the built-in mAI prop video room after a booking is confirmed.
    </p>
  </div>
);

// skipcq: JS-0067 - React dashboard component is intentionally module-scoped.
export default function ProfessionalServicesEditor() { // skipcq: JS-R1005, JS-W1044 - Services editor coordinates catalog selection, availability, video settings, and persistence.
  const { data: pro, isLoading: proLoading } = useMyProfessional();
  const { data: existingServices = [] } = useProfessionalServices(pro?.id || "");
  const { data: existingAvailability = [] } = useProfessionalAvailability(pro?.id || "");

  const upsertServices = useUpsertProfessionalServices();
  const upsertAvailability = useUpsertProfessionalAvailability();
  const updatePro = useUpdateProfessional();

  const [selectedServices, setSelectedServices] = useState<Record<string, SelectedService>>({});
  const [availability, setAvailability] = useState<DayAvail[]>(
    DAYS.map((_, i) => ({ enabled: i >= 1 && i <= 5, start: "09:00", end: "18:00" }))
  );
  const [videoLink, setVideoLink] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"services" | "availability" | "video">("services");
  const [showCustomService, setShowCustomService] = useState(false);
  const [customService, setCustomService] = useState({ name: "", description: "", pricingModel: "hourly" as PricingModel, rate: "", videoEnabled: false });
  const [initialized, setInitialized] = useState(false);

  // Initialize from existing data
  useEffect(() => { // skipcq: JS-R1005 - Hydration maps existing professional services, availability, and video settings once.
    if (initialized || proLoading) return;
    if (pro) {
      setVideoLink(pro.video_link || "");
      setCalendarNotes(pro.calendar_notes || "");
    }
    if (existingServices.length > 0 && pro?.category) {
      const catalog = getServicesForCategory(pro.category);
      const map: Record<string, SelectedService> = {};
      existingServices.forEach(svc => { // skipcq: JS-R1005 - Stored service rows need custom/template fallback mapping in one hydration pass.
        const isCustom = svc.service_key.startsWith("custom_");
        const template = isCustom
          ? { key: svc.service_key, name: svc.service_name, description: svc.description ?? "", defaultPricing: svc.pricing_model as PricingModel, suggestedRate: svc.rate_amount ?? 0, videoAvailable: svc.video_enabled, isPremiumFeature: false }
          : catalog.find(t => t.key === svc.service_key) ?? { key: svc.service_key, name: svc.service_name, description: svc.description ?? "", defaultPricing: svc.pricing_model as PricingModel, suggestedRate: svc.rate_amount ?? 0, videoAvailable: svc.video_enabled, isPremiumFeature: svc.is_premium };
        map[svc.service_key] = {
          template,
          pricingModel: svc.pricing_model as PricingModel,
          rate: svc.rate_amount ? String(svc.rate_amount) : "",
          videoEnabled: svc.video_enabled,
        };
      });
      setSelectedServices(map);
    }
    if (existingAvailability.length > 0) {
      setAvailability(prev => {
        const next = prev.map((d, i) => {
          const found = existingAvailability.find(a => a.day_of_week === i);
          return found ? { enabled: true, start: found.start_time.slice(0, 5), end: found.end_time.slice(0, 5) } : { ...d, enabled: false };
        });
        return next;
      });
    }
    setInitialized(true);
  }, [pro, existingServices, existingAvailability, initialized, proLoading]);

  if (proLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (!pro) return (
    <div className="glass-card rounded-xl p-12 text-center">
      <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <p className="font-semibold">No professional profile found</p>
      <p className="text-sm text-muted-foreground mt-1">Complete onboarding as a Service Professional first.</p>
    </div>
  );

  const catalog = getServicesForCategory(pro.category);
  const professionalId = pro.id;
  const professionalCategory = pro.category;

  const toggleService = (svc: ServiceTemplate) => {
    setSelectedServices(prev => {
      if (prev[svc.key]) {
        const next = { ...prev };
        delete next[svc.key];
        return next;
      }
      return {
        ...prev,
        [svc.key]: { template: svc, pricingModel: svc.defaultPricing, rate: String(svc.suggestedRate), videoEnabled: svc.videoAvailable },
      };
    });
  };

  const updateService = (key: string, field: keyof SelectedService, value: any) => {
    setSelectedServices(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const buildServiceRows = (services: Record<string, SelectedService>) => Object.values(services).map(s => ({
    professional_id: professionalId,
    service_key: s.template.key,
    service_name: s.template.name,
    description: s.template.description,
    category: professionalCategory,
    pricing_model: s.pricingModel,
    rate_amount: parseServiceRate(s.rate),
    currency: "EUR",
    video_enabled: s.videoEnabled,
    is_premium: s.template.isPremiumFeature,
    is_active: true,
  }));

  const handleSaveServices = async () => {
    if (!pro) return;
    const rows = buildServiceRows(selectedServices);
    await upsertServices.mutateAsync({ professionalId: pro.id, services: rows as Omit<ProfessionalService, "id">[] });
  };

  const handleSaveAvailability = async () => {
    if (!pro) return;
    const rows = availability
      .map((d, i) => ({ ...d, dayIndex: i }))
      .filter(d => d.enabled)
      .map(d => ({
        professional_id: pro.id,
        day_of_week: d.dayIndex,
        start_time: d.start,
        end_time: d.end,
        is_active: true,
      }));
    await upsertAvailability.mutateAsync({ professionalId: pro.id, availability: rows as Omit<ProfessionalAvailability, "id">[] });
  };

  const handleSaveVideo = async () => {
    if (!pro) return;
    await updatePro.mutateAsync({ id: pro.id, updates: { video_link: videoLink || null, calendar_notes: calendarNotes || null } });
  };

  const selectedCount = Object.keys(selectedServices).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold">My Services & Availability</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage the services you offer, your schedule, and video consultation settings.</p>
      </div>

      {/* Panel tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit flex-wrap">
        {(["services", "availability", "video"] as const).map(panel => (
          <button key={panel} onClick={() => setActivePanel(panel)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activePanel === panel ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {panel === "services" ? `Services (${selectedCount})` : panel === "availability" ? "Availability" : "Calls, Video & Calendar"}
          </button>
        ))}
      </div>

              {/* Services panel tab label */}
      {activePanel === "services" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{selectedCount} service{selectedCount !== 1 ? "s" : ""} selected from your catalog</p>
            <Button onClick={handleSaveServices} disabled={upsertServices.isPending}
              className="bg-gradient-primary border-0 text-primary-foreground gap-2">
              {upsertServices.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Services
            </Button>
          </div>
          <div className="space-y-2">
            {catalog.map(svc => { // skipcq: JS-R1005, JS-W1044 - Service rows combine selection, expansion, pricing, and video controls.
              const isSelected = Boolean(selectedServices[svc.key]);
              const config = selectedServices[svc.key];
              const isExpanded = expandedService === svc.key;
              return (
                <div key={svc.key} className={cn(
                  "glass-card rounded-xl border transition-all",
                  isSelected ? "border-primary/30 bg-primary/3" : "border-border"
                )}>
                  <div className="flex items-start gap-3 p-4">
                    {/* Checkbox toggle */}
                    <button onClick={() => toggleService(svc)}
                      className={cn("w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary/50"
                      )}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{svc.name}</span>
                        {svc.videoAvailable && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1"><Video className="w-2.5 h-2.5" />Remote</span>}
                        {svc.isPremiumFeature && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/15 text-brand-gold">Pro</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{svc.description}</p>
                      {isSelected && config && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                          <span className="text-brand-gold font-semibold">
                            {config.rate ? `€${config.rate}` : "—"}{PRICING_DISPLAY[config.pricingModel]}
                          </span>
                          <span className="text-muted-foreground capitalize">{config.pricingModel}</span>
                          {config.videoEnabled && <span className="text-primary flex items-center gap-1"><Video className="w-3 h-3" />Video on</span>}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <button onClick={() => setExpandedService(isExpanded ? null : svc.key)}
                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {/* Expanded config */}
                  {isSelected && isExpanded && config && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Pricing Model</label>
                        <select value={config.pricingModel}
                          onChange={e => updateService(svc.key, "pricingModel", e.target.value)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors">
                          {PRICING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          Rate (€){config.pricingModel === "hourly" ? "/hr" : config.pricingModel === "daily" ? "/day" : " fixed"}
                        </label>
                        <input type="number" value={config.rate}
                          onChange={e => updateService(svc.key, "rate", e.target.value)}
                          placeholder={String(svc.suggestedRate)}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors" />
                      </div>
                      <div className="flex flex-col justify-end">
                        {svc.videoAvailable && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div onClick={() => updateService(svc.key, "videoEnabled", !config.videoEnabled)}
                              className={cn("w-9 h-5 rounded-full transition-colors relative",
                                config.videoEnabled ? "bg-primary" : "bg-secondary border border-border"
                              )}>
                              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-background transition-all shadow-sm",
                                config.videoEnabled ? "left-4" : "left-0.5"
                              )} />
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Video className="w-3.5 h-3.5" /> Video enabled
                            </span>
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom services (not in catalog) */}
          {Object.entries(selectedServices)
            .filter(([k]) => k.startsWith("custom_"))
            .map(([key, config]) => (
              <div key={key} className="glass-card rounded-xl border border-primary/20 p-4 flex items-center justify-between gap-4">
                <div>
                  <span className="font-semibold text-sm">{config.template.name}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{config.rate ? `€${config.rate}` : "—"}{PRICING_DISPLAY[config.pricingModel]} {config.videoEnabled && "· Video"}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={upsertServices.isPending} onClick={async () => {
                  const next = { ...selectedServices }; delete next[key]; setSelectedServices(next);
                  const rows = buildServiceRows(next);
                  await upsertServices.mutateAsync({ professionalId, services: rows as Omit<ProfessionalService, "id">[] });
                }}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}

          {/* Add your own Service */}
          <div className="glass-card rounded-xl border border-dashed border-primary/30 p-4">
            {!showCustomService ? (
              <button onClick={() => setShowCustomService(true)} className="w-full flex items-center justify-center gap-2 py-3 text-primary hover:bg-primary/5 rounded-lg transition-colors font-medium">
                <Plus className="w-4 h-4" /> Add your own Service
              </button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Add custom service</p>
                  <button onClick={() => { setShowCustomService(false); setCustomService({ name: "", description: "", pricingModel: "hourly", rate: "", videoEnabled: false }); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Service name</label>
                    <input value={customService.name} onChange={e => setCustomService(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Bespoke Consultation" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Pricing</label>
                    <select value={customService.pricingModel} onChange={e => setCustomService(s => ({ ...s, pricingModel: e.target.value as PricingModel }))} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                      {PRICING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Rate (€)</label>
                    <input type="number" value={customService.rate} onChange={e => setCustomService(s => ({ ...s, rate: e.target.value }))} placeholder="80" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer self-end">
                    <input type="checkbox" checked={customService.videoEnabled} onChange={e => setCustomService(s => ({ ...s, videoEnabled: e.target.checked }))} className="rounded border-border" />
                    <span className="text-xs flex items-center gap-1"><Video className="w-3.5 h-3.5" /> Video call available</span>
                  </label>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Description (optional)</label>
                  <textarea value={customService.description} onChange={e => setCustomService(s => ({ ...s, description: e.target.value }))} placeholder="Brief description for clients" rows={2} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
                <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" disabled={!customService.name.trim() || upsertServices.isPending}
                  onClick={async () => {
                    const key = `custom_${Date.now()}`;
                    const template = { key, name: customService.name.trim(), description: customService.description.trim(), defaultPricing: customService.pricingModel, suggestedRate: parseServiceRate(customService.rate) ?? 0, videoAvailable: customService.videoEnabled, isPremiumFeature: false };
                    const newSelected = { ...selectedServices, [key]: { template, pricingModel: customService.pricingModel, rate: customService.rate, videoEnabled: customService.videoEnabled } };
                    setSelectedServices(newSelected);
                    setCustomService({ name: "", description: "", pricingModel: "hourly", rate: "", videoEnabled: false });
                    setShowCustomService(false);
                    const rows = buildServiceRows(newSelected);
                    await upsertServices.mutateAsync({ professionalId, services: rows as Omit<ProfessionalService, "id">[] });
                  }}>
                  {upsertServices.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add & Save
                </Button>
              </div>
            )}
          </div>

          <Button onClick={handleSaveServices} disabled={upsertServices.isPending}
            className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2">
            {upsertServices.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save {selectedCount} Service{selectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* ── Availability panel ── */}
      {activePanel === "availability" && (
        <div className="space-y-5">
          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-emerald" /> Weekly Schedule
            </h2>
            {DAYS.map((day, i) => { // skipcq: JS-R1005, JS-W1044 - Each schedule row owns enabled state plus paired start/end controls.
              const d = availability[i];
              return (
                <div key={day} className={cn(
                  "p-4 rounded-xl border transition-all",
                  d.enabled ? "border-brand-emerald/25 bg-brand-emerald/5" : "border-border bg-secondary/30"
                )}>
                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button onClick={() => setAvailability(prev => {
                      const next = [...prev]; next[i] = { ...next[i], enabled: !next[i].enabled }; return next;
                    })} className={cn("w-9 h-5 rounded-full transition-colors relative shrink-0",
                      d.enabled ? "bg-brand-emerald" : "bg-secondary border border-border"
                    )}>
                      <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-background transition-all shadow-sm",
                        d.enabled ? "left-4" : "left-0.5"
                      )} />
                    </button>
                    <span className={cn("font-semibold w-10 text-sm", d.enabled ? "text-foreground" : "text-muted-foreground")}>{day}</span>
                    {d.enabled && (
                      <div className="flex items-center gap-2 ml-auto flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <input type="time" value={d.start}
                            onChange={e => setAvailability(prev => { const next = [...prev]; next[i] = { ...next[i], start: e.target.value }; return next; })}
                            className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary" />
                        </div>
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="time" value={d.end}
                          onChange={e => setAvailability(prev => { const next = [...prev]; next[i] = { ...next[i], end: e.target.value }; return next; })}
                          className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-primary" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Button onClick={handleSaveAvailability} disabled={upsertAvailability.isPending}
            className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2">
            {upsertAvailability.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Availability
          </Button>
        </div>
      )}

      {/* ── Calls, Video & Calendar panel ── */}
      {activePanel === "video" && (
        <div className="space-y-5">
          {/* Manage calls and video through the app */}
          <div className="glass-card rounded-xl p-5 space-y-4 border border-primary/20">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> Calls & Video through the app
            </h2>
            <p className="text-sm text-muted-foreground">
              Clients can book and join calls or video consultations directly through maiProp. No need to share external links — sessions are managed in-app.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                <Phone className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Voice calls</p>
                  <p className="text-xs text-muted-foreground">Accept in-app voice calls from booked clients</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                <Video className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Video calls</p>
                  <p className="text-xs text-muted-foreground">Video consultations via the app (or use your link below)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar sync */}
          <div className="glass-card rounded-xl p-5 space-y-4 border border-brand-emerald/20">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-emerald" /> Calendar Sync
            </h2>
            <p className="text-sm text-muted-foreground">
              Connect your calendar so clients see your real availability when booking. Prevents double-booking.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="border-border gap-2" disabled>
                <RefreshCw className="w-4 h-4" /> Connect Google Calendar
              </Button>
              <Button variant="outline" className="border-border gap-2" disabled>
                <RefreshCw className="w-4 h-4" /> Connect Outlook
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Calendar sync (Google/Outlook) is being rolled out. Your weekly availability above is used for bookings until direct sync is enabled.</p>
          </div>

          <div className="glass-card rounded-xl p-5 space-y-4">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" /> Video Consultation Link
            </h2>
            <VideoLinkField value={videoLink} onChange={setVideoLink} />

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Calendar Notes (shown to clients)</label>
              <textarea value={calendarNotes} onChange={e => setCalendarNotes(e.target.value)} rows={3}
                placeholder="e.g. Please prepare relevant documents before the call. Consultations are in English or Greek."
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors" />
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <Video className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Video consultations</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Video-enabled services will show a "Remote available" badge on your profile. Clients can choose in-person or video when booking.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Button onClick={handleSaveVideo} disabled={updatePro.isPending}
            className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2">
            {updatePro.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Video Settings
          </Button>
        </div>
      )}
    </div>
  );
}
