import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { RoleRoute, type RoleRouteGuardResult } from "./RoleRoute";

/** Protects admin-only routes. Only users with role='admin' can access. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute useGuard={useAdminRouteGuard}>{children}</RoleRoute>;
}

function useAdminRouteGuard(): RoleRouteGuardResult {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return { loading: true };
  }

  if (!isPlatformAdmin(profile)) {
    return { denied: <Navigate to="/dashboard" replace /> };
  }

  return { allowed: true };
}
