import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACCESS_PERMISSIONS_STORAGE_KEY,
  loadStoredAccessPermissions,
  saveStoredAccessPermissions,
  type AccessPermissionsConfig,
  type PermissionManagedRole,
  type RolePermissionSet,
} from "@/services/accessControl";

type PermissionsContextValue = {
  permissions: AccessPermissionsConfig;
  savePermissions: (nextPermissions: AccessPermissionsConfig) => AccessPermissionsConfig;
  updateRolePermissions: (
    role: PermissionManagedRole,
    updater: RolePermissionSet | ((current: RolePermissionSet) => RolePermissionSet),
  ) => AccessPermissionsConfig;
};

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<AccessPermissionsConfig>(() => loadStoredAccessPermissions());

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== ACCESS_PERMISSIONS_STORAGE_KEY) return;
      setPermissions(loadStoredAccessPermissions());
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo<PermissionsContextValue>(() => ({
    permissions,
    savePermissions(nextPermissions) {
      const normalized = saveStoredAccessPermissions(nextPermissions);
      setPermissions(normalized);
      return normalized;
    },
    updateRolePermissions(role, updater) {
      const nextRolePermissions =
        typeof updater === "function" ? updater(permissions[role]) : updater;
      const normalized = saveStoredAccessPermissions({
        ...permissions,
        [role]: nextRolePermissions,
      });

      setPermissions(normalized);
      return normalized;
    },
  }), [permissions]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);

  if (!context) {
    throw new Error("usePermissions deve ser usado dentro de PermissionsProvider.");
  }

  return context;
}
