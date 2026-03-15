/**
 * Dedicated Admin Dashboard. All admin features in one place.
 * Accessible only at /admin, protected by AdminRoute.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Flame, Users, Wifi, Euro, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import AdminFiresalePipeline from "@/components/AdminFiresalePipeline";
import AdminSubscribers from "@/components/AdminSubscribers";
import AdminPanel from "@/components/AdminPanel";
import { Button } from "@/components/ui/button";

type AdminTab = "pipeline" | "subscribers" | "os-sync";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("pipeline");

  const tabs: { key: AdminTab; label: string; icon: React.ElementType }[] = [
    { key: "pipeline", label: "Pipeline", icon: Flame },
    { key: "subscribers", label: "Subscribers", icon: Users },
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
            <Link to="/admin/pricing">
              <Button variant="outline" size="sm" className="gap-2 border-primary/30">
                <Euro className="w-4 h-4" /> Pricing
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
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
          {activeTab === "subscribers" && <AdminSubscribers />}
          {activeTab === "os-sync" && <AdminPanel />}
        </div>
      </div>
      <Footer />
    </div>
  );
}
