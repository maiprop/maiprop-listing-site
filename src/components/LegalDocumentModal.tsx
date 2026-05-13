/**
 * LegalDocumentModal — Greek property legal document template library with mock e-sign.
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

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES: Template[] = [
  {
    id: "preliminary",
    titleEl: "Î ÏÎ¿ÏƒÏÎ¼Ï†Ï‰Î½Î¿ Î ÏŽÎ»Î·ÏƒÎ·Ï‚",
    titleEn: "Preliminary Purchase Agreement",
    tag: "Most common",
    description: "Binding pre-contract locking in price, terms, and completion timeline before the final notarial deed.",
  },
  {
    id: "final",
    titleEl: "ÎŸÏÎ¹ÏƒÏ„Î¹ÎºÏŒ Î£Ï…Î¼Ï†Ï‰Î½Î·Ï„Î¹ÎºÏŒ",
    titleEn: "Final Purchase Agreement",
    tag: "Notarial",
    description: "The definitive deed of sale executed before a Greek notary public, transferring legal title.",
  },
  {
    id: "rental",
    titleEl: "ÎœÎ¹ÏƒÎ¸Ï‰Ï„Î®ÏÎ¹Î¿ Î£Ï…Î¼Î²ÏŒÎ»Î±Î¹Î¿",
    titleEn: "Rental Contract",
    tag: "Residential",
    description: "Standard lease agreement compliant with Greek Law 1703/1987 and recent amendments.",
  },
  {
    id: "poa",
    titleEl: "Î Î»Î·ÏÎµÎ¾Î¿ÏÏƒÎ¹Î¿",
    titleEn: "Power of Attorney",
    tag: "Legal proxy",
    description: "Grants a representative authority to act on your behalf in property transactions.",
  },
  {
    id: "mou",
    titleEl: "ÎœÎ½Î·Î¼ÏŒÎ½Î¹Î¿ Î£Ï…Î¼Ï†Ï‰Î½Î¯Î±Ï‚",
    titleEn: "Quick Sale MOU",
    tag: "Fast-track",
    description: "Non-binding letter of intent for firesale or court auction acquisitions — agreed within 48 hours.",
  },
];

// ── Document body generator ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const getDocumentBody = (tpl: Template, seller: string, buyer: string, listing: string, price: number, date: string) => { // skipcq: JS-R1005 - Template-specific legal copy is intentionally centralized for review.
  const priceTxt = fmt(price);
  switch (tpl.id) {
    case "preliminary":
      return `
Î Î¡ÎŸÎ£Î¥ÎœÎ¦Î©ÎÎŸ Î Î©Î›Î—Î£Î—Î£ Î‘ÎšÎ™ÎÎ—Î¤ÎŸÎ¥
PRELIMINARY AGREEMENT FOR THE SALE OF REAL PROPERTY

Î£Ï„Î·Î½ Î‘Î¸Î®Î½Î±, ÏƒÎ®Î¼ÎµÏÎ± ${date}, Î¿Î¹ ÎºÎ¬Ï„Ï‰Î¸Î¹ ÏƒÏ…Î¼Î²Î±Î»Î»ÏŒÎ¼ÎµÎ½Î¿Î¹:

Î Î©Î›Î—Î¤Î—Î£ / SELLER: ${seller}
Î‘Î“ÎŸÎ¡Î‘Î£Î¤Î—Î£ / BUYER: ${buyer}

Î‘ÎÎ¤Î™ÎšÎ•Î™ÎœÎ•ÎÎŸ / SUBJECT PROPERTY:
${listing}

Î¤Î™ÎœÎ— Î Î©Î›Î—Î£Î—Î£ / SALE PRICE: ${priceTxt}
Î ÏÎ¿ÎºÎ±Ï„Î±Î²Î¿Î»Î® / Deposit (10%): ${fmt(price * 0.1)}

Î£Ï…Î¼Ï†Ï‰Î½Î¿ÏÎ½ Ï„Î± ÎµÎ¾Î®Ï‚ / Agree as follows:
1. ÎŸ Ï€Ï‰Î»Î·Ï„Î®Ï‚ Î´ÎµÏƒÎ¼ÎµÏÎµÏ„Î±Î¹ Î½Î± Î¼ÎµÏ„Î±Î²Î¹Î²Î¬ÏƒÎµÎ¹ Ï„Î¿ Î±ÎºÎ¯Î½Î·Ï„Î¿ ÎµÎ»ÎµÏÎ¸ÎµÏÎ¿ Î²Î±ÏÏŽÎ½.
   The seller undertakes to transfer the property free of encumbrances.

2. Î¤Î¿ Î¿ÏÎ¹ÏƒÏ„Î¹ÎºÏŒ ÏƒÏ…Î¼Î²ÏŒÎ»Î±Î¹Î¿ Î¸Î± Ï…Ï€Î¿Î³ÏÎ±Ï†ÎµÎ¯ ÎµÎ½Ï„ÏŒÏ‚ 60 Î·Î¼ÎµÏÏŽÎ½.
   The final deed shall be signed within 60 days.

3. Î£Îµ Ï€ÎµÏÎ¯Ï€Ï„Ï‰ÏƒÎ· Ï…Ï€Î±Î½Î±Ï‡ÏŽÏÎ·ÏƒÎ·Ï‚ Î±Î³Î¿ÏÎ±ÏƒÏ„Î®, Î· Ï€ÏÎ¿ÎºÎ±Ï„Î±Î²Î¿Î»Î® ÎºÎ±Ï„Î¬Ï€Ï„ÎµÎ¹.
   If the buyer withdraws, the deposit is forfeited.

4. Î£Îµ Ï€ÎµÏÎ¯Ï€Ï„Ï‰ÏƒÎ· Ï…Ï€Î±Î½Î±Ï‡ÏŽÏÎ·ÏƒÎ·Ï‚ Ï€Ï‰Î»Î·Ï„Î®, ÎµÏ€Î¹ÏƒÏ„ÏÎ­Ï†ÎµÎ¹ Î´Î¹Ï€Î»Î® Ï€ÏÎ¿ÎºÎ±Ï„Î±Î²Î¿Î»Î®.
   If the seller withdraws, double deposit is returned.
      `;
    case "final":
      return `
ÎŸÎ¡Î™Î£Î¤Î™ÎšÎŸ Î£Î¥ÎœÎ’ÎŸÎ›Î‘Î™ÎŸ Î Î©Î›Î—Î£Î—Î£
FINAL DEED OF SALE

Î•Î½ÏŽÏ€Î¹Î¿Î½ Ï„Î¿Ï…/Ï„Î·Ï‚ Î£Ï…Î¼Î²Î¿Î»Î±Î¹Î¿Î³ÏÎ¬Ï†Î¿Ï… Î‘Î¸Î·Î½ÏŽÎ½, ÏƒÎ®Î¼ÎµÏÎ± ${date}:

Î Î©Î›Î—Î¤Î—Î£ / SELLER: ${seller}
Î‘Î“ÎŸÎ¡Î‘Î£Î¤Î—Î£ / BUYER: ${buyer}

Î Î•Î¡Î™Î“Î¡Î‘Î¦Î— Î‘ÎšÎ™ÎÎ—Î¤ÎŸÎ¥ / PROPERTY DESCRIPTION:
${listing}

Î¤Î™ÎœÎ— Î Î©Î›Î—Î£Î—Î£ / SALE PRICE: ${priceTxt}

ÎŸ Ï€Ï‰Î»Î·Ï„Î®Ï‚ Î¼ÎµÏ„Î±Î²Î¹Î²Î¬Î¶ÎµÎ¹ ÏƒÏ„Î¿Î½ Î±Î³Î¿ÏÎ±ÏƒÏ„Î®, Î¿ Î¿Ï€Î¿Î¯Î¿Ï‚ Î±Ï€Î¿Î´Î­Ï‡ÎµÏ„Î±Î¹, Ï€Î»Î®ÏÎ· ÎºÏ…ÏÎ¹ÏŒÏ„Î·Ï„Î±, Î½Î¿Î¼Î® ÎºÎ±Î¹ ÎºÎ±Ï„Î¿Ï‡Î® ÎµÏ€Î¯ Ï„Î¿Ï… Î±Î½Ï‰Ï„Î­ÏÏ‰ Î±ÎºÎ¹Î½Î®Ï„Î¿Ï…, ÎµÎ»ÎµÏÎ¸ÎµÏÎ¿Ï… Ï€Î±Î½Ï„ÏŒÏ‚ Î²Î¬ÏÎ¿Ï…Ï‚, Î´ÎµÏƒÎ¼ÎµÏÏƒÎµÏ‰Ï‚, ÎµÎ¼Ï€ÏÎ¬Î³Î¼Î±Ï„Î¿Ï… Î´Î¹ÎºÎ±Î¹ÏŽÎ¼Î±Ï„Î¿Ï‚ Ï„ÏÎ¯Ï„Î¿Ï…, Ï…Ï€Î¿Î¸Î®ÎºÎ·Ï‚, Ï€ÏÎ¿ÏƒÎ·Î¼ÎµÎ¯Ï‰ÏƒÎ·Ï‚, ÎºÎ±Ï„Î¬ÏƒÏ‡ÎµÏƒÎ·Ï‚, Î´Î¹ÎµÎºÎ´Î¯ÎºÎ·ÏƒÎ·Ï‚ Î® Î¿Ï€Î¿Î¹Î¿Ï…Î´Î®Ï€Î¿Ï„Îµ Î¬Î»Î»Î¿Ï… Î´Î¹ÎºÎ±Î¹ÏŽÎ¼Î±Ï„Î¿Ï‚ Ï„ÏÎ¯Ï„Î¿Ï….

The seller transfers to the buyer full ownership, possession and occupation of the above property, free from all encumbrances, mortgages, attachments, third-party claims or any other rights of third parties.

Î¦ÎŸÎ¡ÎŸÎ£ ÎœÎ•Î¤Î‘Î’Î™Î’Î‘Î£Î—Î£ / TRANSFER TAX: ${fmt(price * 0.03)}
      `;
    case "rental":
      return `
ÎœÎ™Î£Î˜Î©Î¤Î—Î¡Î™ÎŸ Î£Î¥ÎœÎ’ÎŸÎ›Î‘Î™ÎŸ ÎšÎ‘Î¤ÎŸÎ™ÎšÎ™Î‘Î£
RESIDENTIAL LEASE AGREEMENT

ÎœÎµÏ„Î±Î¾Ï Ï„Ï‰Î½ / Between:

Î•ÎšÎœÎ™Î£Î˜Î©Î¤Î—Î£ / LANDLORD: ${seller}
ÎœÎ™Î£Î˜Î©Î¤Î—Î£ / TENANT: ${buyer}

ÎœÎ™Î£Î˜Î™ÎŸ / LEASED PROPERTY:
${listing}

ÎœÎ—ÎÎ™Î‘Î™ÎŸ ÎœÎ™Î£Î˜Î©ÎœÎ‘ / MONTHLY RENT: ${fmt(Math.round(price * 0.004))}
Î•Î“Î“Î¥Î—Î£Î— / SECURITY DEPOSIT: ${fmt(Math.round(price * 0.008))} (2 months)
Î”Î™Î‘Î¡ÎšÎ•Î™Î‘ / DURATION: 12 months from ${date}
Î‘ÎÎ‘ÎÎ•Î©Î£Î— / RENEWAL: Automatic unless 1 month notice given

ÎŸÎ¡ÎŸÎ™ / TERMS:
1. ÎŸ Î¼Î¹ÏƒÎ¸Ï‰Ï„Î®Ï‚ Î±Î½Î±Î»Î±Î¼Î²Î¬Î½ÎµÎ¹ Ï„Î· Î´Î¹Î±Ï„Î®ÏÎ·ÏƒÎ· Ï„Î·Ï‚ ÎºÎ±Ï„Î¿Î¹ÎºÎ¯Î±Ï‚ ÏƒÎµ ÎºÎ±Î»Î® ÎºÎ±Ï„Î¬ÏƒÏ„Î±ÏƒÎ·.
2. Î‘Ï€Î±Î³Î¿ÏÎµÏÎµÏ„Î±Î¹ Î· Ï…Ï€ÎµÎºÎ¼Î¯ÏƒÎ¸Ï‰ÏƒÎ· Ï‡Ï‰ÏÎ¯Ï‚ Î³ÏÎ±Ï€Ï„Î® ÏƒÏ…Î½Î±Î¯Î½ÎµÏƒÎ·.
3. Î¤Î¿ Î¼Î¯ÏƒÎ¸Ï‰Î¼Î± ÎºÎ±Ï„Î±Î²Î¬Î»Î»ÎµÏ„Î±Î¹ Ï„Î·Î½ 1Î· ÎºÎ¬Î¸Îµ Î¼Î®Î½Î±.
      `;
    case "poa":
      return `
Î Î›Î—Î¡Î•ÎžÎŸÎ¥Î£Î™ÎŸ
POWER OF ATTORNEY

Î•Î³ÏŽ, Î¿/Î· ${buyer}, Î´Î¹Î± Ï„Î¿Ï… Ï€Î±ÏÏŒÎ½Ï„Î¿Ï‚ Ï€Î±ÏÎ­Ï‡Ï‰ Ï€Î»Î·ÏÎµÎ¾Î¿Ï…ÏƒÎ¹ÏŒÏ„Î·Ï„Î± ÏƒÏ„Î¿Î½/ÏƒÏ„Î·Î½ ${seller}:

Î•ÎžÎŸÎ¥Î£Î™ÎŸÎ”ÎŸÎ¤Î—Î£Î— / AUTHORITY GRANTED:
• ÎÎ± ÎµÎºÏ€ÏÎ¿ÏƒÏ‰Ï€Î®ÏƒÎµÎ¹ Î¼Îµ ÎµÎ½ÏŽÏ€Î¹Î¿Î½ Ï€Î±Î½Ï„ÏŒÏ‚ Î£Ï…Î¼Î²Î¿Î»Î±Î¹Î¿Î³ÏÎ¬Ï†Î¿Ï….
  To represent me before any Notary Public.
• ÎÎ± Ï…Ï€Î¿Î³ÏÎ¬ÏˆÎµÎ¹ Î¿ÏÎ¹ÏƒÏ„Î¹ÎºÎ¬ ÏƒÏ…Î¼Î²ÏŒÎ»Î±Î¹Î± Î¼ÎµÏ„Î±Î²Î¯Î²Î±ÏƒÎ·Ï‚.
  To sign final deeds of transfer on my behalf.
• ÎÎ± ÎºÎ±Ï„Î±Î²Î¬Î»ÎµÎ¹ Ï„Ï…Ï‡ÏŒÎ½ Ï†ÏŒÏÎ¿Ï…Ï‚ ÎºÎ±Î¹ Ï„Î­Î»Î·.
  To pay applicable taxes and fees.

Î‘ÎšÎ™ÎÎ—Î¤ÎŸ / PROPERTY: ${listing}
Î‘ÎžÎ™Î‘ / VALUE UP TO: ${priceTxt}

Î™ÏƒÏ‡ÏÏ‚ / Valid until: 6 months from ${date}

Î•ÎºÎ´ÏŒÎ¸Î·ÎºÎµ ÏƒÏ„Î·Î½ Î‘Î¸Î®Î½Î± / Issued in Athens, ${date}
      `;
    case "mou":
      return `
ÎœÎÎ—ÎœÎŸÎÎ™ÎŸ Î£Î¥ÎœÎ¦Î©ÎÎ™Î‘Î£ — Î“Î¡Î—Î“ÎŸÎ¡Î— Î Î©Î›Î—Î£Î—
MEMORANDUM OF UNDERSTANDING — QUICK SALE

ÎœÎµÏ„Î±Î¾Ï / Between:
Î Î©Î›Î—Î¤Î—Î£ / SELLER: ${seller}
Î‘Î“ÎŸÎ¡Î‘Î£Î¤Î—Î£ / BUYER: ${buyer}

Î‘ÎšÎ™ÎÎ—Î¤ÎŸ / PROPERTY: ${listing}
Î•ÎÎ”Î•Î™ÎšÎ¤Î™ÎšÎ— Î¤Î™ÎœÎ— / INDICATIVE PRICE: ${priceTxt}

ÎŸÎ¡ÎŸÎ™ MOU / MOU TERMS:
1. NON-BINDING: This MOU does not constitute a legally binding contract.
   Î¤Î¿ Ï€Î±ÏÏŒÎ½ Î´ÎµÎ½ Î±Ï€Î¿Ï„ÎµÎ»ÎµÎ¯ Î´ÎµÏƒÎ¼ÎµÏ…Ï„Î¹ÎºÏŒ ÏƒÏ…Î¼Î²ÏŒÎ»Î±Î¹Î¿.

2. EXCLUSIVITY: Seller agrees to 72-hour exclusivity period.
   Î‘Ï€Î¿ÎºÎ»ÎµÎ¹ÏƒÏ„Î¹ÎºÏŒÏ„Î·Ï„Î± 72 Ï‰ÏÏŽÎ½ Ï…Ï€Î­Ï Î±Î³Î¿ÏÎ±ÏƒÏ„Î®.

3. DUE DILIGENCE: Buyer to complete by ${date}.
   ÎŸ Î­Î»ÎµÎ³Ï‡Î¿Ï‚ Ï„Î¯Ï„Î»Ï‰Î½ Î½Î± Î¿Î»Î¿ÎºÎ»Î·ÏÏ‰Î¸ÎµÎ¯ ÎµÎ½Ï„ÏŒÏ‚ 5 Î·Î¼ÎµÏÏŽÎ½.

4. GOOD FAITH: Both parties to negotiate in good faith.

Î—Î¼ÎµÏÎ¿Î¼Î·Î½Î¯Î± / Date: ${date}
      `;
  }
  return "";
};

// ── Canvas draw signature ────────────────────────────────────────────────────

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

// ── Main component ───────────────────────────────────────────────────────────

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
          {/* Left: template list */}
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

          {/* Right: document + sign */}
          <main className="flex-1 overflow-y-auto flex flex-col">
            {/* Mobile template selector */}
            <div className="md:hidden border-b border-border px-4 py-2 bg-muted/20">
              <select
                value={selected}
                onChange={(e) => { setSelected(e.target.value as TemplateId); resetSigned(); }}
                className="w-full text-sm bg-card border border-border rounded-lg px-3 py-2"
              >
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.titleEn}</option>)}
              </select>
            </div>

            {/* Document preview */}
            <div className="flex-1 p-5 md:p-6">
              <div className="max-w-2xl mx-auto">
                {/* Doc header */}
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

                {/* Doc body */}
                <div className="rounded-b-xl border border-border border-t border-dashed bg-card px-6 py-5">
                  <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">
                    {body}
                  </pre>

                  {/* Signature lines */}
                  <div className="mt-8 pt-6 border-t border-dashed border-border grid grid-cols-2 gap-8">
                    <div>
                      <div className="h-12 border-b border-foreground/30 flex items-end pb-1">
                        {signed && signMode === "type" && typedSig && (
                          <span className="text-lg text-primary" style={{ fontFamily: "cursive" }}>{typedSig}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Seller / Î Ï‰Î»Î·Ï„Î®Ï‚</p>
                      <p className="text-xs font-medium">{sellerName}</p>
                    </div>
                    <div>
                      <div className="h-12 border-b border-foreground/30 flex items-end pb-1">
                        {signed && (
                          <span className="text-xs text-brand-emerald flex items-center gap-1"><Check className="w-3 h-3" /> Signed</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Buyer / Î‘Î³Î¿ÏÎ±ÏƒÏ„Î®Ï‚</p>
                      <p className="text-xs font-medium">{buyerName}</p>
                    </div>
                  </div>

                  {/* E-sign section */}
                  {!signed ? (
                    <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <PenLine className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">Add your signature</p>
                      </div>

                      {/* Mode toggle */}
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
                      <Button size="sm" variant="outline" onClick={resetSigned}>Sign again</Button>
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
