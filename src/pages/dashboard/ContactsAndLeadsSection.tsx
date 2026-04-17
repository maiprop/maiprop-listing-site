import { useState } from "react";
import { Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import ContactsCRM from "@/components/ContactsCRM";
import LeadsCRM from "@/components/LeadsCRM";

export function ContactsAndLeadsSection({ initialTab = "contacts" }: { initialTab?: "contacts" | "leads" }) {
  const [tab, setTab] = useState<"contacts" | "leads">(initialTab);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          onClick={() => setTab("contacts")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
            tab === "contacts" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="w-4 h-4 inline mr-2" /> Contacts
        </button>
        <button
          onClick={() => setTab("leads")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors",
            tab === "leads" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <Briefcase className="w-4 h-4 inline mr-2" /> Leads
        </button>
      </div>
      {tab === "contacts" ? <ContactsCRM /> : <LeadsCRM />}
    </div>
  );
}
