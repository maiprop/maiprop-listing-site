import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfessionalByUserId } from "@/hooks/useProfessionals";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

/** Redirects to the current user's professional profile. Used from onboarding "View My Profile". */
export default function ProfessionalProfileMe() {
  const { user } = useAuth();
  const { data: professional, isLoading } = useProfessionalByUserId(user?.id);

  if (!user) return <Navigate to="/login" replace />;
  if (isLoading)
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  if (professional?.id) return <Navigate to={`/professionals/${professional.id}`} replace />;
  return <Navigate to="/professionals" replace />;
}
