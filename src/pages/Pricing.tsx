import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Check, Zap, Users, Briefcase, UserCheck,
  BarChart2, Bell, Star, Shield, Filter, ArrowRight,
  Crown, Sparkles, Building2, Gavel, Home, Layers,
  MessageSquare, Eye, FileText, FolderKanban,
  Loader2, Database,
  Wallet, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPricingAudienceFromProfile, getParticipantTypeFromProfile, type PricingAudienceId } from "@/lib/participantConfig";
import { ROLE_PLAN_MAP } from "@/lib/rolePlanMap";
import { isPlatformAdmin } from "@/lib/authUtils";
import { usePricingConfigs } from "@/hooks/usePricingConfigs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// ── Audience config ────────────────────────────────────────────────────────────

type AudienceId = PricingAudienceId;

const AUDIENCE_TABS: { id: AudienceId; label: string; mobileLabel: string; icon: React.ElementType }[] = [
  { id: "participant",   label: "Buyer / Seller",       mobileLabel: "Buyer",  icon: Home },
  { id: "agent",         label: "Agent",                mobileLabel: "Agent",  icon: UserCheck },
  { id: "developer",     label: "Developer",            mobileLabel: "Dev",    icon: Layers },
  { id: "professional",  label: "Professional",         mobileLabel: "Pro",    icon: Briefcase },
  { id: "investor",      label: "Investor",             mobileLabel: "Invest", icon: Wallet },
  { id: "institutional", label: "Institutional",        mobileLabel: "Instit", icon: Building2 },
];

// ── Plan feature type ──────────────────────────────────────────────────────────
type PlanFeature = { label: string; free?: boolean | string; paid?: boolean | string; icon?: React.ElementType };

// ── Per-audience plan data ─────────────────────────────────────────────────────

const PARTICIPANT_FREE_LIST = [
  "Browse all listings & auction database",
  "View up to 60 auction listings",
  "Save 1 search + 1 alert",
  "Book 1 viewing per month",
  "List up to 2 of your own properties",
  "Browse Open Houses & RSVP (up to 3/month)",
  "Direct messaging",
  "Professional directory (up to 5 per category)",
];
const PARTICIPANT_PRO: PlanFeature[] = [
  { label: "AI Property Valuation",      icon: BarChart2,    free: "—",          paid: "5/month · €5 each extra" },
  { label: "Neighbourhood Reports",      icon: FileText,     free: "—",          paid: "3/month · €12 each extra" },
  { label: "AI Market Insights",         icon: Zap,          free: false,        paid: true },
  { label: "Full auction filters & 600 listings", icon: Filter, free: "60 max", paid: "600 max" },
  { label: "Unlimited saved searches & alerts", icon: Bell,  free: "1 each",    paid: "Unlimited" },
  { label: "Up to 10 viewings/month",    icon: MessageSquare,free: "1/month",   paid: "10/month" },
  { label: "Up to 5 listings (sell/rent)", icon: Layers,     free: "2 max",     paid: "5 max" },
  { label: "AI listing description",     icon: Sparkles,     free: false,        paid: true },
  { label: "Featured listing badge",     icon: Crown,        free: false,        paid: "1 included" },
  { label: "Listing performance analytics", icon: BarChart2, free: false,        paid: true },
  { label: "Priority matching",          icon: Star,         free: false,        paid: true },
  { label: "Full professionals directory", icon: Users,      free: "5 per cat.", paid: "Unlimited" },
];

const AGENT_FREE_LIST = [
  "Up to 5 active listings",
  "Basic messaging & viewings (3/month)",
  "View 60 auction listings",
  "Basic profile in Professionals directory",
  "maiProp branded video room",
];
const AGENT_PRO: PlanFeature[] = [
  { label: "Unlimited active listings",  icon: Layers,       free: "5 max",     paid: "Unlimited" },
  { label: "AI Listing Assistant",       icon: Sparkles,     free: false,        paid: true },
  { label: "Full CRM & lead management", icon: Users,        free: false,        paid: true },
  { label: "Listing performance analytics", icon: BarChart2, free: "—",         paid: "Per-listing" },
  { label: "Auction alerts (unlimited)", icon: Gavel,        free: "—",         paid: "Unlimited" },
  { label: "Private owner listing alerts", icon: Bell,       free: false,        paid: true },
  { label: "Priority ads",               icon: Star,         free: false,        paid: "10 included · €8 each extra" },
  { label: "Featured directory placement", icon: Crown,      free: "Basic",      paid: "Advanced" },
  { label: "Viewings (unlimited)",        icon: MessageSquare,free: "3/month",  paid: "Unlimited" },
  { label: "Open House full management", icon: Eye,          free: "—",         paid: "Full analytics & bidding" },
  { label: "AI Valuation & Reports",     icon: FileText,     free: false,        paid: "5 valuations/month included" },
];

const DEVELOPER_PRO: PlanFeature[] = [
  { label: "Unlimited project listings", icon: Layers,       free: false,        paid: true },
  { label: "New Build showcase pages",   icon: Building2,    free: false,        paid: true },
  { label: "Pre-sale & off-plan management", icon: Eye,      free: false,        paid: true },
  { label: "Construction timeline & floor plans", icon: FileText, free: false,  paid: true },
  { label: "Priority in New Builds section", icon: Star,     free: false,        paid: true },
  { label: "AI listing & description tools", icon: Sparkles, free: false,        paid: true },
  { label: "Project analytics dashboard", icon: BarChart2,   free: false,        paid: true },
  { label: "AI Neighbourhood Reports",   icon: Globe,        free: false,        paid: "3/month included" },
  { label: "Lead capture & CRM",         icon: Users,        free: false,        paid: true },
];

const PROFESSIONAL_FREE_LIST = [
  "Directory listing (basic)",
  "Receive basic enquiries",
  "Consultation request notifications",
  "Booking via profile page (manual confirm)",
];
const PROFESSIONAL_PRO: PlanFeature[] = [
  { label: "Priority placement in directory", icon: Star,    free: "Standard",  paid: "Top 3 in category" },
  { label: "AI client & service matching",    icon: Sparkles, free: false,      paid: true },
  { label: "Verified badge (expedited)",      icon: Shield,  free: "Pending",   paid: "48h" },
  { label: "Booking & availability calendar", icon: FolderKanban, free: false,  paid: true },
  { label: "Advanced lead analytics",         icon: BarChart2, free: false,     paid: true },
  { label: "Branded video consultation room", icon: Eye,     free: false,       paid: true },
  { label: "AI property tools (valuation, neighbourhood)", icon: BarChart2, free: false, paid: "3/month included" },
  { label: "Consultation messaging suite",    icon: MessageSquare, free: false, paid: true },
  { label: "CRM & client management",         icon: Users,   free: false,       paid: true },
];

const INVESTOR_FEATURES: PlanFeature[] = [
  { label: "Full deal-flow listings (off-market & distressed)", icon: Layers, free: false, paid: true },
  { label: "AI property matching & criteria alerts",            icon: Sparkles, free: false, paid: true },
  { label: "Market analytics & pricing intelligence",          icon: BarChart2, free: false, paid: true },
  { label: "Portfolio tracking dashboard",                     icon: FolderKanban, free: false, paid: true },
  { label: "Full auction database (600+ listings)",            icon: Gavel, free: "60 max", paid: "Unlimited" },
  { label: "AI Valuation & Neighbourhood Reports",             icon: FileText, free: false, paid: "5/month included" },
  { label: "Direct vendor & agent contact",                    icon: MessageSquare, free: false, paid: true },
  { label: "Due diligence pack download",                      icon: Shield, free: false, paid: true },
  { label: "Firesale & distressed asset access",               icon: Bell, free: false, paid: true },
];

const INSTITUTIONAL_FEATURES: PlanFeature[] = [
  { label: "Everything in Investor Plan",                      icon: Check, free: false, paid: true },
  { label: "Bulk deal pipeline & pipeline management",         icon: Database, free: false, paid: true },
  { label: "White-label API access (AVM + listings)",         icon: Globe, free: false, paid: true },
  { label: "Dedicated account manager",                        icon: UserCheck, free: false, paid: true },
  { label: "Custom data exports (CSV, JSON)",                  icon: FileText, free: false, paid: true },
  { label: "Multi-user / team seats",                          icon: Users, free: false, paid: true },
  { label: "Priority deal sourcing & exclusives",              icon: Star, free: false, paid: true },
  { label: "Bespoke market intelligence reports",              icon: BarChart2, free: false, paid: true },
];

// ── Pricing plan definitions ───────────────────────────────────────────────────
type PlanDef = {
  freeLabel: string; freePrice: string; freeDesc: string; freeCTA: string; freeHref: string;
  paidLabel: string;
  monthlyPrice: number; annualPrice: number;
  paidDesc: string; paidCTA: string; paidHref: string;
  features: PlanFeature[];
  freeList: string[];
  accent: string; accentBg: string; accentBorder: string;
  proOnly?: boolean;
  inviteOnly?: boolean;
};

const PRICING_EL: Record<string, string> = {
  "Buyer / Seller": "Αγοραστής / Πωλητής",
  Buyer: "Αγοραστής",
  Agent: "Μεσίτης",
  Developer: "Κατασκευαστής",
  Dev: "Κατασκ.",
  Professional: "Επαγγελματίας",
  Pro: "Pro",
  Investor: "Επενδυτής",
  Invest: "Επενδ.",
  Institutional: "Θεσμικός",
  Instit: "Θεσμ.",
  Pricing: "Τιμοκατάλογος",
  "Plans built for": "Πλάνα για",
  "every role in the market": "κάθε ρόλο της αγοράς",
  "Choose your role. Upgrade when you need more. Pay only for what you use.": "Επιλέξτε τον ρόλο σας. Αναβαθμίστε όταν χρειάζεστε περισσότερα. Πληρώνετε μόνο για ό,τι χρησιμοποιείτε.",
  Monthly: "Μηνιαία",
  Annual: "Ετήσια",
  "2 months FREE": "2 μήνες ΔΩΡΕΑΝ",
  Free: "Δωρεάν",
  "Current Plan": "Τρέχον πλάνο",
  "Your Current Plan": "Το τρέχον πλάνο σας",
  "Your Plan": "Το πλάνο σας",
  Recommended: "Προτεινόμενο",
  "Get Started Free": "Ξεκινήστε δωρεάν",
  "Get Started": "Ξεκινήστε",
  Redirecting: "Γίνεται ανακατεύθυνση",
  Opening: "Άνοιγμα",
  "Manage Subscription": "Διαχείριση συνδρομής",
  "Go to Investor Dashboard": "Μετάβαση στον επενδυτικό πίνακα",
  "Invitation only": "Μόνο με πρόσκληση",
  "Custom pricing": "Εξατομικευμένη τιμολόγηση",
  "Custom pricing · a payment link is sent after your application is approved.": "Εξατομικευμένη τιμολόγηση · ο σύνδεσμος πληρωμής αποστέλλεται μετά την έγκριση της αίτησής σας.",
  "Invitation-based access · Pricing by arrangement": "Πρόσβαση με πρόσκληση · τιμολόγηση κατόπιν συμφωνίας",
  "Cancel anytime · No setup fees": "Ακύρωση οποιαδήποτε στιγμή · χωρίς χρέωση εγκατάστασης",
  "Everything in Free, plus all Pro features": "Όλα του δωρεάν πλάνου, μαζί με όλες τις Pro λειτουργίες",
  "All prices are in EUR and exclude VAT where applicable.": "Όλες οι τιμές είναι σε EUR και δεν περιλαμβάνουν ΦΠΑ όπου εφαρμόζεται.",
  "Already a maiProp OS user?": "Χρησιμοποιείτε ήδη το maiProp OS;",
  "Get 20% off": "Κερδίστε έκπτωση 20%",
  "your maiProp plan.": "στο πλάνο σας στο maiProp.",
  "Active maiProp OS subscribers — Market Intelligence, AVM API, or Auction Intelligence — are eligible for a 20% discount on any maiProp subscription plan. Apply your OS licence key at checkout.": "Ενεργοί συνδρομητές maiProp OS — Market Intelligence, AVM API ή Auction Intelligence — δικαιούνται έκπτωση 20% σε οποιαδήποτε συνδρομή maiProp. Χρησιμοποιήστε το κλειδί άδειας OS στη διαδικασία πληρωμής.",
  discount: "έκπτωση",
  "Claim your discount": "Ζητήστε την έκπτωση",
  "Not on OS yet?": "Δεν χρησιμοποιείτε ακόμα OS;",
  "Talk to sales": "Μιλήστε με την ομάδα πωλήσεων",
  "Mock checkout completed. No live payment or subscription entitlement was created.": "Το δοκιμαστικό checkout ολοκληρώθηκε. Δεν δημιουργήθηκε πραγματική πληρωμή ή δικαίωμα συνδρομής.",
  "Payment successful! Your plan has been activated.": "Η πληρωμή ολοκληρώθηκε! Το πλάνο σας ενεργοποιήθηκε.",
  "Checkout cancelled — no charge was made.": "Το checkout ακυρώθηκε — δεν έγινε καμία χρέωση.",
  "Checkout failed": "Το checkout απέτυχε",
  "Could not start checkout": "Δεν ήταν δυνατή η έναρξη checkout",
  "Failed to open billing portal": "Δεν ήταν δυνατό το άνοιγμα της πύλης χρέωσης",
  "Search, browse & list your own property": "Αναζήτηση, περιήγηση και καταχώρηση δικών σας ακινήτων",
  "AI valuations, reports, pro auction filters & up to 5 listings": "AI εκτιμήσεις, αναφορές, Pro φίλτρα πλειστηριασμών και έως 5 αγγελίες",
  "Browse all listings & auction database": "Περιήγηση σε όλες τις αγγελίες και τη βάση πλειστηριασμών",
  "View up to 60 auction listings": "Προβολή έως 60 πλειστηριασμών",
  "Save 1 search + 1 alert": "Αποθήκευση 1 αναζήτησης + 1 ειδοποίησης",
  "Book 1 viewing per month": "Κράτηση 1 επίσκεψης τον μήνα",
  "List up to 2 of your own properties": "Καταχώρηση έως 2 δικών σας ακινήτων",
  "Browse Open Houses & RSVP (up to 3/month)": "Περιήγηση σε Open Houses και δηλώσεις συμμετοχής έως 3/μήνα",
  "Direct messaging": "Άμεσα μηνύματα",
  "Professional directory (up to 5 per category)": "Κατάλογος επαγγελματιών έως 5 ανά κατηγορία",
  "Pro Plan": "Pro πλάνο",
  "Get Pro Plan": "Απόκτηση Pro",
  "AI Property Valuation": "AI εκτίμηση ακινήτου",
  "Neighbourhood Reports": "Αναφορές περιοχής",
  "AI Market Insights": "AI ανάλυση αγοράς",
  "Full auction filters & 600 listings": "Πλήρη φίλτρα πλειστηριασμών και 600 καταχωρίσεις",
  "Unlimited saved searches & alerts": "Απεριόριστες αποθηκευμένες αναζητήσεις και ειδοποιήσεις",
  "Up to 10 viewings/month": "Έως 10 επισκέψεις/μήνα",
  "Up to 5 listings (sell/rent)": "Έως 5 αγγελίες για πώληση ή ενοικίαση",
  "AI listing description": "AI περιγραφή αγγελίας",
  "Featured listing badge": "Σήμανση προβεβλημένης αγγελίας",
  "Featured directory placement": "Προβεβλημένη θέση στον κατάλογο",
  "Listing performance analytics": "Αναλυτικά απόδοσης αγγελίας",
  "Priority matching": "Προτεραιότητα σε αντιστοιχίσεις",
  "Full professionals directory": "Πλήρης κατάλογος επαγγελματιών",
  "5/month · €5 each extra": "5/μήνα · €5 ανά επιπλέον",
  "3/month · €12 each extra": "3/μήνα · €12 ανά επιπλέον",
  "60 max": "έως 60",
  "600 max": "έως 600",
  "1 each": "1 από το καθένα",
  Unlimited: "Απεριόριστα",
  "1/month": "1/μήνα",
  "10/month": "10/μήνα",
  "2 max": "έως 2",
  "5 max": "έως 5",
  "1 included": "1 περιλαμβάνεται",
  "5 per cat.": "5 ανά κατηγορία",
  "Up to 5 listings & basic tools": "Έως 5 αγγελίες και βασικά εργαλεία",
  "Start Free": "Ξεκινήστε δωρεάν",
  "Agent Pro": "Pro μεσίτη",
  "Unlimited listings, full CRM, analytics, AI tools & 10 priority ads": "Απεριόριστες αγγελίες, πλήρες CRM, αναλυτικά, AI εργαλεία και 10 διαφημίσεις προτεραιότητας",
  "Get Agent Pro": "Απόκτηση Agent Pro",
  "Up to 5 active listings": "Έως 5 ενεργές αγγελίες",
  "Basic messaging & viewings (3/month)": "Βασικά μηνύματα και επισκέψεις έως 3/μήνα",
  "View 60 auction listings": "Προβολή 60 πλειστηριασμών",
  "Basic profile in Professionals directory": "Βασικό προφίλ στον κατάλογο επαγγελματιών",
  "maiProp branded video room": "Αίθουσα βίντεο με branding maiProp",
  "Unlimited active listings": "Απεριόριστες ενεργές αγγελίες",
  "AI Listing Assistant": "AI βοηθός αγγελίας",
  "Full CRM & lead management": "Πλήρες CRM και διαχείριση υποψήφιων πελατών",
  "Per-listing": "Ανά αγγελία",
  "Auction alerts (unlimited)": "Ειδοποιήσεις πλειστηριασμών απεριόριστες",
  "Private owner listing alerts": "Ειδοποιήσεις αγγελιών ιδιωτών",
  "Priority ads": "Διαφημίσεις προτεραιότητας",
  "10 included · €8 each extra": "10 περιλαμβάνονται · €8 ανά επιπλέον",
  Basic: "Βασικό",
  Advanced: "Προηγμένο",
  "Viewings (unlimited)": "Επισκέψεις απεριόριστες",
  "Open House full management": "Πλήρης διαχείριση Open House",
  "Full analytics & bidding": "Πλήρη αναλυτικά και προσφορές",
  "AI Valuation & Reports": "AI εκτίμηση και αναφορές",
  "5 valuations/month included": "5 εκτιμήσεις/μήνα περιλαμβάνονται",
  "Developer plan required": "Απαιτείται πλάνο κατασκευαστή",
  "Developer Pro": "Pro κατασκευαστή",
  "Unlimited projects, new build showcase, pre-sale management & priority placement": "Απεριόριστα έργα, προβολή νέων κατασκευών, διαχείριση προπώλησης και προτεραιότητα προβολής",
  "Get Developer Pro": "Απόκτηση Developer Pro",
  "Unlimited project listings": "Απεριόριστες αγγελίες έργων",
  "New Build showcase pages": "Σελίδες προβολής νέων κατασκευών",
  "Pre-sale & off-plan management": "Διαχείριση προπώλησης και off-plan",
  "Construction timeline & floor plans": "Χρονοδιάγραμμα κατασκευής και κατόψεις",
  "Priority in New Builds section": "Προτεραιότητα στην ενότητα Νέων Κατασκευών",
  "AI listing & description tools": "AI εργαλεία αγγελίας και περιγραφής",
  "Project analytics dashboard": "Πίνακας αναλυτικών έργου",
  "AI Neighbourhood Reports": "AI αναφορές περιοχής",
  "3/month included": "3/μήνα περιλαμβάνονται",
  "3/month": "3/μήνα",
  "Lead capture & CRM": "Συλλογή υποψήφιων πελατών και CRM",
  "Join the directory & receive basic enquiries": "Εγγραφή στον κατάλογο και λήψη βασικών αιτημάτων",
  "Directory listing (basic)": "Βασική καταχώρηση στον κατάλογο",
  "Receive basic enquiries": "Λήψη βασικών αιτημάτων",
  "Consultation request notifications": "Ειδοποιήσεις αιτημάτων συμβουλευτικής",
  "Booking via profile page (manual confirm)": "Κρατήσεις από τη σελίδα προφίλ με χειροκίνητη επιβεβαίωση",
  "Register Free": "Δωρεάν εγγραφή",
  "Professional Pro": "Pro επαγγελματία",
  "Priority leads, booking calendar, verified badge & AI tools": "Προτεραιότητα σε αιτήματα, ημερολόγιο κρατήσεων, επαληθευμένο σήμα και AI εργαλεία",
  "Priority placement in directory": "Προτεραιότητα προβολής στον κατάλογο",
  Standard: "Βασική προβολή",
  "Top 3 in category": "Στις πρώτες 3 θέσεις ανά κατηγορία",
  "AI client & service matching": "AI αντιστοίχιση πελατών και υπηρεσιών",
  "Verified badge (expedited)": "Επαληθευμένο σήμα με ταχεία εξέταση",
  Pending: "Σε αναμονή",
  "48h": "48 ώρες",
  "Booking & availability calendar": "Ημερολόγιο κρατήσεων και διαθεσιμότητας",
  "Advanced lead analytics": "Προηγμένα αναλυτικά υποψήφιων πελατών",
  "Branded video consultation room": "Επώνυμη αίθουσα βιντεοσυμβουλευτικής",
  "AI property tools (valuation, neighbourhood)": "AI εργαλεία ακινήτου για εκτίμηση και περιοχή",
  "Consultation messaging suite": "Σουίτα μηνυμάτων συμβουλευτικής",
  "CRM & client management": "CRM και διαχείριση πελατών",
  "Invitation-only": "Μόνο με πρόσκληση",
  "Investor Plan": "Πλάνο επενδυτή",
  "Deal-flow access, AI matching, market analytics & direct vendor contact": "Πρόσβαση σε ροή συμφωνιών, AI αντιστοίχιση, αναλύσεις αγοράς και άμεση επαφή με πωλητές",
  "Apply for Access": "Αίτηση πρόσβασης",
  "Full deal-flow listings (off-market & distressed)": "Πλήρεις καταχωρίσεις ροής συμφωνιών εκτός αγοράς και ευκαιριών",
  "AI property matching & criteria alerts": "AI αντιστοίχιση ακινήτων και ειδοποιήσεις κριτηρίων",
  "Market analytics & pricing intelligence": "Αναλύσεις αγοράς και πληροφόρηση τιμών",
  "Portfolio tracking dashboard": "Πίνακας παρακολούθησης χαρτοφυλακίου",
  "Full auction database (600+ listings)": "Πλήρης βάση πλειστηριασμών με 600+ καταχωρίσεις",
  "AI Valuation & Neighbourhood Reports": "AI εκτιμήσεις και αναφορές περιοχής",
  "5/month included": "5/μήνα περιλαμβάνονται",
  "Direct vendor & agent contact": "Άμεση επαφή με ιδιοκτήτες, πωλητές και μεσίτες",
  "Due diligence pack download": "Λήψη πακέτου νομικού και τεχνικού ελέγχου",
  "Firesale & distressed asset access": "Πρόσβαση σε Quick Sale και ακίνητα υπό πίεση",
  "Institutional Plan": "Θεσμικό πλάνο",
  "Full platform access, bulk pipeline, API, dedicated manager & multi-user seats": "Πλήρης πρόσβαση στην πλατφόρμα, μαζική διαχείριση ροής συμφωνιών, API, προσωπικός διαχειριστής λογαριασμού και πολλαπλές θέσεις ομάδας",
  "Talk to Sales": "Μιλήστε με πωλήσεις",
  "Everything in Investor Plan": "Όλα του πλάνου επενδυτή",
  "Bulk deal pipeline & pipeline management": "Μαζική ροή συμφωνιών και διαχείρισή της",
  "White-label API access (AVM + listings)": "White-label πρόσβαση API για AVM και αγγελίες",
  "Dedicated account manager": "Προσωπικός διαχειριστής λογαριασμού",
  "Custom data exports (CSV, JSON)": "Εξατομικευμένες εξαγωγές δεδομένων CSV, JSON",
  "Multi-user / team seats": "Πολλαπλοί χρήστες / θέσεις ομάδας",
  "Priority deal sourcing & exclusives": "Προτεραιότητα στον εντοπισμό συμφωνιών και αποκλειστικές ευκαιρίες",
  "Bespoke market intelligence reports": "Εξατομικευμένες αναφορές πληροφόρησης αγοράς",
};

const isGreekLocale = (language?: string) => language?.toLowerCase().startsWith("el") ?? false;

const PLANS: Record<AudienceId, PlanDef> = {
  participant: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Search, browse & list your own property", freeCTA: "Get Started Free", freeHref: "/signup",
    paidLabel: "Pro Plan", monthlyPrice: 29, annualPrice: 290,
    paidDesc: "AI valuations, reports, pro auction filters & up to 5 listings", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PARTICIPANT_FREE_LIST, features: PARTICIPANT_PRO,
    accent: "text-brand-gold", accentBg: "bg-brand-gold/10", accentBorder: "border-brand-gold/40",
  },
  agent: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Up to 5 listings & basic tools", freeCTA: "Start Free", freeHref: "/signup",
    paidLabel: "Agent Pro", monthlyPrice: 149, annualPrice: 1490,
    paidDesc: "Unlimited listings, full CRM, analytics, AI tools & 10 priority ads", paidCTA: "Get Agent Pro", paidHref: "/pricing",
    freeList: AGENT_FREE_LIST, features: AGENT_PRO,
    accent: "text-brand-purple", accentBg: "bg-brand-purple/10", accentBorder: "border-brand-purple/40",
  },
  developer: {
    freeLabel: "—", freePrice: "—", freeDesc: "Developer plan required", freeCTA: "—", freeHref: "#",
    paidLabel: "Developer Pro", monthlyPrice: 129, annualPrice: 1290,
    paidDesc: "Unlimited projects, new build showcase, pre-sale management & priority placement", paidCTA: "Get Developer Pro", paidHref: "/pricing",
    freeList: [], features: DEVELOPER_PRO,
    accent: "text-orange-600 dark:text-orange-400", accentBg: "bg-orange-500/10", accentBorder: "border-orange-500/40",
    proOnly: true,
  },
  professional: {
    freeLabel: "Free", freePrice: "€0", freeDesc: "Join the directory & receive basic enquiries", freeCTA: "Register Free", freeHref: "/signup",
    paidLabel: "Professional Pro", monthlyPrice: 69, annualPrice: 690,
    paidDesc: "Priority leads, booking calendar, verified badge & AI tools", paidCTA: "Get Pro Plan", paidHref: "/pricing",
    freeList: PROFESSIONAL_FREE_LIST, features: PROFESSIONAL_PRO,
    accent: "text-rose-600 dark:text-rose-400", accentBg: "bg-rose-500/10", accentBorder: "border-rose-500/40",
  },
  investor: {
    freeLabel: "—", freePrice: "—", freeDesc: "Invitation-only", freeCTA: "—", freeHref: "#",
    paidLabel: "Investor Plan", monthlyPrice: 0, annualPrice: 0,
    paidDesc: "Deal-flow access, AI matching, market analytics & direct vendor contact",
    paidCTA: "Apply for Access", paidHref: "/investor-dashboard",
    freeList: [], features: INVESTOR_FEATURES,
    accent: "text-emerald-700 dark:text-emerald-400", accentBg: "bg-emerald-500/10", accentBorder: "border-emerald-500/40",
    proOnly: true, inviteOnly: true,
  },
  institutional: {
    freeLabel: "—", freePrice: "—", freeDesc: "Invitation-only", freeCTA: "—", freeHref: "#",
    paidLabel: "Institutional Plan", monthlyPrice: 0, annualPrice: 0,
    paidDesc: "Full platform access, bulk pipeline, API, dedicated manager & multi-user seats",
    paidCTA: "Talk to Sales", paidHref: "/contact",
    freeList: [], features: INSTITUTIONAL_FEATURES,
    accent: "text-sky-700 dark:text-sky-400", accentBg: "bg-sky-500/10", accentBorder: "border-sky-500/40",
    proOnly: true, inviteOnly: true,
  },
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function Pricing() {
  const { user, profile, profileLoading } = useAuth();
  const { isPro, loading: subLoading, refreshSubscription } = useSubscription();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tr = (value: string) => (isGreekLocale(i18n.language) ? PRICING_EL[value] ?? value : value);

  // B2B / institutional data products: shown to institutional, developer, admin, or unauthenticated
  const participantType = getParticipantTypeFromProfile(profile);
  const showB2B =
    !user ||
    participantType === "institutional" ||
    participantType === "developer" ||
    isPlatformAdmin(profile);

  const [activeTab, setActiveTab] = useState<AudienceId>("participant");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const PLAN_KEYS: Record<AudienceId, string> = {
    participant:   ROLE_PLAN_MAP.participant.planKey,
    agent:         ROLE_PLAN_MAP.agent.planKey,
    developer:     ROLE_PLAN_MAP.developer.planKey,
    professional:  ROLE_PLAN_MAP.professional.planKey,
    investor:      ROLE_PLAN_MAP.investor.planKey,
    institutional: ROLE_PLAN_MAP.institutional.planKey,
  };

  const handleCheckout = async () => {
    if (!user) { navigate("/signup"); return; }
    if (PLANS[activeTab].inviteOnly) {
      navigate(activeTab === "institutional" ? "/contact" : "/investor-dashboard");
      return;
    }
    setCheckoutLoading(true);
    try {
      const planKey = PLAN_KEYS[activeTab];
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: planKey, billing_cycle: billingCycle },
      });
      if (error || !data?.url) throw new Error(error?.message ?? data?.error ?? tr("Checkout failed"));
      window.location.href = data.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr("Could not start checkout");
      toast.error(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", {});
      if (error || !data?.url) throw new Error(error?.message || tr("Failed to open billing portal"));
      window.open(data.url, "_blank");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr("Failed to open billing portal");
      toast.error(msg || tr("Failed to open billing portal"));
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout");
    if (checkoutStatus === "success") {
      if (searchParams.get("billing_mode") === "mock") {
        toast.info(tr("Mock checkout completed. No live payment or subscription entitlement was created."));
      } else {
        toast.success(tr("Payment successful! Your plan has been activated."));
      }
      refreshSubscription();
    } else if (checkoutStatus === "cancelled") {
      toast.info(tr("Checkout cancelled — no charge was made."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasAutoSelected) return;
    const audienceParam = searchParams.get("audience") as AudienceId | null;
    if (audienceParam && AUDIENCE_TABS.some(t => t.id === audienceParam)) {
      setActiveTab(audienceParam);
      setHasAutoSelected(true);
      return;
    }
    if (profile) {
      const pt = getPricingAudienceFromProfile(profile);
      const validTab = AUDIENCE_TABS.some(t => t.id === pt) ? pt : "participant";
      setActiveTab(validTab as AudienceId);
      setHasAutoSelected(true);
      return;
    }
    if (user && profileLoading) {
      return;
    }
    setHasAutoSelected(true);
  }, [profile, profileLoading, user, hasAutoSelected, searchParams]);

  const { data: pricingConfigs = {} } = usePricingConfigs();
  const planKey = PLAN_KEYS[activeTab];
  const config = pricingConfigs[planKey];
  const basePlan = PLANS[activeTab];

  // Prioritize database pricing values, fallback to hardcoded defaults
  const dbMonthlyPrice = config?.amount ?? basePlan.monthlyPrice;
  const dbAnnualPrice = config?.amount && config?.unit === 'monthly' 
    ? config.amount * 10  // Assume 2 months free for annual (10 months billed)
    : basePlan.annualPrice;

  // Resolve displayed price from billing cycle
  const displayMonthly = billingCycle === "monthly" ? dbMonthlyPrice : Math.round(dbAnnualPrice / 12);
  const displayTotal   = billingCycle === "annual"  ? dbAnnualPrice : dbMonthlyPrice;
  const annualSaving   = dbMonthlyPrice * 12 - dbAnnualPrice;

  const plan = config
    ? {
        ...basePlan,
        paidLabel: config.label,
        paidDesc: config.description || basePlan.paidDesc,
        monthlyPrice: dbMonthlyPrice,
        annualPrice: dbAnnualPrice,
      }
    : basePlan;

  const participant = getPricingAudienceFromProfile(profile);
  const hasAudiencePro = !subLoading && isPro && activeTab === participant;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="border-b border-border bg-card/60 py-12 sm:py-16">
          <div className="container max-w-5xl text-center px-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-5">
              <Zap className="w-3.5 h-3.5" /> {tr("Pricing")}
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black mb-3 leading-tight">
              {tr("Plans built for")}{" "}
              <span className="gradient-text-primary">{tr("every role in the market")}</span>
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8">
              {tr("Choose your role. Upgrade when you need more. Pay only for what you use.")}
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "text-sm font-medium transition-colors",
                  billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={billingCycle === "monthly"}
              >
                {tr("Monthly")}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={billingCycle === "annual"}
                aria-label={isGreekLocale(i18n.language) ? `Κύκλος χρέωσης: ${billingCycle === "annual" ? "ετήσια" : "μηνιαία"}` : `Billing cycle: ${billingCycle}`}
                onClick={() => setBillingCycle(c => c === "monthly" ? "annual" : "monthly")}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  billingCycle === "annual" ? "bg-primary border-primary" : "bg-secondary border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 pointer-events-none",
                  billingCycle === "annual" ? "translate-x-6" : "translate-x-0.5"
                )} />
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={cn(
                  "text-sm font-medium flex items-center gap-1.5 transition-colors",
                  billingCycle === "annual" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={billingCycle === "annual"}
              >
                {tr("Annual")}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">{tr("2 months FREE")}</span>
              </button>
            </div>

            {/* Audience tab strip */}
            <div className="flex justify-center overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
              <div className="inline-flex gap-1 bg-secondary/80 border border-border rounded-2xl p-1 min-w-max">
                {AUDIENCE_TABS.map(({ id, label, mobileLabel, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap",
                      activeTab === id
                        ? "bg-background border border-border shadow-card text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">{tr(label)}</span>
                    <span className="md:hidden">{tr(mobileLabel)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Plan cards ────────────────────────────────────────────────────── */}
        <div className="container max-w-5xl py-10 sm:py-16 px-4">
          <div className={cn(
            "grid gap-5 items-stretch mb-4",
            plan.proOnly ? "grid-cols-1 max-w-xl mx-auto" : "md:grid-cols-2"
          )}>

            {/* Free card */}
            {!plan.proOnly && (() => {
              const isCurrentFreePlan = !!user && !subLoading && !hasAudiencePro && activeTab === participant;
              return (
                <div className={cn("glass-card rounded-2xl overflow-hidden flex flex-col relative", isCurrentFreePlan ? "border-2 border-primary/40" : "border border-border")}>
                  {isCurrentFreePlan && (
                    <div className="absolute top-4 right-4">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-primary/10 border border-primary/30 text-primary">
                        <Check className="w-2.5 h-2.5" /> {tr("Current Plan")}
                      </span>
                    </div>
                  )}
                  <div className="px-6 sm:px-8 py-6 border-b border-border">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{tr(plan.freeLabel)}</p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="font-display text-4xl font-black text-foreground">{plan.freePrice}</span>
                      {plan.freePrice !== "€0" && <span className="text-muted-foreground text-sm">/ {isGreekLocale(i18n.language) ? "μήνα" : "month"}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{tr(plan.freeDesc)}</p>
                  </div>
                  <div className="p-6 sm:p-8 flex-1">
                    <ul className="space-y-3">
                      {plan.freeList.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-muted-foreground">{tr(f)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-6 sm:px-8 pb-6 sm:pb-8">
                    {isCurrentFreePlan ? (
                      <Button variant="outline" className="w-full h-11 border-primary/30 text-primary" disabled>
                        <Check className="w-4 h-4 mr-2" /> {tr("Your Current Plan")}
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full h-11 border-border" asChild>
                        <Link to={plan.freeHref}>{tr("Get Started Free")}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Paid card */}
            <div className={cn("relative glass-card rounded-2xl border-2 overflow-hidden flex flex-col shadow-elevated", plan.accentBorder)}>
              <div className="absolute top-4 right-4">
                {hasAudiencePro ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-500 text-white">
                    <Crown className="w-2.5 h-2.5" /> {tr("Your Plan")}
                  </span>
                ) : (
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border", plan.accentBg, plan.accentBorder, plan.accent)}>
                    <Sparkles className="w-2.5 h-2.5" /> {tr("Recommended")}
                  </span>
                )}
              </div>

              <div className={cn("px-6 sm:px-8 py-6 border-b border-border", plan.accentBg)}>
                <p className={cn("text-xs font-bold uppercase tracking-widest mb-2", plan.accent)}>{tr(plan.paidLabel)}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  {plan.inviteOnly ? (
                    <span className="font-display text-3xl font-black text-foreground">{tr("Invitation only")}</span>
                  ) : (
                    <>
                      <span className="font-display text-4xl font-black text-foreground">€{displayMonthly}</span>
                      <span className="text-muted-foreground text-sm">/ {isGreekLocale(i18n.language) ? "μήνα" : "month"}</span>
                    </>
                  )}
                </div>
                {!plan.inviteOnly && (billingCycle === "annual" ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                    {isGreekLocale(i18n.language) ? `€${displayTotal}/έτος · εξοικονόμηση €${annualSaving} έναντι μηνιαίας χρέωσης` : `€${displayTotal}/year · saves €${annualSaving} vs monthly`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isGreekLocale(i18n.language) ? "ή " : "or "}
                    <button onClick={() => setBillingCycle("annual")} className="underline hover:text-foreground">
                      {isGreekLocale(i18n.language)
                        ? `€${Math.round(basePlan.annualPrice / 12)}/μήνα με ετήσια χρέωση`
                        : `€${Math.round(basePlan.annualPrice / 12)}/mo billed annually`}
                    </button>
                    {" "}
                    {isGreekLocale(i18n.language) ? `(εξοικονόμηση €${annualSaving}/έτος)` : `(save €${annualSaving}/yr)`}
                  </p>
                ))}
                {plan.inviteOnly && (
                  <p className="text-xs text-muted-foreground">{tr("Custom pricing · a payment link is sent after your application is approved.")}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{tr(plan.paidDesc)}</p>
              </div>

              <div className="p-6 sm:p-8 flex-1">
                <ul className="space-y-3.5">
                  {plan.features.map((f) => {
                    const Icon = f.icon;
                    return (
                      <li key={f.label} className="flex items-start gap-3">
                        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", plan.accentBg)}>
                          {Icon ? <Icon className={cn("w-3 h-3", plan.accent)} /> : <Check className={cn("w-3 h-3", plan.accent)} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tr(f.label)}</p>
                          {typeof f.paid === "string" && f.paid !== "true" && (
                            <p className={cn("text-[11px] mt-0.5", plan.accent)}>{tr(f.paid)}</p>
                          )}
                          {typeof f.free === "string" && (
                            <p className="text-[11px] mt-0.5 text-muted-foreground line-through">{tr(f.free)}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {!plan.proOnly && (
                    <li className="flex items-center gap-2.5 text-sm text-muted-foreground border-t border-border pt-3 mt-1">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {tr("Everything in Free, plus all Pro features")}
                    </li>
                  )}
                </ul>
              </div>

              <div className="px-6 sm:px-8 pb-6 sm:pb-8 space-y-2">
                {hasAudiencePro && plan.inviteOnly ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 gap-2"
                    onClick={() => navigate("/investor-dashboard")}
                  >
                    <ArrowRight className="w-4 h-4" /> {tr("Go to Investor Dashboard")}
                  </Button>
                ) : hasAudiencePro ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                  >
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {portalLoading ? `${tr("Opening")}…` : tr("Manage Subscription")}
                  </Button>
                ) : (
                  <Button
                    className="w-full h-11 font-bold gap-2 bg-gradient-primary border-0 text-primary-foreground"
                    onClick={handleCheckout}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {user ? (checkoutLoading ? `${tr("Redirecting")}…` : tr(plan.paidCTA)) : tr("Get Started")}
                    {!checkoutLoading && <ArrowRight className="w-4 h-4" />}
                  </Button>
                )}
                {plan.inviteOnly ? (
                  <p className="text-[11px] text-muted-foreground text-center">
                    {tr("Invitation-based access · Pricing by arrangement")}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center">
                    {tr("Cancel anytime · No setup fees")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-10 max-w-xl mx-auto">
            {tr("All prices are in EUR and exclude VAT where applicable.")}
          </p>
        </div>

        {/* ── maiProp OS user discount banner ── */}
        {showB2B && <div className="border-t border-border py-10">
          <div className="container max-w-4xl px-4">
            <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
              {/* decorative blob */}
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

              <div className="flex-1 min-w-0 relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/25 text-primary text-[11px] font-bold uppercase tracking-widest mb-3">
                  <Database className="w-3 h-3" /> maiProp OS
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2 leading-snug">
                  {tr("Already a maiProp OS user?")}{" "}
                  <span className="text-primary">{tr("Get 20% off")}</span> {tr("your maiProp plan.")}
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  {tr("Active maiProp OS subscribers — Market Intelligence, AVM API, or Auction Intelligence — are eligible for a 20% discount on any maiProp subscription plan. Apply your OS licence key at checkout.")}
                </p>
              </div>

              <div className="shrink-0 flex flex-col items-center sm:items-end gap-3 relative">
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-center">
                  <p className="text-3xl font-black text-primary leading-none">20%</p>
                  <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 uppercase tracking-wide">{tr("discount")}</p>
                </div>
                <Link to="/contact">
                  <Button size="sm" className="gap-2 bg-gradient-primary border-0 text-primary-foreground">
                    <Wallet className="w-3.5 h-3.5" /> {tr("Claim your discount")}
                  </Button>
                </Link>
                <p className="text-[10px] text-muted-foreground text-center">
                  {tr("Not on OS yet?")}{" "}
                  <Link to="/contact" className="underline hover:text-foreground">{tr("Talk to sales")}</Link>
                </p>
              </div>
            </div>
          </div>
        </div>}

      </div>
      <Footer />
    </div>
  );
}
