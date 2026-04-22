import { useEffect, useMemo, useState } from "react";
import { Shield } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import {
  PERMISSION_MATRIX_ROWS,
  isPermissionLocked,
  type AccessPermissionsConfig,
  type PermissionManagedRole,
  type PermissionModuleKey,
} from "@/services/accessControl";

function Toggle({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex h-5 w-10 items-center rounded-full px-0.5 transition-all ${
        enabled ? "bg-primary" : "bg-muted"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div
        className={`h-4 w-4 rounded-full bg-card transition-transform ${
          enabled ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function clonePermissions(config: AccessPermissionsConfig): AccessPermissionsConfig {
  return {
    admin: { ...config.admin },
    psychologist: { ...config.psychologist },
  };
}

export default function AdminPermissions() {
  const { appUser } = useAuth();
  const { permissions, savePermissions } = usePermissions();
  const [draftPermissions, setDraftPermissions] = useState<AccessPermissionsConfig>(() => clonePermissions(permissions));

  useEffect(() => {
    setDraftPermissions(clonePermissions(permissions));
  }, [permissions]);

  const adminName = appUser?.fullName || "Administrador(a)";
  const hasChanges = useMemo(
    () => JSON.stringify(draftPermissions) !== JSON.stringify(permissions),
    [draftPermissions, permissions],
  );

  function handleToggle(role: PermissionManagedRole, moduleKey: PermissionModuleKey) {
    if (isPermissionLocked(role, moduleKey)) return;

    setDraftPermissions((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [moduleKey]: !current[role][moduleKey],
      },
    }));
  }

  function handleSave() {
    const savedPermissions = savePermissions(draftPermissions);
    setDraftPermissions(clonePermissions(savedPermissions));
    toast.success("Permissoes salvas e aplicadas neste ambiente.");
  }

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
            <Shield className="h-6 w-6 text-primary" />
            Permissoes de Acesso
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie os acessos dos perfis ativos sem violar o sigilo clinico dos prontuarios.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Modulo</th>
                  <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Administrador(a)</th>
                  <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Psicologo(a)</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX_ROWS.map((permission) => (
                  <tr key={permission.key} className="border-b border-border hover:bg-muted/30">
                    <td className="px-5 py-3 font-medium text-foreground">{permission.label}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          enabled={draftPermissions.admin[permission.key]}
                          disabled={isPermissionLocked("admin", permission.key)}
                          onToggle={() => handleToggle("admin", permission.key)}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          enabled={draftPermissions.psychologist[permission.key]}
                          disabled={isPermissionLocked("psychologist", permission.key)}
                          onToggle={() => handleToggle("psychologist", permission.key)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges}
            className="rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Salvar Permissoes
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
