import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { InvestorRoute } from "@/components/InvestorRoute";
import { SellerRoute } from "@/components/SellerRoute";
import { BottomNav } from "@/components/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAiTranslation } from "@/hooks/useAiTranslation";
const Index = lazy(() => import("./pages/Index"));
const AIAssistantWidget = lazy(() => import("@/components/AIAssistantWidget"));
const Listings = lazy(() => import("./pages/Listings"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Auctions = lazy(() => import("./pages/Auctions"));
const Firesale = lazy(() => import("./pages/Firesale"));
const InvestorDashboard = lazy(() => import("./pages/InvestorDashboard"));
const Professionals = lazy(() => import("./pages/Professionals"));
const ProfessionalProfile = lazy(() => import("./pages/ProfessionalProfile"));
const ProfessionalProfileMe = lazy(() => import("./pages/ProfessionalProfileMe"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
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
const NewBuildDetail = lazy(() => import("./pages/NewBuildDetail"));
const OpenHouses = lazy(() => import("./pages/OpenHouses"));
const OpenHouseDetail = lazy(() => import("./pages/OpenHouseDetail"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const DocumentTemplates = lazy(() => import("./pages/DocumentTemplates"));
const Contact = lazy(() => import("./pages/Contact"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    },
  },
});

/** Triggers AI translation loading whenever the active locale changes */
function I18nLoader() {
  useAiTranslation();
  return null;
}

function GlobalAIWidget() {
  const loc = useLocation();
  const hide = ["/login", "/signup", "/onboarding", "/dashboard", "/messages", "/ai-assistant"].some(p => loc.pathname.startsWith(p));
  const isPropertyPage = loc.pathname.startsWith("/property/");
  if (hide || isPropertyPage) return null;
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
                  <Suspense fallback={<div className="min-h-screen bg-background" />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/listings/new" element={<SellerRoute><CreateListing /></SellerRoute>} />
                      <Route path="/listings/new-building" element={<SellerRoute><CreateNewBuildingListing /></SellerRoute>} />
                      <Route path="/listings" element={<Listings />} />
                      <Route path="/property/:id" element={<ErrorBoundary><PropertyDetail /></ErrorBoundary>} />
                      <Route path="/auction/:id" element={<ErrorBoundary><PropertyDetail /></ErrorBoundary>} />
                      <Route path="/auctions" element={<Auctions />} />
                      <Route path="/firesale" element={<Firesale />} />
                      <Route path="/investor-dashboard" element={<InvestorRoute><InvestorDashboard /></InvestorRoute>} />
                      <Route path="/professionals" element={<Professionals />} />
                      <Route path="/professionals/me" element={<ProtectedRoute><ProfessionalProfileMe /></ProtectedRoute>} />
                      <Route path="/professionals/:id" element={<ProfessionalProfile />} />
                      <Route path="/video-room/:professionalId" element={<BrandedVideoRoom />} />
                      <Route path="/new-build/:id" element={<ErrorBoundary><NewBuildDetail /></ErrorBoundary>} />
                      <Route path="/open-houses" element={<OpenHouses />} />
                      <Route path="/open-house/:id" element={<ErrorBoundary><OpenHouseDetail /></ErrorBoundary>} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                      <Route path="/dashboard/:section" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                      <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
                      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                      <Route path="/terms-of-service" element={<TermsOfService />} />
                      <Route path="/cookie-policy" element={<CookiePolicy />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
                      <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
                      <Route path="/portfolios" element={<ProtectedRoute><Portfolios /></ProtectedRoute>} />
                      <Route path="/ai-assistant" element={<AIAssistantPage />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                      <Route path="/platform-map" element={<AdminRoute><PlatformMap /></AdminRoute>} />
                      <Route path="/admin/pricing" element={<AdminRoute><Navigate to="/admin?tab=pricing" replace /></AdminRoute>} />
                      <Route path="/api-docs" element={<ApiDocs />} />
                      <Route path="/document-templates" element={<DocumentTemplates />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  <I18nLoader />
                  <GlobalAIWidget />
                  <BottomNav />
                </BrowserRouter>
              </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
