/**
 * Dedicated Admin Dashboard. All admin features in one place.
 * Accessible only at /admin, protected by AdminRoute.
 */

import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Shield, Flame, Users, Wifi, SlidersHorizontal, ArrowLeft, DoorOpen, FolderKanban, Flag, MailPlus } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import AdminFiresalePipeline from "@/components/AdminFiresalePipeline";
import AdminInvestorScreening from "@/components/AdminInvestorScreening";
import AdminSubscribers from "@/components/AdminSubscribers";
import AdminPanel from "@/components/AdminPanel";
import { AdminPricingContent } from "@/pages/AdminPricing";
import OpenHouseDashboardSection from "@/components/OpenHouseDashboardSection";
import AdminReports from "@/components/AdminReports";
import AdminInvitationRequests from "@/components/AdminInvitationRequests";
import { useMyListings } from "@/hooks/useListings";
import { Button } from "@/components/ui/button";

type AdminTab = "pipeline" | "investor-screening" | "subscribers" | "pricing" | "os-sync" | "open-houses" | "reports";

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: myListings = [] } = useMyListings();
  const validTabs = ["pipeline", "investor-screening", "subscribers", "pricing", "os-sync", "open-houses", "reports", "invitations"];
  const tabParam = searchParams.get("tab") as AdminTab | null;
  const [activeTab, setActiveTab] = useState<AdminTab>(
    tabParam && validTabs.includes(tabParam) ? tabParam : "pipeline"
  );

  useEffect(() => {
    const t = searchParams.get("tab") as AdminTab | null;
    if (t && validTabs.includes(t)) {
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
    { key: "pricing", label: "Pricing", icon: SlidersHorizontal },
    { key: "os-sync", label: "OS Sync", icon: Wifi },
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
                  <p className="text-sm text-muted-foreground">Firesale pipeline, subscribers, OS sync</p>
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

          {activeTab === "pipeline" && <AdminFiresalePipeline />}
          {activeTab === "investor-screening" && <AdminInvestorScreening />}
          {activeTab === "open-houses" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <DoorOpen className="w-5 h-5 text-primary" /> Open House Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">All open house registrations, offers, and controls for your listings.</p>
              </div>
              <OpenHouseDashboardSection myListings={myListings} />
            </div>
          )}
          {activeTab === "subscribers" && <AdminSubscribers />}
          {activeTab === "pricing" && <AdminPricingContent embed />}
          {activeTab === "os-sync" && <AdminPanel />}
          {activeTab === "invitations" && <AdminInvitationRequests />}
          {activeTab === "reports" && <AdminReports />}
        </div>
      </div>
      <Footer />
    </div>
  );
}
