import { useState, useRef, useEffect } from "react";
import {
  Calendar, Upload, FileCheck, Shield, Loader2, Check, FileSignature
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
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

interface Props {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  hasAssetControl: boolean;
}

export default function OpenHouseRegistrationDialog({
  open,
  onClose,
  listingId,
  listingTitle,
  hasAssetControl,
}: Props) {
  const { user } = useAuth();
  const { data: settings } = useOpenHouseSettings(hasAssetControl ? listingId : undefined);
  const { data: registrations = [] } = useOpenHouseRegistrations(listingId, false);
  const createReg = useCreateOpenHouseRegistration();
  const updateReg = useUpdateOpenHouseRegistration();

  const [step, setStep] = useState<"timeslot" | "id" | "waiver" | "qualified" | "done">("timeslot");
  const [timeslotIndex, setTimeslotIndex] = useState<number | null>(null);
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

  const timeslots = (settings?.timeslots ?? []) as OHTimeslot[];
  const myReg = registrations.find((r: any) => r.requester_id === user?.id);
  const regId = registrationId || myReg?.id;
  const requirePOF = settings?.require_proof_of_funds ?? false;
  const requireInvestor = settings?.require_investor_declaration ?? false;

  const handleStartRegistration = async () => {
    if (!user) {
      toast.error("Please sign in to register");
      return;
    }
    setLoading(true);
    try {
      if (myReg) {
        setRegistrationId(myReg.id);
        setStep(hasAssetControl ? "id" : "done");
      } else {
        const data = await createReg.mutateAsync({
          listingId,
          timeslotIndex: timeslots.length ? (timeslotIndex ?? 0) : undefined,
          note: undefined,
        });
        setRegistrationId((data as any)?.id ?? null);
        setStep(hasAssetControl ? "id" : "done");
      }
    } catch {
      // handled by mutation
    } finally {
      setLoading(false);
    }
  };

  const handleIdUpload = async () => {
    if (!regId || !idDocFile || !user?.id) return;
    setLoading(true);
    try {
      const ext = idDocFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${listingId}/id_${Date.now()}.${ext}`;
      const storedPath = await uploadOpenHouseDoc(idDocFile, path);
      await updateReg.mutateAsync({
        id: regId,
        updates: { id_doc_type: idDocType, id_doc_url: storedPath },
      });
      setStep("waiver");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWaiverSign = async () => {
    if (!regId || !waiverAccepted) return;
    setLoading(true);
    try {
      await updateReg.mutateAsync({
        id: myReg.id,
        updates: {
          waiver_signed_at: new Date().toISOString(),
          waiver_url: `signed_${Date.now()}`,
        },
      });
      if (requirePOF || requireInvestor) setStep("qualified");
      else setStep("done");
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  const handleQualifiedSubmit = async () => {
    if (!regId) return;
    const updates: any = {};
    if (requireInvestor && investorDeclared) {
      updates.investor_declaration_signed_at = new Date().toISOString();
    }
    if (requirePOF && proofFile && user?.id) {
      const ext = proofFile.name.split(".").pop() || "pdf";
      const path = `${user.id}/${listingId}/proof_${Date.now()}.${ext}`;
      updates.proof_of_funds_url = await uploadOpenHouseDoc(proofFile, path);
      if (proofAmount) updates.proof_amount = parseFloat(proofAmount);
    }
    setLoading(true);
    try {
      await updateReg.mutateAsync({ id: regId, updates });
      setStep("done");
      toast.success("Registration complete. Awaiting approval from asset manager.");
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("timeslot");
      setTimeslotIndex(null);
      setIdDocFile(null);
      setWaiverAccepted(false);
      setProofFile(null);
      setProofAmount("");
      setInvestorDeclared(false);
      setRegistrationId(null);
    }
  }, [open]);

  const stepOrder: Array<typeof step> = hasAssetControl
    ? ["timeslot", "id", "waiver", ...(requirePOF || requireInvestor ? ["qualified" as const] : []), "done"]
    : ["timeslot", "done"];
  const currentStepIdx = stepOrder.indexOf(step);
  const totalSteps = stepOrder.length - 1; // exclude done

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {step === "done" ? "Registration Submitted" : "Pre-register for Open House"}
          </DialogTitle>
        </DialogHeader>

        {step === "done" ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-600" />
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
            {currentStepIdx < totalSteps && totalSteps > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Step {currentStepIdx + 1} of {totalSteps}</span>
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((currentStepIdx + 1) / totalSteps) * 100}%` }} />
                </div>
              </div>
            )}
            {/* Step: Timeslot (or skip if none) */}
            {hasAssetControl && step === "timeslot" && (
              <>
                {timeslots.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Select a timeslot</p>
                    <div className="space-y-2">
                      {timeslots.map((ts, i) => (
                        <button
                          key={i}
                          onClick={() => setTimeslotIndex(i)}
                          className={`w-full p-3 rounded-xl border text-left text-sm ${
                            timeslotIndex === i ? "border-primary bg-primary/10" : "border-border"
                          }`}
                        >
                          {ts.start} – {ts.end} (max {ts.max_visitors} visitors)
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Button
                  className="w-full gap-2"
                  onClick={handleStartRegistration}
                  disabled={loading || (timeslots.length > 0 && timeslotIndex === null)}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                  {myReg ? "Continue" : "Register"}
                </Button>
              </>
            )}

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

            {step === "qualified" && (
              <>
                {requirePOF && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Proof of funds {requirePOF ? "(required)" : "(optional)"}</p>
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

            {!hasAssetControl && step === "timeslot" && (
              <Button className="w-full gap-2" onClick={handleStartRegistration} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                Register to attend
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
