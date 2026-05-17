/**
 * LegalDocumentModal - Greek property legal document template library with mock e-sign.
 * Left panel: template list. Right panel: document preview + signature capture.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText,
  PenLine,
  Download,
  Share2,
  Check,
  X,
  Eraser,
  ChevronRight,
  Mail,
  Loader2,
  Stamp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Types

interface Props {
  open: boolean;
  onClose: () => void;
  listingTitle?: string;
  sellerName?: string;
  buyerName?: string;
  price?: number;
}

type TemplateId = "preliminary" | "final" | "rental" | "poa" | "mou";
type SignMode = "type" | "draw";

interface Template {
  id: TemplateId;
  titleEl: string;
  titleEn: string;
  tag: string;
  description: string;
}

// Templates

const TEMPLATES: Template[] = [
  {
    id: "preliminary",
    titleEl: "Προσύμφωνο Πώλησης",
    titleEn: "Preliminary Purchase Agreement",
    tag: "Most common",
    description: "Binding pre-contract locking in price, terms, and completion timeline before the final notarial deed.",
  },
  {
    id: "final",
    titleEl: "Οριστικό Συμφωνητικό",
    titleEn: "Final Purchase Agreement",
    tag: "Notarial",
    description: "The definitive deed of sale executed before a Greek notary public, transferring legal title.",
  },
  {
    id: "rental",
    titleEl: "Μισθωτήριο Συμβόλαιο",
    titleEn: "Rental Contract",
    tag: "Residential",
    description: "Standard lease agreement compliant with Greek Law 1703/1987 and recent amendments.",
  },
  {
    id: "poa",
    titleEl: "Πληρεξούσιο",
    titleEn: "Power of Attorney",
    tag: "Legal proxy",
    description: "Grants a representative authority to act on your behalf in property transactions.",
  },
  {
    id: "mou",
    titleEl: "Μνημόνιο Συμφωνίας",
    titleEn: "Quick Sale MOU",
    tag: "Fast-track",
    description: "Non-binding letter of intent for fast-sale or court auction acquisitions, agreed within 48 hours.",
  },
];

// Document body generator

const fmt = (n: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const getDocumentBody = (tpl: Template, seller: string, buyer: string, listing: string, price: number, date: string) => { // skipcq: JS-R1005 - Template-specific legal copy is intentionally centralized for review.
  const priceTxt = fmt(price);
  switch (tpl.id) {
    case "preliminary":
      return `
ΠΡΟΣΥΜΦΩΝΟ ΠΩΛΗΣΗΣ
PRELIMINARY AGREEMENT FOR THE SALE OF REAL PROPERTY

Στην Αθήνα, σήμερα ${date}, οι κάτωθι συμβαλλόμενοι:

ΠΩΛΗΤΗΣ / SELLER: ${seller}
ΑΓΟΡΑΣΤΗΣ / BUYER: ${buyer}

ΑΝΤΙΚΕΙΜΕΝΟ / SUBJECT PROPERTY:
${listing}

ΤΙΜΗ ΠΩΛΗΣΗΣ / SALE PRICE: ${priceTxt}
Προκαταβολή / Deposit (10%): ${fmt(price * 0.1)}

Συμφωνούν τα εξής / Agree as follows:
1. Ο πωλητής δεσμεύεται να μεταβιβάσει το ακίνητο ελεύθερο βαρών.
   The seller undertakes to transfer the property free of encumbrances.

2. Το οριστικό συμβόλαιο θα υπογραφεί εντός 60 ημερών.
   The final deed shall be signed within 60 days.

3. Σε περίπτωση υπαναχώρησης αγοραστή, η προκαταβολή καταπίπτει.
   If the buyer withdraws, the deposit is forfeited.

4. Σε περίπτωση υπαναχώρησης πωλητή, επιστρέφεται διπλή προκαταβολή.
   If the seller withdraws, double deposit is returned.
      `;
    case "final":
      return `
ΟΡΙΣΤΙΚΟ ΣΥΜΦΩΝΗΤΙΚΟ ΠΩΛΗΣΗΣ
FINAL DEED OF SALE

Ενώπιον του/της Συμβολαιογράφου Αθηνών, σήμερα ${date}:

ΠΩΛΗΤΗΣ / SELLER: ${seller}
ΑΓΟΡΑΣΤΗΣ / BUYER: ${buyer}

ΠΕΡΙΓΡΑΦΗ ΑΚΙΝΗΤΟΥ / PROPERTY DESCRIPTION:
${listing}

ΤΙΜΗ ΠΩΛΗΣΗΣ / SALE PRICE: ${priceTxt}

Ο πωλητής μεταβιβάζει στον αγοραστή πλήρη κυριότητα, νομή και κατοχή του ανωτέρω ακινήτου, ελεύθερου από βάρη, υποθήκες, προσημειώσεις, κατασχέσεις ή αξιώσεις τρίτων.

The seller transfers to the buyer full ownership, possession, and occupation of the above property, free from encumbrances, mortgages, attachments, third-party claims, or any other third-party rights.

ΦΟΡΟΣ ΜΕΤΑΒΙΒΑΣΗΣ / TRANSFER TAX: ${fmt(price * 0.03)}
      `;
    case "rental":
      return `
ΜΙΣΘΩΤΗΡΙΟ ΣΥΜΒΟΛΑΙΟ ΚΑΤΟΙΚΙΑΣ
RESIDENTIAL LEASE AGREEMENT

Μεταξύ των / Between:

ΕΚΜΙΣΘΩΤΗΣ / LANDLORD: ${seller}
ΜΙΣΘΩΤΗΣ / TENANT: ${buyer}

ΜΙΣΘΙΟ / LEASED PROPERTY:
${listing}

ΜΗΝΙΑΙΟ ΜΙΣΘΩΜΑ / MONTHLY RENT: ${fmt(Math.round(price * 0.004))}
ΕΓΓΥΗΣΗ / SECURITY DEPOSIT: ${fmt(Math.round(price * 0.008))} (2 months)
ΔΙΑΡΚΕΙΑ / DURATION: 12 months from ${date}
ΑΝΑΝΕΩΣΗ / RENEWAL: Automatic unless 1 month notice is given

ΟΡΟΙ / TERMS:
1. Ο μισθωτής αναλαμβάνει τη διατήρηση της κατοικίας σε καλή κατάσταση.
2. Απαγορεύεται η υπεκμίσθωση χωρίς γραπτή συναίνεση.
3. Το μίσθωμα καταβάλλεται την 1η κάθε μήνα.
      `;
    case "poa":
      return `
ΠΛΗΡΕΞΟΥΣΙΟ
POWER OF ATTORNEY

Εγώ, ο/η ${buyer}, δια του παρόντος παρέχω πληρεξουσιότητα στον/στην ${seller}:

ΕΞΟΥΣΙΟΔΟΤΗΣΗ / AUTHORITY GRANTED:
• Να εκπροσωπήσει εμένα ενώπιον παντός Συμβολαιογράφου.
  To represent me before any Notary Public.
• Να υπογράψει οριστικά συμβόλαια μεταβίβασης.
  To sign final deeds of transfer on my behalf.
• Να καταβάλει τυχόν φόρους και τέλη.
  To pay applicable taxes and fees.

ΑΚΙΝΗΤΟ / PROPERTY: ${listing}
ΑΞΙΑ / VALUE UP TO: ${priceTxt}

Ισχύς / Valid until: 6 months from ${date}

Εκδόθηκε στην Αθήνα / Issued in Athens, ${date}
      `;
    case "mou":
      return `
ΜΝΗΜΟΝΙΟ ΣΥΜΦΩΝΙΑΣ - ΓΡΗΓΟΡΗ ΠΩΛΗΣΗ
MEMORANDUM OF UNDERSTANDING - QUICK SALE

Μεταξύ / Between:
ΠΩΛΗΤΗΣ / SELLER: ${seller}
ΑΓΟΡΑΣΤΗΣ / BUYER: ${buyer}

ΑΚΙΝΗΤΟ / PROPERTY: ${listing}
ΕΝΔΕΙΚΤΙΚΗ ΤΙΜΗ / INDICATIVE PRICE: ${priceTxt}

ΟΡΟΙ MOU / MOU TERMS:
1. NON-BINDING: This MOU does not constitute a legally binding contract.
   Το παρόν δεν αποτελεί δεσμευτικό συμβόλαιο.

2. EXCLUSIVITY: Seller agrees to a 72-hour exclusivity period.
   Αποκλειστικότητα 72 ωρών υπέρ αγοραστή.

3. DUE DILIGENCE: Buyer to complete by ${date}.
   Ο έλεγχος τίτλων να ολοκληρωθεί εντός 5 ημερών.

4. GOOD FAITH: Both parties will negotiate in good faith.

Ημερομηνία / Date: ${date}
      `;
  }
  return "";
};

// Canvas draw signature

const SignatureCanvas = ({ onSign }: { onSign: (dataUrl: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const exportSignature = useCallback((canvas: HTMLCanvasElement) => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          onSign(reader.result);
        }
      });
      reader.readAsDataURL(blob);
    });
  }, [onSign]);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const drawingCanvas = canvas;
    const drawingContext = ctx;
    drawingContext.strokeStyle = "hsl(var(--foreground))";
    drawingContext.lineWidth = 2;
    drawingContext.lineCap = "round";

    function start(e: MouseEvent | TouchEvent) {
      drawing.current = true;
      lastPos.current = getPos(e, drawingCanvas);
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current || !lastPos.current) return;
      e.preventDefault();
      const pos = getPos(e, drawingCanvas);
      drawingContext.beginPath();
      drawingContext.moveTo(lastPos.current.x, lastPos.current.y);
      drawingContext.lineTo(pos.x, pos.y);
      drawingContext.stroke();
      lastPos.current = pos;
    }
    function stop() {
      if (!drawing.current) return;
      drawing.current = false;
      exportSignature(drawingCanvas);
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", stop);
    };
  }, [exportSignature]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSign("");
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={480}
        height={120}
        className="w-full h-28 border-2 border-dashed border-border rounded-lg bg-muted/20 cursor-crosshair touch-none"
      />
      <button
        onClick={clear}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <Eraser className="w-3.5 h-3.5" />
      </button>
      <p className="text-xs text-muted-foreground text-center mt-1">Draw your signature above</p>
    </div>
  );
};

// Main component

export const LegalDocumentModal = ({ open, onClose, listingTitle = "Property", sellerName = "Seller Name", buyerName = "Buyer Name", price = 250000 }: Props) => { // skipcq: JS-R1005 - This modal coordinates several small UI states around one document preview.
  const [selected, setSelected] = useState<TemplateId>("preliminary");
  const [signMode, setSignMode] = useState<SignMode>("type");
  const [typedSig, setTypedSig] = useState("");
  const [drawnSig, setDrawnSig] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const tpl = TEMPLATES.find((t) => t.id === selected) ?? TEMPLATES[0];
  const body = getDocumentBody(tpl, sellerName, buyerName, listingTitle, price, today);
  const hasSig = signMode === "type" ? typedSig.trim().length > 2 : drawnSig.length > 100;

  async function handleSign() {
    if (!hasSig) { toast.error("Please add your signature first."); return; }
    setSigning(true);
    try {
      const sig = signMode === "type" ? `\nSigned by: ${typedSig}` : "\n[Handwritten signature on file]";
      const content = `${body}${sig}\n\nDate: ${today}\n`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tpl.id}-signed-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setSigned(true);
      toast.success("Document signed and downloaded.");
    } finally {
      setSigning(false);
    }
  }

  async function handleShare() {
    if (!shareEmail.includes("@")) { toast.error("Enter a valid email address."); return; }
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        type: "document_share",
        email: shareEmail,
        document_type: tpl.id,
        listing_title: listingTitle,
        share_to_email: shareEmail,
        message: `Document share request: ${tpl.titleEn} for ${listingTitle}`,
      });
      if (error) throw error;
      toast.success(`Share request sent to ${shareEmail}`);
    } catch (_err: unknown) {
      toast.error("Failed to send. Please try again.");
      return;
    }
    setShareEmail("");
    setShowShare(false);
  }

  function resetSigned() { setSigned(false); setTypedSig(""); setDrawnSig(""); }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stamp className="w-4 h-4 text-primary" />
            Legal Document Library
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select a legal document template, preview it, and add a signature.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 shrink-0 border-r border-border overflow-y-auto bg-muted/20 p-3 space-y-1.5 hidden md:block">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelected(t.id); resetSigned(); }}
                className={`w-full text-left rounded-xl px-3 py-3 transition-colors group ${
                  selected === t.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${selected === t.id ? "text-primary" : "text-muted-foreground"}`} />
                  <ChevronRight className={`w-3.5 h-3.5 mt-0.5 transition-opacity ${selected === t.id ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-60"}`} />
                </div>
                <p className={`text-sm font-semibold mt-1.5 ${selected === t.id ? "text-primary" : "text-foreground"}`}>{t.titleEn}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.titleEl}</p>
                <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold border border-brand-gold/20 font-medium">
                  {t.tag}
                </span>
              </button>
            ))}
          </aside>

          <main className="flex-1 overflow-y-auto flex flex-col">
            <div className="md:hidden border-b border-border px-4 py-2 bg-muted/20">
              <select
                value={selected}
                onChange={(e) => { setSelected(e.target.value as TemplateId); resetSigned(); }}
                className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2"
              >
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.titleEn}</option>)}
              </select>
            </div>

            <div className="flex-1 p-5 md:p-6">
              <div className="max-w-2xl mx-auto">
                <div className="rounded-t-xl border border-border bg-card px-6 py-4 border-b-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-bold text-foreground text-lg">{tpl.titleEl}</h2>
                      <p className="text-sm text-muted-foreground">{tpl.titleEn}</p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
                      {tpl.tag}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{tpl.description}</p>
                </div>

                <div className="rounded-b-xl border border-border border-t border-dashed bg-card px-6 py-5">
                  <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">
                    {body}
                  </pre>

                  <div className="mt-8 pt-6 border-t border-dashed border-border grid grid-cols-2 gap-8">
                    <div>
                      <div className="h-12 border-b border-foreground/30 flex items-end pb-1">
                        {signed && signMode === "type" && typedSig && (
                          <span className="text-lg text-primary" style={{ fontFamily: "cursive" }}>{typedSig}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Seller / Πωλητής</p>
                      <p className="text-xs font-medium">{sellerName}</p>
                    </div>
                    <div>
                      <div className="h-12 border-b border-foreground/30 flex items-end pb-1">
                        {signed && (
                          <span className="text-xs text-brand-emerald flex items-center gap-1"><Check className="w-3 h-3" /> Signed</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Buyer / Αγοραστής</p>
                      <p className="text-xs font-medium">{buyerName}</p>
                    </div>
                  </div>

                  {!signed ? (
                    <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <PenLine className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Add your signature</p>
                      </div>

                      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                        {(["type", "draw"] as SignMode[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setSignMode(m)}
                            className={`px-4 py-1.5 text-sm transition-colors capitalize ${
                              signMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {m === "type" ? "Type name" : "Draw"}
                          </button>
                        ))}
                      </div>

                      {signMode === "type" ? (
                        <div>
                          <input
                            type="text"
                            placeholder="Type your full name..."
                            value={typedSig}
                            onChange={(e) => setTypedSig(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          {typedSig && (
                            <p className="mt-2 text-2xl text-primary" style={{ fontFamily: "cursive" }}>{typedSig}</p>
                          )}
                        </div>
                      ) : (
                        <SignatureCanvas onSign={setDrawnSig} />
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSign} disabled={!hasSig || signing} className="gap-2">
                          {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {signing ? "Signing..." : "Sign & Download PDF"}
                        </Button>
                        <Button variant="outline" onClick={() => setShowShare(!showShare)} className="gap-2">
                          <Share2 className="w-4 h-4" />
                          Share with other party
                        </Button>
                      </div>

                      {showShare && (
                        <div className="flex gap-2">
                          <div className="flex items-center gap-2 flex-1 bg-card border border-border rounded-lg px-3 py-2">
                            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                            <input
                              type="email"
                              placeholder="other.party@email.com"
                              value={shareEmail}
                              onChange={(e) => setShareEmail(e.target.value)}
                              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                          </div>
                          <Button size="sm" onClick={handleShare}>Send</Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowShare(false)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-xl border border-brand-emerald/20 bg-brand-emerald/5 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-emerald/15 flex items-center justify-center">
                          <Check className="w-4 h-4 text-brand-emerald" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Document signed successfully</p>
                          <p className="text-xs text-muted-foreground">Your download is being prepared.</p>
                        </div>
                      </div>
                      <Button variant="ghost" onClick={resetSigned} className="text-sm">
                        Sign another
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};
