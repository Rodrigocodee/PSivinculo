import type { AppRole } from "@/services/auth";

export type PermissionModuleKey =
  | "dashboard"
  | "agenda"
  | "patients"
  | "records"
  | "financial"
  | "reports"
  | "users"
  | "permissions"
  | "clinic"
  | "plans"
  | "settings";

export type PermissionManagedRole = Exclude<AppRole, "patient">;
export type RolePermissionSet = Record<PermissionModuleKey, boolean>;
export type AccessPermissionsConfig = Record<PermissionManagedRole, RolePermissionSet>;

export const ACCESS_PERMISSIONS_STORAGE_KEY = "psivinculo-access-permissions-v1";

export const PERMISSION_MATRIX_ROWS: Array<{
  key: PermissionModuleKey;
  label: string;
}> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "agenda", label: "Agenda" },
  { key: "patients", label: "Pacientes" },
  { key: "records", label: "Prontuarios" },
  { key: "financial", label: "Financeiro" },
  { key: "reports", label: "Relatorios" },
  { key: "users", label: "Usuarios" },
  { key: "permissions", label: "Permissoes" },
  { key: "clinic", label: "Clinica" },
  { key: "plans", label: "Planos" },
  { key: "settings", label: "Configuracoes" },
];

export const DEFAULT_ACCESS_PERMISSIONS: AccessPermissionsConfig = {
  admin: {
    dashboard: true,
    agenda: true,
    patients: true,
    records: false,
    financial: true,
    reports: true,
    users: true,
    permissions: true,
    clinic: true,
    plans: true,
    settings: true,
  },
  psychologist: {
    dashboard: true,
    agenda: true,
    patients: true,
    records: true,
    financial: true,
    reports: true,
    users: false,
    permissions: false,
    clinic: false,
    plans: false,
    settings: true,
  },
};

const HARD_LOCKED_FALSE: Record<PermissionManagedRole, PermissionModuleKey[]> = {
  admin: ["records"],
  psychologist: ["users", "permissions", "clinic", "plans"],
};

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function cloneRolePermissions(role: PermissionManagedRole, source?: Partial<RolePermissionSet> | null): RolePermissionSet {
  const defaults = DEFAULT_ACCESS_PERMISSIONS[role];

  return {
    dashboard: source?.dashboard ?? defaults.dashboard,
    agenda: source?.agenda ?? defaults.agenda,
    patients: source?.patients ?? defaults.patients,
    records: source?.records ?? defaults.records,
    financial: source?.financial ?? defaults.financial,
    reports: source?.reports ?? defaults.reports,
    users: source?.users ?? defaults.users,
    permissions: source?.permissions ?? defaults.permissions,
    clinic: source?.clinic ?? defaults.clinic,
    plans: source?.plans ?? defaults.plans,
    settings: source?.settings ?? defaults.settings,
  };
}

function applyHardBusinessRules(config: AccessPermissionsConfig): AccessPermissionsConfig {
  const nextConfig: AccessPermissionsConfig = {
    admin: { ...config.admin },
    psychologist: { ...config.psychologist },
  };

  for (const role of Object.keys(HARD_LOCKED_FALSE) as PermissionManagedRole[]) {
    for (const moduleKey of HARD_LOCKED_FALSE[role]) {
      nextConfig[role][moduleKey] = false;
    }
  }

  return nextConfig;
}

export function isPermissionLocked(role: PermissionManagedRole, moduleKey: PermissionModuleKey) {
  return HARD_LOCKED_FALSE[role].includes(moduleKey);
}

export function normalizeAccessPermissionsConfig(
  value?: Partial<Record<PermissionManagedRole, Partial<RolePermissionSet>>> | null,
): AccessPermissionsConfig {
  return applyHardBusinessRules({
    admin: cloneRolePermissions("admin", value?.admin),
    psychologist: cloneRolePermissions("psychologist", value?.psychologist),
  });
}

export function loadStoredAccessPermissions(): AccessPermissionsConfig {
  if (!canUseBrowserStorage()) {
    return normalizeAccessPermissionsConfig();
  }

  try {
    const rawValue = window.localStorage.getItem(ACCESS_PERMISSIONS_STORAGE_KEY);
    if (!rawValue) return normalizeAccessPermissionsConfig();

    const parsed = JSON.parse(rawValue) as Partial<Record<PermissionManagedRole, Partial<RolePermissionSet>>>;
    return normalizeAccessPermissionsConfig(parsed);
  } catch {
    return normalizeAccessPermissionsConfig();
  }
}

export function saveStoredAccessPermissions(
  value: Partial<Record<PermissionManagedRole, Partial<RolePermissionSet>>> | AccessPermissionsConfig,
) {
  const normalized = normalizeAccessPermissionsConfig(value);

  if (canUseBrowserStorage()) {
    try {
      window.localStorage.setItem(ACCESS_PERMISSIONS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage errors and keep in-memory permissions usable.
    }
  }

  return normalized;
}

export function getRolePermissions(
  role: PermissionManagedRole,
  config?: AccessPermissionsConfig | null,
) {
  const resolvedConfig = config || DEFAULT_ACCESS_PERMISSIONS;
  return resolvedConfig[role];
}

export function canAccessModule(
  role: AppRole | null | undefined,
  moduleKey: PermissionModuleKey,
  config?: AccessPermissionsConfig | null,
) {
  if (role === "patient" || !role) return false;
  return Boolean(getRolePermissions(role, config)[moduleKey]);
}
