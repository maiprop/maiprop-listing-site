import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import Index from "./pages/Index";
import Listings from "./pages/Listings";
import PropertyDetail from "./pages/PropertyDetail";
import Auctions from "./pages/Auctions";
import Firesale from "./pages/Firesale";
import InvestorDashboard from "./pages/InvestorDashboard";
import Professionals from "./pages/Professionals";
import ProfessionalProfile from "./pages/ProfessionalProfile";
import Dashboard from "./pages/Dashboard";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Messages from "./pages/Messages";
import CreateListing from "./pages/CreateListing";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Pro from "./pages/Pro";
import FiresalePricing from "./pages/FiresalePricing";
import Pricing from "./pages/Pricing";
import AdminPricing from "./pages/AdminPricing";
import AIAssistantPage from "./pages/AIAssistantPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookiePolicy from "./pages/CookiePolicy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      // Avoid long loading loops when network/Supabase is unreachable
      staleTime: 30_000,
    },
  },
});

// Show the global AI floating widget on desktop only; /ai-assistant has its own embedded widget
function GlobalAIWidget() {
  const loc = useLocation();
  const hide = ["/login", "/signup", "/onboarding", "/dashboard", "/messages", "/ai-assistant"].some(p => loc.pathname.startsWith(p));
  const isPropertyPage = loc.pathname.startsWith("/property/");
  if (hide || isPropertyPage) return null;
  return <AIAssistantWidget variant="floating" />;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/listings/new" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
              <Route path="/listings" element={<Listings />} />
              <Route path="/property/:id" element={<PropertyDetail />} />
              <Route path="/auction/:id" element={<PropertyDetail />} />
              <Route path="/auctions" element={<Auctions />} />
              <Route path="/firesale" element={<Firesale />} />
              <Route path="/investor-dashboard" element={<InvestorDashboard />} />
              <Route path="/professionals" element={<Professionals />} />
              <Route path="/professionals/:id" element={<ProfessionalProfile />} />
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
              <Route path="/pro" element={<Pro />} />
              <Route path="/ai-assistant" element={<AIAssistantPage />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/pricing/firesale-investors" element={<FiresalePricing />} />
              <Route
                path="/admin/pricing"
                element={
                  <ProtectedRoute>
                    <AdminPricing />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <GlobalAIWidget />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
