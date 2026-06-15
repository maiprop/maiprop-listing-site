import { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryCache, mutationCache } from "@/lib/queryObserver";
import { DEFAULT_QUERY_GC_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { BrowserRouter, Routes, Route, useLocation, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { InvestorRoute } from "@/components/InvestorRoute";
import { SellerRoute } from "@/components/SellerRoute";
import { DeveloperRoute } from "@/components/DeveloperRoute";
import { NewBuildingRoute } from "@/components/NewBuildingRoute";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useAiTranslation } from "@/hooks/useAiTranslation";
const Index = lazy(() => import("./pages/Index"));
const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
const Listings = lazy(() => import("./pages/Listings"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Auctions = lazy(() => import("./pages/Auctions"));
const AuctionDetail = lazy(() => import("./pages/AuctionDetail"));
const Firesale = lazy(() => import("./pages/Firesale"));
const InvestorDashboard = lazy(() => import("./pages/InvestorDashboard"));
const Professionals = lazy(() => import("./pages/Professionals"));
const ProfessionalProfile = lazy(() => import("./pages/ProfessionalProfile"));
const ProfessionalProfileMe = lazy(() => import("./pages/ProfessionalProfileMe"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Messages = lazy(() => import("./pages/Messages"));
const CreateListing = lazy(() => import("./pages/CreateListing"));
const CreateNewBuildingListing = lazy(() => import("./pages/CreateNewBuildingListing"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Portfolios = lazy(() => import("./pages/Portfolios"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PlatformMap = lazy(() => import("./pages/PlatformMap"));
const AIAssistantPage = lazy(() => import("./pages/AIAssistantPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const BrandedVideoRoom = lazy(() => import("./pages/BrandedVideoRoom"));
const VideoViewingRoom = lazy(() => import("./pages/VideoViewingRoom"));
const NewBuildDetail = lazy(() => import("./pages/NewBuildDetail"));
const OpenHouses = lazy(() => import("./pages/OpenHouses"));
const OpenHouseDetail = lazy(() => import("./pages/OpenHouseDetail"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const DocumentTemplates = lazy(() => import("./pages/DocumentTemplates"));
const Contact = lazy(() => import("./pages/Contact"));
const CookieConsentBanner = lazy(() => import("@/components/CookieConsentBanner").then(m => ({ default: m.CookieConsentBanner })));

const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: USER_SCOPED_QUERY_STALE_TIME,
      gcTime: DEFAULT_QUERY_GC_TIME,
    },
  },
});

/** Triggers AI translation loading whenever the active locale changes */
function I18nLoader() {
  useAiTranslation();
  return null;
}

/**
 * Routes /auction/:id to the correct detail page:
 *   - UUID  → PropertyDetail  (DB-stored listing with full gallery / AI features)
 *   - other → AuctionDetail   (OS-synced auction, lean page)
 *
 * Keeping both at /auction/:id gives a single canonical URL for all auctions.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function AuctionRouter() {
  const { id = "" } = useParams<{ id: string }>();
  if (UUID_RE.test(id)) return <PropertyDetail />;
  return <AuctionDetail />;
}

// Routes that render their own embedded AI widget or have no need for the floating one
const HIDE_WIDGET_PREFIXES = [
  "/login", "/signup", "/auth/callback", "/onboarding", "/dashboard", "/messages", "/ai-assistant",
  "/property/", "/auction/", "/new-build/", "/video-room/", "/video-viewing/",
];
const GLOBAL_AI_WIDGET_IDLE_DELAY_MS = 1_200;
const GLOBAL_AI_WIDGET_IDLE_TIMEOUT_MS = 2_000;

type IdleScheduler = (callback: () => void, options?: { timeout?: number }) => number;
type IdleCanceller = (handle: number) => void;

function GlobalAIWidget() {
  const loc = useLocation();
  const hidden = HIDE_WIDGET_PREFIXES.some(p => loc.pathname.startsWith(p));
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    setShouldMount(false);
    if (hidden) return;

    const idleWindow = window as typeof window & {
      requestIdleCallback?: IdleScheduler;
      cancelIdleCallback?: IdleCanceller;
    };
    let idleId: number | null = null;
    const delayId = window.setTimeout(() => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(() => setShouldMount(true), {
          timeout: GLOBAL_AI_WIDGET_IDLE_TIMEOUT_MS,
        });
        return;
      }
      idleId = window.setTimeout(() => setShouldMount(true), 0);
    }, GLOBAL_AI_WIDGET_IDLE_DELAY_MS);

    return () => {
      window.clearTimeout(delayId);
      if (idleId === null) return;
      if (typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [hidden, loc.pathname]);

  if (hidden || !shouldMount) return null;
  return <AIAssistantWidget variant="floating" />;
}

const App = () => (
  <HelmetProvider>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <ScrollToTop />
                  <ErrorBoundary>
                  <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
                    <Routes>
                      <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
                      <Route path="/listings/new" element={<SellerRoute><ErrorBoundary><CreateListing /></ErrorBoundary></SellerRoute>} />
                      <Route path="/listings/new-building" element={<NewBuildingRoute><ErrorBoundary><CreateNewBuildingListing /></ErrorBoundary></NewBuildingRoute>} />
                      <Route path="/listings/:listingId/edit" element={<SellerRoute><ErrorBoundary><CreateListing /></ErrorBoundary></SellerRoute>} />
                      <Route path="/listings" element={<ErrorBoundary><Listings /></ErrorBoundary>} />
                      <Route path="/property/:id" element={<ErrorBoundary><PropertyDetail /></ErrorBoundary>} />
                      <Route path="/auction/:id" element={<ErrorBoundary><AuctionRouter /></ErrorBoundary>} />
                      <Route path="/auctions" element={<ErrorBoundary><Auctions /></ErrorBoundary>} />
                      <Route path="/firesale" element={<ErrorBoundary><Firesale /></ErrorBoundary>} />
                      <Route path="/investor-dashboard" element={<InvestorRoute><ErrorBoundary><InvestorDashboard /></ErrorBoundary></InvestorRoute>} />
                      <Route path="/professionals" element={<ErrorBoundary><Professionals /></ErrorBoundary>} />
                      <Route path="/professionals/me" element={<ProtectedRoute><ErrorBoundary><ProfessionalProfileMe /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/professionals/:id" element={<ErrorBoundary><ProfessionalProfile /></ErrorBoundary>} />
                      <Route path="/video-room/:professionalId" element={<ProtectedRoute><ErrorBoundary><BrandedVideoRoom /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/video-room/:professionalId/:consultationId" element={<ProtectedRoute><ErrorBoundary><BrandedVideoRoom /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/video-viewing/:viewingId" element={<ProtectedRoute><ErrorBoundary><VideoViewingRoom /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/new-build/:id" element={<ErrorBoundary><NewBuildDetail /></ErrorBoundary>} />
                      <Route path="/open-houses" element={<ErrorBoundary><OpenHouses /></ErrorBoundary>} />
                      <Route path="/open-house/:id" element={<ErrorBoundary><OpenHouseDetail /></ErrorBoundary>} />
                      <Route path="/signup" element={<ErrorBoundary><Signup /></ErrorBoundary>} />
                      <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
                      <Route path="/auth/callback" element={<ErrorBoundary><AuthCallback /></ErrorBoundary>} />
                      <Route path="/onboarding" element={<ErrorBoundary><Onboarding /></ErrorBoundary>} />
                      <Route path="/dashboard" element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/dashboard/:section" element={<ProtectedRoute><ErrorBoundary><Dashboard /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/messages" element={<ProtectedRoute><ErrorBoundary><Messages /></ErrorBoundary></ProtectedRoute>} />
                      <Route path="/privacy-policy" element={<ErrorBoundary><PrivacyPolicy /></ErrorBoundary>} />
                      <Route path="/terms-of-service" element={<ErrorBoundary><TermsOfService /></ErrorBoundary>} />
                      <Route path="/cookie-policy" element={<ErrorBoundary><CookiePolicy /></ErrorBoundary>} />
                      <Route path="/reset-password" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
                      <Route path="/projects" element={<DeveloperRoute><ErrorBoundary><Projects /></ErrorBoundary></DeveloperRoute>} />
                      <Route path="/projects/:id" element={<DeveloperRoute><ErrorBoundary><ProjectDetail /></ErrorBoundary></DeveloperRoute>} />
                      <Route path="/portfolios" element={<DeveloperRoute><ErrorBoundary><Portfolios /></ErrorBoundary></DeveloperRoute>} />
                      <Route path="/ai-assistant" element={<ErrorBoundary><AIAssistantPage /></ErrorBoundary>} />
                      <Route path="/pricing" element={<ErrorBoundary><Pricing /></ErrorBoundary>} />
                      <Route path="/admin" element={<AdminRoute><ErrorBoundary><AdminDashboard /></ErrorBoundary></AdminRoute>} />
                      <Route path="/platform-map" element={<AdminRoute><ErrorBoundary><PlatformMap /></ErrorBoundary></AdminRoute>} />
                      <Route path="/admin/pricing" element={<AdminRoute><Navigate to="/admin?tab=pricing" replace /></AdminRoute>} />
                      <Route path="/api-docs" element={<ErrorBoundary><ApiDocs /></ErrorBoundary>} />
                      <Route path="/document-templates" element={<ErrorBoundary><DocumentTemplates /></ErrorBoundary>} />
                      <Route path="/contact" element={<ErrorBoundary><Contact /></ErrorBoundary>} />
                      <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
                    </Routes>
                  </Suspense>
                  </ErrorBoundary>
                  <ErrorBoundary fallback={null}><I18nLoader /></ErrorBoundary>
                  <ErrorBoundary fallback={null}>
                    <Suspense fallback={null}><GlobalAIWidget /></Suspense>
                  </ErrorBoundary>
                  <ErrorBoundary fallback={null}><BottomNav /></ErrorBoundary>
                  <ErrorBoundary fallback={null}>
                    <Suspense fallback={null}><CookieConsentBanner /></Suspense>
                  </ErrorBoundary>
                </BrowserRouter>
              </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
