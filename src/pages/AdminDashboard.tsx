/**
 * Dedicated Admin Dashboard. All admin features in one place.
 * Accessible only at /admin, protected by AdminRoute.
 */

import { lazy, Suspense, useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Shield, Flame, Users, Wifi, SlidersHorizontal, ArrowLeft, DoorOpen, FolderKanban, MailPlus, FileText, Star, BadgeCheck, Wallet, Inbox, Megaphone, Activity } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import type { ListingWithJoins } from "@/hooks/useListings";
import { Button } from "@/components/ui/button";

type AdminTab = "pipeline" | "investor-screening" | "subscribers" | "users-activity" | "pricing" | "os-sync" | "open-houses" | "reports" | "invitations" | "featured" | "pro-verification" | "pof-review" | "contact-inbox" | "broadcasts";

const VALID_TABS = ["pipeline", "investor-screening", "subscribers", "users-activity", "pricing", "os-sync", "open-houses", "reports", "invitations", "featured", "pro-verification", "pof-review", "contact-inbox", "broadcasts"];
const AdminFiresalePipeline = lazy(() => import("@/components/AdminFiresalePipeline"));
const AdminInvestorScreening = lazy(() => import("@/components/AdminInvestorScreening"));
const AdminSubscribers = lazy(() => import("@/components/AdminSubscribers"));
const AdminUserActivity = lazy(() => import("@/components/AdminUserActivity"));
const AdminPanel = lazy(() => import("@/components/AdminPanel"));
const AdminPricingContent = lazy(() => import("@/pages/AdminPricing").then((m) => ({ default: m.AdminPricingContent })));
const OpenHouseDashboardSection = lazy(() => import("@/components/OpenHouseDashboardSection"));
const AdminInvitationRequests = lazy(() => import("@/components/AdminInvitationRequests"));
const AdminFeaturedListings = lazy(() => import("@/components/AdminFeaturedListings"));
const AdminProfessionalVerification = lazy(() => import("@/components/AdminProfessionalVerification").then((m) => ({ default: m.AdminProfessionalVerification })));
const POFVerificationPanel = lazy(() => import("@/components/POFVerificationPanel").then((m) => ({ default: m.POFVerificationPanel })));
const AdminReports = lazy(() => import("@/components/AdminReports"));
const AdminContactSubmissions = lazy(() => import("@/components/AdminContactSubmissions"));
const AdminBroadcastNotifications = lazy(() => import("@/components/AdminBroadcastNotifications"));

function AdminTabFallback() {
  return (
    <div className="min-h-[560px] rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : "pipeline"
  );
  const { data: adminOpenHouseListings = [] } = useQuery({
    queryKey: ["admin-open-house-listings"],
    enabled: activeTab === "open-houses",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_management_catalogue")
        .select("id,title,listing_type,status,open_house_date,views_count,cover_image_url,price")
        .eq("listing_type", "open_house")
        .order("open_house_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ListingWithJoins[];
    },
  });

  useEffect(() => {
    const t = searchParams.get("tab") as AdminTab | null;
    if (t && VALID_TABS.includes(t)) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const setTab = (key: AdminTab) => {
    setActiveTab(key);
    navigate(`/admin?tab=${key}`, { replace: true });
  };

  const tabs: { key: AdminTab; label: string; icon: React.ElementType }[] = [
    { key: "pipeline", label: "Pipeline", icon: Flame },
    { key: "investor-screening", label: "Investor Screening", icon: FolderKanban },
    { key: "open-houses", label: "Open Houses", icon: DoorOpen },
    { key: "subscribers", label: "Subscribers", icon: Users },
    { key: "users-activity", label: "User Activity", icon: Activity },
    { key: "reports", label: "Reports", icon: FileText },
    { key: "contact-inbox", label: "Contact Inbox", icon: Inbox },
    { key: "invitations", label: "Invitations", icon: MailPlus },
    { key: "broadcasts", label: "Broadcasts", icon: Megaphone },
    { key: "pricing", label: "Pricing", icon: SlidersHorizontal },
    { key: "os-sync", label: "OS Sync", icon: Wifi },
    { key: "featured", label: "Listing Promotions", icon: Star },
    { key: "pro-verification", label: "Pro Verification", icon: BadgeCheck },
    { key: "pof-review", label: "POF Review", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4" /> Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                <div>
                  <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
                  <p className="text-sm text-muted-foreground">Listings, firesale, auctions, pricing, users, listing promotions & more</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[560px]">
          <Suspense fallback={<AdminTabFallback />}>
          {activeTab === "pipeline" && <AdminFiresalePipeline />}
          {activeTab === "investor-screening" && <AdminInvestorScreening />}
          {activeTab === "open-houses" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-primary" /> Open House Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">All open house registrations, offers, and controls across the platform.</p>
              </div>
              <OpenHouseDashboardSection myListings={adminOpenHouseListings} />
            </div>
          )}
          {activeTab === "subscribers" && <AdminSubscribers />}
          {activeTab === "users-activity" && <AdminUserActivity />}
          {activeTab === "pricing" && <AdminPricingContent embed />}
          {activeTab === "os-sync" && <AdminPanel />}
          {activeTab === "invitations" && <AdminInvitationRequests />}
          {activeTab === "reports" && <AdminReports />}
          {activeTab === "contact-inbox" && <AdminContactSubmissions />}
          {activeTab === "broadcasts" && <AdminBroadcastNotifications />}
          {activeTab === "featured" && <AdminFeaturedListings />}
          {activeTab === "pro-verification" && <AdminProfessionalVerification />}
          {activeTab === "pof-review" && <POFVerificationPanel />}
          </Suspense>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
