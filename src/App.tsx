import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PropertyProvider } from "@/contexts/PropertyContext";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { AuthProvider } from "@/hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";

const Index = lazy(() => import("./pages/Index"));
const Admin = lazy(() => import("./pages/Admin"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ProtectedRoute = lazy(() => import("@/components/ProtectedRoute"));
const PropertyPage = lazy(() => import("./pages/PropertyPage"));
const Guides = lazy(() => import("./pages/Guides"));
const GuideArticle = lazy(() => import("./pages/GuideArticle"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Properties = lazy(() => import("./pages/Properties"));
const ProcessPage = lazy(() => import("./pages/Process"));
const Pricing = lazy(() => import("./pages/Pricing"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — prevents refetch on every focus/mount
      gcTime: 10 * 60 * 1000,   // 10 minutes garbage collection
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});

// Stable-height skeleton prevents CLS while lazy chunks load
const PageFallback = () => <div className="min-h-screen" aria-hidden="true" />;
const W = ({ c }: { c: React.ReactNode }) => <Suspense fallback={<PageFallback />}>{c}</Suspense>;

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <TranslationProvider>
          <PropertyProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<W c={<Index />} />} />
                <Route path="/property/:id" element={<W c={<PropertyPage />} />} />
                <Route path="/guides" element={<W c={<Guides />} />} />
                <Route path="/guides/" element={<W c={<Guides />} />} />
                <Route path="/guides/:slug" element={<W c={<GuideArticle />} />} />
                <Route path="/guides/:slug/" element={<W c={<GuideArticle />} />} />
                <Route path="/portfolio" element={<W c={<Portfolio />} />} />
                <Route path="/portfolio/" element={<W c={<Portfolio />} />} />
                <Route path="/trackrecord" element={<W c={<Portfolio />} />} />
                <Route path="/trackrecord/" element={<W c={<Portfolio />} />} />
                <Route path="/properties" element={<W c={<Properties />} />} />
                <Route path="/properties/" element={<W c={<Properties />} />} />
                <Route path="/process" element={<W c={<ProcessPage />} />} />
                <Route path="/process/" element={<W c={<ProcessPage />} />} />
                <Route path="/login" element={<W c={<Login />} />} />
                <Route path="/pricing" element={<W c={<Pricing />} />} />
                <Route path="/admin" element={<W c={<ProtectedRoute><Admin /></ProtectedRoute>} />} />
                <Route path="*" element={<W c={<NotFound />} />} />
              </Routes>
            </BrowserRouter>
          </PropertyProvider>
          </TranslationProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
