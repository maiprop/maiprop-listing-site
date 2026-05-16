import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateAuctionAlert, useUpdateAuctionAlert, type AuctionAlert } from "@/hooks/useAuctionAlerts";

const PROPERTY_TYPES = [
  { value: "", label: "All Types" },
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "land", label: "Land" },
  { value: "commercial", label: "Commercial" },
  { value: "office", label: "Office" },
];

const CITIES = ["", "Αθήνα", "Θεσσαλονίκη", "Πειραιάς", "Πάτρα", "Ηράκλειο", "Λάρισα", "Βόλος"];

interface Props {
  open: boolean;
  onClose: () => void;
  editAlert?: AuctionAlert | null;
}

export function AuctionAlertModal({ open, onClose, editAlert }: Props) {
  const isEdit = !!editAlert;
  const [city, setCity] = useState(editAlert?.city ?? "");
  const [courtName, setCourtName] = useState(editAlert?.court_name ?? "");
  const [propertyType, setPropertyType] = useState<string>(editAlert?.property_type ?? "");
  const [minPrice, setMinPrice] = useState(editAlert?.min_price != null ? String(editAlert.min_price) : "");
  const [maxPrice, setMaxPrice] = useState(editAlert?.max_price != null ? String(editAlert.max_price) : "");
  const [emailNotify, setEmailNotify] = useState(editAlert?.email_notify ?? true);

  const create = useCreateAuctionAlert();
  const update = useUpdateAuctionAlert();
  const pending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    const payload = {
      city: city || null,
      court_name: courtName || null,
      property_type: (propertyType || null) as never,
      min_price: minPrice ? Number(minPrice) : null,
      max_price: maxPrice ? Number(maxPrice) : null,
      email_notify: emailNotify,
    };
    if (editAlert) {
      update.mutate({ id: editAlert.id, updates: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Bell className="w-4 h-4 text-brand-gold" />
            {isEdit ? "Edit Auction Alert" : "Create Auction Alert"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure saved auction filters and email notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* City */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">City</label>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">All Cities</option>
              {CITIES.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Court / Region */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Court / Region (optional)</label>
            <input
              value={courtName}
              onChange={e => setCourtName(e.target.value)}
              placeholder="e.g. Ειρηνοδικείο Αθηνών"
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>

          {/* Property type */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Property Type</label>
            <select
              value={propertyType}
              onChange={e => setPropertyType(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Price range */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Starting Bid Range (€)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder="Min"
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
              <span className="text-muted-foreground text-xs shrink-0">–</span>
              <input
                type="number"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder="Max"
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Email notify */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setEmailNotify(v => !v)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${emailNotify ? "bg-brand-gold" : "bg-secondary border border-border"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-background transition-transform ${emailNotify ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm font-medium">Email notifications</span>
          </label>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="border-border flex-1" onClick={onClose}>Cancel</Button>
            <Button
              className="bg-gradient-gold border-0 text-background font-semibold flex-1"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEdit ? "Save Changes" : "Create Alert"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
