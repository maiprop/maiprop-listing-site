import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, Search, Gavel, Flame, Building2 } from "lucide-react";
import * as Sentry from "@sentry/react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: `404: ${location.pathname}`,
      level: "warning",
    });
  }, [location.pathname]);

  const quickLinks = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/listings", icon: Search, label: "Browse Listings" },
    { to: "/auctions", icon: Gavel, label: "Auctions" },
    { to: "/firesale", icon: Flame, label: "Quick Sale" },
    { to: "/professionals", icon: Building2, label: "Professionals" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col pb-bottom-nav lg:pb-0">
      <Navbar />
      <main id="main-content" className="flex-1 flex items-center justify-center px-4 pt-20 pb-12">
        <div className="text-center max-w-md">
          <h1 className="mb-2 text-6xl font-bold text-primary">404</h1>
          <p className="mb-6 text-lg text-muted-foreground">Oops! This page doesn't exist or has moved.</p>
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {quickLinks.map(({ to, icon: Icon, label }) => (
              <Button key={to} variant="outline" size="sm" className="border-border gap-1.5" asChild>
                <Link to={to}><Icon className="w-3.5 h-3.5" /> {label}</Link>
              </Button>
            ))}
          </div>
          <Button className="bg-gradient-primary border-0 text-primary-foreground" asChild>
            <Link to="/"><Home className="w-4 h-4 mr-2" /> Return to Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
