import { useState, useRef, useEffect } from "react";
import {
  Calendar, Upload, FileCheck, Shield, Loader2, Check, FileSignature, ClipboardCheck,
  Mail, Phone, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useMyOpenHouseRegistrations } from "@/hooks/useOpenHouseAssetControl";
import { getPlanLimits } from "@/hooks/usePlanLimits";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import {
  useOpenHouseSettings,
  useCreateOpenHouseRegistration,
  useUpdateOpenHouseRegistration,
  useOpenHouseRegistrations,
  uploadOpenHouseDoc,
  type OHIdDocType,
  type OHTimeslot,
} from "@/hooks/useOpenHouseAssetControl";
import { toast } from "sonner";

const WAIVER_TEXT = `I understand and agree that by attending this open house viewing I:
- Enter the property at my own risk
- Will comply with all safety instructions from the asset manager or representative
- Accept that the property owner and platform are not liable for any personal injury or property damage
- Consent to my ID being verified for admission`;

const BUDGET_OPTIONS = [
  { value: "under_100k", label: "Under €100k" },
  { value: "100k_200k", label: "€100k – €200k" },
  { value: "200k_500k", label: "€200k – €500k" },
  { value: "500k_1m", label: "€500k – €1M" },
  { value: "over_1m", label: "Over €1M" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  hasAssetControl: boolean;
  listingPrice?: number;
}

export default function OpenHouseRegistrationDialog({
  open,
  onClose,
  listingId,
  listingTitle,
  hasAssetControl,
  listingPrice,
}: Props) {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
  const { data: settings } = useOpenHouseSettings(hasAssetControl ? listingId : undefined);
  const { data: registrations = [], isLoading: regsLoading } = useOpenHouseRegistrations(listingId, false);
  const { data: myAllRegs = [] } = useMyOpenHouseRegistrations();
  const createReg = useCreateOpenHouseRegistration();
  const updateReg = useUpdateOpenHouseRegistration();

  // Require screening when property is >= €200k or a screening flag is set
  const requiresScreening = (listingPrice ?? 0) >= 200_000;

  const [step, setStep] = useState<"contact" | "timeslot" | "screening" | "id" | "waiver" | "qualified" | "done">("contact");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("");
  const [contactPermission, setContactPermission] = useState(false);
  const [idConsent, setIdConsent] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [timeslotIndex, setTimeslotIndex] = useState<number | null>(null);
  // Screening fields
  const [mortgageStatus, setMortgageStatus] = useState<string>("");
  const [budgetRange, setBudgetRange] = useState<string>("");
  const [workingWithAgent, setWorkingWithAgent] = useState<string>("");
  const [screeningDocFile, setScreeningDocFile] = useState<File | null>(null);
  const [screeningDocPreview, setScreeningDocPreview] = useState<string | null>(null);
  // Asset control fields
  const [idDocType, setIdDocType] = useState<OHIdDocType>("id_card");
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofAmount, setProofAmount] = useState("");
  const [investorDeclared, setInvestorDeclared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const screeningDocInputRef = useRef<HTMLInputElement>(null);

  const timeslots = (settings?.timeslots ?? []) as OHTimeslot[];
  const myReg = registrations.find((r: { requester_id: string }) => r.requester_id === user?.id);
  const regId = registrationId || myReg?.id;
  const hasContactPacket = !!(
    myReg?.contact_name &&
    myReg?.contact_email &&
    myReg?.contact_phone &&
    myReg?.contact_permission_at &&
    myReg?.id_verification_consent_at &&
    myReg?.privacy_acknowledged_at
  );

  // RSVP plan-limit check (free buyer = 3/month)
  const participantType = getParticipantTypeFromProfile(profile);
  const rsvpLimit = getPlanLimits(participantType, isPro ? "pro" : "free").openHouseRsvp;
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const rsvpsThisMonth = (myAllRegs as Array<{ created_at: string; status: string }>).filter(
    r => new Date(r.created_at) >= startOfMonth && r.status !== "cancelled"
  ).length;
  const rsvpLimitReached = !myReg && rsvpLimit !== null && rsvpsThisMonth >= rsvpLimit;
  const requirePOF = settings?.require_proof_of_funds ?? false;
  const requireInvestor = settings?.require_investor_declaration ?? false;

  // Count active registrations per timeslot to enforce per-slot capacity
  const slotCounts = timeslots.map((_, idx) =>
    registrations.filter((r: { timeslot_index: number | null; status: string }) =>
      r.timeslot_index === idx && r.status !== "cancelled" && r.status !== "rejected"
    ).length
  );

  // Total active registrations for max_total_visitors check
  const totalActive = registrations.filter(
    (r: { status: string }) => r.status !== "cancelled" && r.status !== "rejected"
  ).length;
  const maxTotal = settings?.max_total_visitors ?? null;
  const listingFull = maxTotal !== null && totalActive >= maxTotal && !myReg;

  // Determine step order based on configuration
  const stepOrder: Array<typeof step> = (() => {
    const steps: Array<typeof step> = ["contact", "timeslot"];
    if (requiresScreening) steps.push("screening");
    steps.push("id");
    steps.push("waiver");
    if (requirePOF || requireInvestor) steps.push("qualified");
    steps.push("done");
    return steps;
  })();
  const currentStepIdx = stepOrder.indexOf(step);
  const totalSteps = stepOrder.length - 1; // exclude "done"

  const handleContactContinue = async () => {
    if (!user) {
      toast.error("Please sign in to register");
      return;
    }
    if (!contactName.trim() || !contactEmail.trim() || !contactPhone.trim()) {
      toast.error("Please add your name, email, and phone number");
      return;
    }
    if (!contactPermission || !idConsent || !privacyAcknowledged) {
      toast.error("Please accept the contact, ID verification, and privacy acknowledgements");
      return;
    }

    if (myReg && !hasContactPacket) {
      setLoading(true);
      try {
        await updateReg.mutateAsync({
          id: myReg.id,
          updates: {
            contact_name: contactName,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            contact_permission_at: new Date().toISOString(),
            id_verification_consent_at: new Date().toISOString(),
            privacy_acknowledged_at: new Date().toISOString(),
            visit_purpose: visitPurpose || undefined,
          },
        });
      } catch (_err: unknown) {
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setStep("timeslot");
  };

  const handleStartRegistration = async () => {
    if (!user) {
      toast.error("Please sign in to register");
      return;
    }
    if (listingFull) {
      toast.error("This open house is fully booked");
      return;
    }
    if (rsvpLimitReached) {
      toast.error(`You've reached your ${rsvpLimit} RSVP limit this month. Upgrade to Pro for unlimited RSVPs.`);
      return;
    }
    setLoading(true);
    try {
      if (myReg) {
        setRegistrationId(myReg.id);
        // Jump to correct next step
        if (requiresScreening) setStep("screening");
        else setStep("id");
      } else {
        const data = await createReg.mutateAsync({
          listingId,
          timeslotIndex: timeslots.length ? (timeslotIndex ?? 0) : undefined,
          note: undefined,
          contactName,
          contactEmail,
          contactPhone,
          visitPurpose,
        });
        setRegistrationId((data as { id?: string })?.id ?? null);
        if (requiresScreening) setStep("screening");
        else setStep("id");
      }
    } catch (_err: unknown) {
      // handled by mutation
    } finally {
      setLoading(false);
    }
  };

  const handleScreeningDoc = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5 MB");
      return;
    }
    setScreeningDocFile(file);
    const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (IMAGE_EXTS.has(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => setScreeningDocPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setScreeningDocPreview(null);
    }
  };

  const handleScreeningSubmit = async () => {
    if (!regId || !mortgageStatus || !budgetRange || !workingWithAgent) {
      toast.error("Please answer all required questions");
      return;
    }
    setLoading(true);
    try {
      const updates: Parameters<typeof updateReg.mutateAsync>[0]["updates"] = {
        mortgage_status: mortgageStatus,
        budget_range: budgetRange,
        working_with_agent: workingWithAgent,
      };
      // Upload screening doc to storage (optional)
      if (screeningDocFile && user?.id) {
        const ext = screeningDocFile.name.split(".").pop() ?? "pdf";
        const path = `${user.id}/${listingId}/screening_${crypto.randomUUID()}.${ext}`;
        try {
          const storedPath = await uploadOpenHouseDoc(screeningDocFile, path);
          updates.screening_doc_url = storedPath;
        } catch (_err: unknown) {
          // Non-fatal — proceed without doc
          toast.warning("Screening document upload failed — submission will continue without it.");
        }
      }
      await updateReg.mutateAsync({ id: regId, updates });
      if (hasAssetControl) setStep("id");
      else setStep("done");
    } catch (_err: unknown) {
      // handled by mutation
    } finally {
      setLoading(false);
    }
  };

  const handleIdUpload = async () => {
    if (!regId || !idDocFile || !user?.id) return;
    const MAX_DOC_SIZE = 5 * 1024 * 1024;
    if (idDocFile.size > MAX_DOC_SIZE) {
      toast.error("ID document must be under 5 MB");
      return;
    }
    setLoading(true);
    try {
      const ext = idDocFile.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${listingId}/id_${crypto.randomUUID()}.${ext}`;
      const storedPath = await uploadOpenHouseDoc(idDocFile, path);
      await updateReg.mutateAsync({
        id: regId,
        updates: { id_doc_type: idDocType, id_doc_url: storedPath },
      });
      setStep("waiver");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWaiverSign = async () => {
    if (!regId || !waiverAccepted) return;
    setLoading(true);
    try {
      await updateReg.mutateAsync({
        id: regId,
        updates: {
          waiver_signed_at: new Date().toISOString(),
          // waiver_url stores a signed-copy reference; placeholder until PDF signing is implemented
          waiver_url: `waiver_accepted_${crypto.randomUUID()}`,
        },
      });
      if (requirePOF || requireInvestor) setStep("qualified");
      else setStep("done");
    } catch (_err: unknown) {
      // handled
    } finally {
      setLoading(false);
    }
  };

  const handleQualifiedSubmit = async () => {
    if (!regId) return;
    const updates: Parameters<typeof updateReg.mutateAsync>[0]["updates"] = {};
    if (requireInvestor && investorDeclared) {
      updates.investor_declaration_signed_at = new Date().toISOString();
    }
    if (requirePOF && proofFile && user?.id) {
      const ext = proofFile.name.split(".").pop() ?? "pdf";
      const path = `${user.id}/${listingId}/proof_${crypto.randomUUID()}.${ext}`;
      updates.proof_of_funds_url = await uploadOpenHouseDoc(proofFile, path);
      if (proofAmount) updates.proof_amount = parseFloat(proofAmount);
    }
    setLoading(true);
    try {
      await updateReg.mutateAsync({ id: regId, updates });
      setStep("done");
      toast.success("Registration complete. Awaiting approval from asset manager.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("contact");
      setTimeslotIndex(null);
      setContactPermission(false);
      setIdConsent(false);
      setPrivacyAcknowledged(false);
      setMortgageStatus("");
      setBudgetRange("");
      setWorkingWithAgent("");
      setScreeningDocFile(null);
      setScreeningDocPreview(null);
      setIdDocFile(null);
      setWaiverAccepted(false);
      setProofFile(null);
      setProofAmount("");
      setInvestorDeclared(false);
      setRegistrationId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const profileName =
      profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
    setContactName(myReg?.contact_name || profileName || "");
    setContactEmail(myReg?.contact_email || user?.email || "");
    setContactPhone(myReg?.contact_phone || "");
    setVisitPurpose(myReg?.visit_purpose || "");
    setContactPermission(!!myReg?.contact_permission_at);
    setIdConsent(!!myReg?.id_verification_consent_at);
    setPrivacyAcknowledged(!!myReg?.privacy_acknowledged_at);
  }, [myReg, open, profile?.display_name, profile?.first_name, profile?.last_name, user?.email]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {step === "done" ? "Registration Submitted" : "Pre-register for Open House"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Submit visitor details, scheduling preferences, verification documents, and required open-house consents.
          </DialogDescription>
        </DialogHeader>

        {step === "done" ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <p className="font-semibold">{listingTitle}</p>
            <p className="text-sm text-muted-foreground">
              {myReg?.status === "approved"
                ? "You're approved to attend."
                : "Your registration has been submitted. The asset manager will review and approve."}
            </p>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Progress indicator */}
            {currentStepIdx < totalSteps && totalSteps > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Step {currentStepIdx + 1} of {totalSteps}</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${((currentStepIdx + 1) / totalSteps) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Step: Contact and consent */}
            {step === "contact" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <UserRound className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">Visitor details</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hosts need verified contact details before they can approve access to a private viewing.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="oh-contact-name" className="text-xs font-semibold text-muted-foreground">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <input
                    id="oh-contact-name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    placeholder="Your legal name"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="oh-contact-email" className="text-xs font-semibold text-muted-foreground">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        id="oh-contact-email"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="oh-contact-phone" className="text-xs font-semibold text-muted-foreground">
                      Phone <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        id="oh-contact-phone"
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
                        placeholder="+30..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oh-visit-purpose" className="text-xs font-semibold text-muted-foreground">
                    Reason for attending
                  </Label>
                  <textarea
                    id="oh-visit-purpose"
                    rows={3}
                    value={visitPurpose}
                    onChange={(e) => setVisitPurpose(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
                    placeholder="Buying, renting, representing a client, investment review..."
                  />
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contactPermission}
                      onChange={(e) => setContactPermission(e.target.checked)}
                      className="mt-1 rounded border-border"
                    />
                    <span>I allow the host or their representative to contact me about this open house.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={idConsent}
                      onChange={(e) => setIdConsent(e.target.checked)}
                      className="mt-1 rounded border-border"
                    />
                    <span>I agree to provide ID for admission verification before attending.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyAcknowledged}
                      onChange={(e) => setPrivacyAcknowledged(e.target.checked)}
                      className="mt-1 rounded border-border"
                    />
                    <span>I understand my registration details and documents are shared with the listing host for review.</span>
                  </label>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleContactContinue}
                  disabled={loading || !contactName.trim() || !contactEmail.trim() || !contactPhone.trim() || !contactPermission || !idConsent || !privacyAcknowledged}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRound className="w-4 h-4" />}
                  Continue
                </Button>
              </>
            )}

            {/* Step: Timeslot */}
            {step === "timeslot" && (
              <>
                {hasAssetControl && timeslots.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Select a timeslot</p>
                    <div className="space-y-2">
                      {timeslots.map((ts, i) => {
                        const full = slotCounts[i] >= ts.max_visitors;
                        return (
                          <button
                            key={i}
                            onClick={() => !full && setTimeslotIndex(i)}
                            disabled={full}
                            className={`w-full p-3 rounded-xl border text-left text-sm transition-colors ${
                              full
                                ? "border-border opacity-50 cursor-not-allowed bg-muted"
                                : timeslotIndex === i
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <span>{ts.start} – {ts.end}</span>
                            <span className={`ml-2 text-xs ${full ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {full ? "Full" : `${slotCounts[i]} / ${ts.max_visitors} booked`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {listingFull && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/25 px-4 py-3 text-sm text-destructive font-medium">
                    This open house is fully booked — no more registrations available.
                  </div>
                )}
                {!listingFull && rsvpLimitReached && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-sm text-amber-700 font-medium">
                    You've used {rsvpsThisMonth}/{rsvpLimit} RSVPs this month. <a href="/pricing" className="underline underline-offset-2 font-semibold hover:opacity-70">Upgrade to Pro</a> for unlimited RSVPs.
                  </div>
                )}
                <Button
                  className="w-full gap-2"
                  onClick={handleStartRegistration}
                  disabled={loading || regsLoading || listingFull || rsvpLimitReached || (hasAssetControl && timeslots.length > 0 && timeslotIndex === null)}
                >
                  {loading || regsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                  {regsLoading ? "Loading…" : myReg ? "Continue" : listingFull ? "Fully Booked" : rsvpLimitReached ? "RSVP Limit Reached" : "Register"}
                </Button>
              </>
            )}

            {/* Step: Pre-qualification screening */}
            {step === "screening" && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardCheck className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">Pre-qualification</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  A few quick questions help the host qualify serious buyers. Your answers are only shared with the listing host.
                </p>

                {/* Q1: Mortgage / funds */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Are you currently pre-approved for a mortgage or have funds available? <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                      { value: "exploring", label: "Exploring options" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMortgageStatus(opt.value)}
                        className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                          mortgageStatus === opt.value
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:bg-secondary/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2: Budget range */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    What is your approximate budget range? <span className="text-destructive">*</span>
                  </Label>
                  <Select value={budgetRange} onValueChange={setBudgetRange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select budget range" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Q3: Working with agent */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Are you working with an agent? <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                      { value: "i_am_agent", label: "I am the agent" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setWorkingWithAgent(opt.value)}
                        className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                          workingWithAgent === opt.value
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:bg-secondary/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q4: ID document upload (optional) */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    ID document upload <span className="text-muted-foreground font-normal">(optional but recommended)</span>
                  </Label>
                  <input
                    ref={screeningDocInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleScreeningDoc(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => screeningDocInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {screeningDocFile ? screeningDocFile.name : "Upload ID / passport"}
                  </Button>
                  {screeningDocPreview && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-border">
                      <img
                        src={screeningDocPreview}
                        alt="ID preview"
                        className="w-full max-h-40 object-contain bg-secondary/40"
                      />
                    </div>
                  )}
                  {screeningDocFile && !screeningDocPreview && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                      {screeningDocFile.name} selected
                    </p>
                  )}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleScreeningSubmit}
                  disabled={loading || !mortgageStatus || !budgetRange || !workingWithAgent}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                  Continue
                </Button>
              </>
            )}

            {/* Step: ID verification (asset control) */}
            {step === "id" && (
              <>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">ID verification</p>
                  <div className="flex gap-2 mb-3">
                    {(["id_card", "passport"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setIdDocType(t)}
                        className={`px-4 py-2 rounded-lg text-sm border ${
                          idDocType === t ? "border-primary bg-primary/10" : "border-border"
                        }`}
                      >
                        {t === "id_card" ? "ID card" : "Passport"}
                      </button>
                    ))}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setIdDocFile(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4" />
                    {idDocFile ? idDocFile.name : "Upload ID document"}
                  </Button>
                </div>
                <Button className="w-full gap-2" onClick={handleIdUpload} disabled={!idDocFile || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Continue
                </Button>
              </>
            )}

            {/* Step: Waiver */}
            {step === "waiver" && (
              <>
                <div className="bg-secondary rounded-xl p-4 text-sm text-muted-foreground max-h-32 overflow-y-auto">
                  {WAIVER_TEXT}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waiverAccepted}
                    onChange={(e) => setWaiverAccepted(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">I agree to the liability waiver</span>
                </label>
                <Button className="w-full gap-2" onClick={handleWaiverSign} disabled={!waiverAccepted || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                  Sign & Continue
                </Button>
              </>
            )}

            {/* Step: Qualified (proof of funds / investor declaration) */}
            {step === "qualified" && (
              <>
                {requirePOF && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      Proof of funds {requirePOF ? "(required)" : "(optional)"}
                    </p>
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    />
                    <Button variant="outline" className="w-full gap-2 mb-2" onClick={() => proofInputRef.current?.click()}>
                      <Upload className="w-4 h-4" /> {proofFile ? proofFile.name : "Upload"}
                    </Button>
                    <input
                      type="number"
                      placeholder="Amount (€)"
                      min="0"
                      step="0.01"
                      value={proofAmount}
                      onChange={(e) => setProofAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>
                )}
                {requireInvestor && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={investorDeclared}
                      onChange={(e) => setInvestorDeclared(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">I declare I am a qualified investor / serious buyer</span>
                  </label>
                )}
                <Button className="w-full gap-2" onClick={handleQualifiedSubmit} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                  Submit
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
