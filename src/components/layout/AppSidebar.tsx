import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Receipt,
  Settings,
  Shield,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { HelpCenterCard } from "@/components/support/HelpCenterCard";
import { usePsychologistProfessionalPreview } from "@/components/psychologist/ProfessionalPreview";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useCurrentPsychologistPaymentSettings } from "@/hooks/use-current-psychologist-payment-settings";
import { canAccessModule, type PermissionModuleKey } from "@/services/accessControl";
import { isPsychologistReceivablesEnabled } from "@/services/psychologistPaymentSettings";

interface AppSidebarProps {
  role: "psychologist" | "admin" | "patient";
  open: boolean;
  onClose: () => void;
}

type RoleMenuItem = {
  title: string;
  icon: LucideIcon;
  path: string;
  activePaths?: string[];
  moduleKey?: PermissionModuleKey;
  requiresReceivablesEnabled?: boolean;
};

const menuItems: Record<AppSidebarProps["role"], RoleMenuItem[]> = {
  psychologist: [
    { title: "Dashboard", icon: LayoutDashboard, path: "/psi/dashboard", moduleKey: "dashboard" },
    { title: "Agenda", icon: Calendar, path: "/psi/agenda", moduleKey: "agenda" },
    { title: "Pacientes", icon: Users, path: "/psi/pacientes", moduleKey: "patients" },
    { title: "Prontuarios", icon: FileText, path: "/psi/prontuarios", moduleKey: "records" },
    { title: "Financeiro", icon: DollarSign, path: "/psi/financeiro", moduleKey: "financial" },
    {
      title: "Recebimentos",
      icon: Receipt,
      path: "/psi/recebimentos",
      activePaths: ["/recebimentos"],
      moduleKey: "financial",
      requiresReceivablesEnabled: true,
    },
    { title: "Relatorios", icon: BarChart3, path: "/psi/relatorios", moduleKey: "reports" },
    { title: "Meu Perfil", icon: UserCircle, path: "/psi/configuracoes", moduleKey: "settings" },
    { title: "Consulta", icon: Settings, path: "/psi/consulta-config", moduleKey: "settings" },
  ],
  admin: [
    { title: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard", moduleKey: "dashboard" },
    { title: "Usuarios", icon: Users, path: "/admin/usuarios", moduleKey: "users" },
    { title: "Permissoes", icon: Shield, path: "/admin/permissoes", moduleKey: "permissions" },
    { title: "Clinica", icon: Building2, path: "/admin/clinica", moduleKey: "clinic" },
    { title: "Relatorios", icon: BarChart3, path: "/admin/relatorios", moduleKey: "reports" },
    { title: "Financeiro", icon: DollarSign, path: "/admin/financeiro", moduleKey: "financial" },
    {
      title: "Planos",
      icon: CreditCard,
      path: "/admin/planos",
      activePaths: ["/admin/assinatura"],
      moduleKey: "plans",
    },
    { title: "Configuracoes", icon: Settings, path: "/admin/configuracoes", moduleKey: "settings" },
  ],
  patient: [
    { title: "Dashboard", icon: LayoutDashboard, path: "/paciente/dashboard" },
    { title: "Agendamentos", icon: Calendar, path: "/paciente/agendamentos" },
    { title: "Recibos", icon: Receipt, path: "/paciente/recibos" },
    { title: "Perfil", icon: UserCircle, path: "/paciente/perfil" },
  ],
};

export function AppSidebar({ role, open, onClose }: AppSidebarProps) {
  const location = useLocation();
  const { appUser } = useAuth();
  const { isPreviewMode } = usePsychologistProfessionalPreview();
  const { permissions } = usePermissions();
  const { data: paymentSettings } = useCurrentPsychologistPaymentSettings(role === "psychologist");
  const baseItems = role === "patient"
    ? menuItems.patient
    : role === "admin" && !appUser?.isClinicAdmin
      ? []
      : menuItems[role];
  const items = role === "patient"
    ? baseItems
    : baseItems.filter((item) => {
      if (!item.moduleKey) return true;
      if (!canAccessModule(role, item.moduleKey, permissions)) return false;
      if (role === "psychologist" && item.requiresReceivablesEnabled) {
        return isPsychologistReceivablesEnabled(paymentSettings);
      }
      return true;
    });

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 lg:sticky lg:w-64 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <div className="flex items-center gap-2.5">
            <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg font-bold text-foreground">Psivinculo</span>
          </div>

          <button onClick={onClose} className="rounded p-1 hover:bg-muted lg:hidden">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(`${item.path}/`) ||
              item.activePaths?.some(
                (activePath) =>
                  location.pathname === activePath || location.pathname.startsWith(`${activePath}/`),
              );

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          {role === "psychologist" && isPreviewMode ? (
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">Modo preview ativo</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Explore a area profissional e libere o uso completo quando quiser.
              </p>
              <Link
                to="/psi/planos"
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Escolher plano
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <HelpCenterCard variant="sidebar" />
          )}
        </div>
      </aside>
    </>
  );
}
