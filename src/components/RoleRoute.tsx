import type { ReactElement, ReactNode } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export type RoleRouteGuardResult = {
  loading?: boolean;
  loadingLabel?: string;
  allowed?: boolean;
  denied?: ReactNode;
};

type RoleRouteProps = {
  children: ReactNode;
  useGuard: () => RoleRouteGuardResult;
};

export function RoleRoute({ children, useGuard }: RoleRouteProps) {
  return (
    <ProtectedRoute>
      <RoleRouteGate useGuard={useGuard}>{children}</RoleRouteGate>
    </ProtectedRoute>
  );
}

export function RoleRouteLoading({ label }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

function RoleRouteGate({ children, useGuard }: RoleRouteProps) {
  const guard = useGuard();

  if (guard.loading) {
    return <RoleRouteLoading label={guard.loadingLabel} />;
  }

  if (guard.allowed) {
    return children as ReactElement;
  }

  return <>{guard.denied}</>;
}
