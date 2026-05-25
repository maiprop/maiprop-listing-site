import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateAuctionAlert, useUpdateAuctionAlert, type AuctionAlert } from "@/hooks/useAuctionAlerts";
import { useTranslation } from "react-i18next";
import type { Database } from "@/integrations/supabase/types";

type AuctionAlertPropertyType = Database["public"]["Enums"]["property_type"];

const PROPERTY_TYPES: { value: "" | AuctionAlertPropertyType; label: string }[] = [
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function AuctionAlertModal({ open, onClose, editAlert }: Props) {
  const { i18n } = useTranslation();
  const isGreek = i18n?.language?.toLowerCase().startsWith("el") ?? false;
  const isEdit = !!editAlert;
  const [city, setCity] = useState(editAlert?.city ?? "");
  const [courtName, setCourtName] = useState(editAlert?.court_name ?? "");
  const [propertyType, setPropertyType] = useState<"" | AuctionAlertPropertyType>(editAlert?.property_type ?? "");
  const [minPrice, setMinPrice] = useState(editAlert?.min_price != null ? String(editAlert.min_price) : "");
  const [maxPrice, setMaxPrice] = useState(editAlert?.max_price != null ? String(editAlert.max_price) : "");
  const [emailNotify, setEmailNotify] = useState(editAlert?.email_notify ?? true);

  const create = useCreateAuctionAlert();
  const update = useUpdateAuctionAlert();
  const pending = create.isPending || update.isPending;
  const propertyTypes = PROPERTY_TYPES.map((type) => ({
    ...type,
    label: isGreek
      ? ({
          "All Types": "Όλοι οι τύποι",
          Apartment: "Διαμέρισμα",
          House: "Μονοκατοικία",
          Villa: "Βίλα",
          Land: "Οικόπεδο / Αγροτεμάχιο",
          Commercial: "Επαγγελματικό ακίνητο",
          Office: "Γραφείο",
        }[type.label] ?? type.label)
      : type.label,
  }));

  const handleSubmit = async () => {
    const payload = {
      city: city || null,
      court_name: courtName || null,
      property_type: propertyType || null,
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
            {isEdit ? (isGreek ? "Επεξεργασία ειδοποίησης πλειστηριασμού" : "Edit Auction Alert") : (isGreek ? "Νέα ειδοποίηση πλειστηριασμού" : "Create Auction Alert")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isGreek ? "Ρυθμίστε αποθηκευμένα φίλτρα πλειστηριασμών και ειδοποιήσεις email." : "Configure saved auction filters and email notifications."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* City */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">{isGreek ? "Πόλη" : "City"}</label>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">{isGreek ? "Όλες οι πόλεις" : "All Cities"}</option>
              {CITIES.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Auction officer / platform */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">{isGreek ? "Υπάλληλος πλειστηριασμού / Πλατφόρμα (προαιρετικά)" : "Auction Officer / Platform (optional)"}</label>
            <input
              value={courtName}
              onChange={e => setCourtName(e.target.value)}
              placeholder="e.g. Ειρηνοδικείο Αθηνών"
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>

          {/* Property type */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">{isGreek ? "Τύπος ακινήτου" : "Property Type"}</label>
            <select
              value={propertyType}
              onChange={e => setPropertyType(e.target.value as "" | AuctionAlertPropertyType)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {propertyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* First offer price range */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">{isGreek ? "Εύρος τιμής πρώτης προσφοράς (€)" : "First Offer Price Range (€)"}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                placeholder={isGreek ? "Ελάχ." : "Min"}
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
              <span className="text-muted-foreground text-xs shrink-0">–</span>
              <input
                type="number"
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                placeholder={isGreek ? "Μέγ." : "Max"}
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
            <span className="text-sm font-medium">{isGreek ? "Ειδοποιήσεις email" : "Email notifications"}</span>
          </label>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="border-border flex-1" onClick={onClose}>{isGreek ? "Άκυρο" : "Cancel"}</Button>
            <Button
              className="bg-gradient-gold border-0 text-background font-semibold flex-1"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEdit ? (isGreek ? "Αποθήκευση" : "Save Changes") : (isGreek ? "Δημιουργία" : "Create Alert")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
