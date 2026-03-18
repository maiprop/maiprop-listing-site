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
import { SellerRoute } from "@/components/SellerRoute";
import { InvestorRoute } from "@/components/InvestorRoute";
import { BottomNav } from "@/components/BottomNav";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import Index from "./pages/Index";
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
const AIAssistantPage = lazy(() => import("./pages/AIAssistantPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const BrandedVideoRoom = lazy(() => import("./pages/BrandedVideoRoom"));
const OpenHouses = lazy(() => import("./pages/OpenHouses"));
const OpenHouseDetail = lazy(() => import("./pages/OpenHouseDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

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
                      <Route path="/listings/new" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
                      <Route path="/listings/new-building" element={<ProtectedRoute><CreateNewBuildingListing /></ProtectedRoute>} />
                      <Route path="/listings" element={<Listings />} />
                      <Route path="/property/:id" element={<PropertyDetail />} />
                      <Route path="/auction/:id" element={<PropertyDetail />} />
                      <Route path="/auctions" element={<Auctions />} />
                      <Route path="/firesale" element={<Firesale />} />
                      <Route path="/investor-dashboard" element={<InvestorRoute><InvestorDashboard /></InvestorRoute>} />
                      <Route path="/professionals" element={<Professionals />} />
                      <Route path="/professionals/me" element={<ProtectedRoute><ProfessionalProfileMe /></ProtectedRoute>} />
                      <Route path="/professionals/:id" element={<ProfessionalProfile />} />
                      <Route path="/video-room/:professionalId" element={<BrandedVideoRoom />} />
                      <Route path="/open-houses" element={<OpenHouses />} />
                      <Route path="/open-house/:id" element={<OpenHouseDetail />} />
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
                      <Route path="/admin/pricing" element={<AdminRoute><Navigate to="/admin?tab=pricing" replace /></AdminRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
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
