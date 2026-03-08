import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
import Messages from "./pages/Messages";
import CreateListing from "./pages/CreateListing";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Show the global AI widget on all pages except auth & dashboard
function GlobalAIWidget() {
  const loc = useLocation();
  const hide = ["/login", "/signup", "/dashboard", "/messages"].some(p => loc.pathname.startsWith(p));
  // On property detail pages, the widget is rendered inside PropertyDetail with context instead
  const isPropertyPage = loc.pathname.startsWith("/property/");
  if (hide || isPropertyPage) return null;
  return <AIAssistantWidget />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/property/:id" element={<PropertyDetail />} />
            <Route path="/auctions" element={<Auctions />} />
            <Route path="/firesale" element={<Firesale />} />
            <Route path="/investor-dashboard" element={<InvestorDashboard />} />
            <Route path="/professionals" element={<Professionals />} />
            <Route path="/professionals/:id" element={<ProfessionalProfile />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/:section" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
            <Route path="/listings/new" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <GlobalAIWidget />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
