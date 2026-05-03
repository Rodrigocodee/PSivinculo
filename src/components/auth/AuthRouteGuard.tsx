import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { canAccessModule, type PermissionModuleKey } from "@/services/accessControl";
import {
  buildClinicAdminAccessDeniedMessage,
  CLINIC_ADMIN_ACCESS_DENIED_ROUTE,
  logClinicAdminRouteAccess,
  resolveClinicAdminAccess,
} from "@/services/adminAccess";
import {
  getFallbackRoleFromAuthUser,
  getSafeRedirectPath,
  type AppRole,
} from "@/services/auth";

type RequireAuthProps = {
  allowedRoles?: AppRole[];
  moduleKey?: PermissionModuleKey;
  children?: ReactNode;
};

function FullScreenAuthState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function RequireAuth({
  allowedRoles,
  moduleKey,
  children,
}: RequireAuthProps) {
  const location = useLocation();
  const { appUser, session, isAuthenticated, isLoading } = useAuth();
  const { permissions } = usePermissions();
  const resolvedRole = appUser?.role || getFallbackRoleFromAuthUser(session?.user);
  const effectiveRole = resolvedRole || null;
  const isAdminRoute =
    location.pathname.startsWith("/admin") &&
    !location.pathname.startsWith("/admin/master");
  const adminAccess = isAdminRoute
    ? resolveClinicAdminAccess({
      user: appUser?.user || session?.user || null,
      recordTable: appUser?.recordTable || null,
      record: appUser?.record || null,
    })
    : null;

  if (isLoading) {
    return <FullScreenAuthState message="Carregando sessao..." />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  if (adminAccess && !moduleKey) {
    logClinicAdminRouteAccess({
      routePath: `${location.pathname}${location.search}${location.hash}`,
      access: adminAccess,
    });
  }

  if (adminAccess && !adminAccess.isClinicAdmin) {
    return (
      <Navigate
        to={CLINIC_ADMIN_ACCESS_DENIED_ROUTE}
        replace
        state={{
          message: buildClinicAdminAccessDeniedMessage(adminAccess.reason),
        }}
      />
    );
  }

  if (allowedRoles?.length && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
    return <Navigate to="/acesso-negado" replace />;
  }

  if (moduleKey && !canAccessModule(effectiveRole, moduleKey, permissions)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  if (children) return <>{children}</>;

  return <Outlet />;
}

export function RedirectAuthenticated() {
  const { appUser, session, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenAuthState message="Carregando sessao..." />;
  }

  if (isAuthenticated) {
    return <Navigate to={getSafeRedirectPath(appUser, null, session?.user ?? null)} replace />;
  }

  return <Outlet />;
}
