import { lazy, Suspense, useEffect, useState } from "react";
import { Sparkles, Briefcase, Lock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useSubscription } from "@/hooks/useSubscription";
import { Link, useSearchParams } from "react-router-dom";

// Lazy-import both widgets so neither 127 kB chunk is bundled into this
// page's chunk — they load in parallel when the user lands on this route.
const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
const ProAIToolsWidget = lazy(() => import("@/components/ProAIToolsWidget"));

type Tab = "general" | "pro";

export default function AIAssistantPage() {
  const { isPro } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl: Tab = searchParams.get("tab") === "pro" ? "pro" : "general";
  const [tab, setTab] = useState<Tab>(tabFromUrl);

  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "pro") nextParams.set("tab", "pro");
    else nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main id="main-content" className="pt-16 flex-1 flex flex-col pb-20 lg:pb-8">
        <div className="container max-w-2xl flex-1 flex flex-col py-4 px-4 gap-3">

          {/* Tab switcher */}
          <div className="flex gap-2">
            <button
              onClick={() => selectTab("general")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "general"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              mAI prop AI
            </button>
            <button
              onClick={() => selectTab("pro")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "pro"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              {isPro ? <Briefcase className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              Pro Tools
              {!isPro && (
                <span className="ml-1 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">PRO</span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden">
            {tab === "general" ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Sparkles className="w-5 h-5 animate-pulse text-primary" /></div>}>
                <AIAssistantWidget variant="embedded" />
              </Suspense>
            ) : isPro ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Sparkles className="w-5 h-5 animate-pulse text-primary" /></div>}>
                <ProAIToolsWidget />
              </Suspense>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold">Pro AI Tools</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Specialist AI assistants for agents, legal, design, trades, finance, and management — available on Pro.
                  </p>
                </div>
                <Link
                  to="/pricing"
                  className="px-5 py-2.5 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Upgrade to Pro
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
