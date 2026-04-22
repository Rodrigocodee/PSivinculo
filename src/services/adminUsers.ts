import {
  ensureCurrentAdminClinicInviteCode,
  getCurrentAdminContext,
} from "@/services/currentAdmin";
import { supabase } from "@/lib/supabase";
import { resolvePsychologistClinicAccess } from "@/services/psychologistAccess";

type UsuarioRow = Record<string, unknown>;

export type AdminUserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  specialty: string;
  statusLabel: string;
  statusTone: "success" | "muted";
  searchText: string;
};

export type AdminUsersData = {
  adminName: string;
  clinicName: string;
  inviteCode: string;
  inviteLink: string;
  inviteCodePersisted: boolean;
  users: AdminUserItem[];
  hasClinicScope: boolean;
};

export const adminUsersQueryKey = ["admin-users"];

async function runOptionalRowsQuery<T extends Record<string, unknown>>(
  factory: () => Promise<{ data: T[] | null; error: unknown }>,
) {
  try {
    const result = await factory();
    if (result.error || !Array.isArray(result.data)) return [];
    return result.data;
  } catch {
    return [];
  }
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }

  return null;
}

function normalizeRole(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveUserRole(row: UsuarioRow) {
  const explicitRole = normalizeRole(
    pickString(row, ["role", "perfil", "tipo", "tipo_usuario", "user_type", "cargo"]),
  );

  if (explicitRole) return explicitRole;
  if (pickString(row, ["crp", "especialidade", "specialty", "psicologo_id"])) return "psychologist";
  return "user";
}

function getRoleLabel(role: string) {
  if (["psychologist", "psicologo", "psicologa", "therapist", "psi"].includes(role)) {
    return "Psicologo(a)";
  }

  if ([
    "admin",
    "administrator",
    "administrador",
    "administradora",
    "admin_clinica",
    "adminclinica",
    "administradorclinica",
    "clinic_admin",
    "clinicadmin",
    "clinicadministrator",
  ].includes(role)) {
    return "Administrador(a)";
  }

  return "Usuario";
}

function resolveStatus(row: UsuarioRow) {
  const explicitStatus = normalizeRole(pickString(row, ["status", "access_status", "professional_access_status"]));
  const activeFlag = pickBoolean(row, ["ativo", "active", "is_active", "enabled"]);
  const psychologistClinicAccess = resolvePsychologistClinicAccess(row, row);

  if (explicitStatus) {
    if (["active", "ativo", "enabled", "liberado", "released"].includes(explicitStatus)) {
      return { label: "Ativo", tone: "success" as const };
    }

    if (["inactive", "inativo", "blocked", "bloqueado", "disabled"].includes(explicitStatus)) {
      return { label: "Inativo", tone: "muted" as const };
    }

    if (["preview", "pending", "pendente", "aguardando_plano", "awaiting_plan"].includes(explicitStatus)) {
      if (psychologistClinicAccess.isClinicInvitedPsychologist) {
        return { label: "Ativo", tone: "success" as const };
      }
      return { label: "Em configuracao", tone: "muted" as const };
    }

    return { label: explicitStatus.charAt(0).toUpperCase() + explicitStatus.slice(1), tone: "muted" as const };
  }

  if (psychologistClinicAccess.isClinicInvitedPsychologist) {
    return { label: "Ativo", tone: "success" as const };
  }

  if (activeFlag === true) return { label: "Ativo", tone: "success" as const };
  if (activeFlag === false) return { label: "Inativo", tone: "muted" as const };
  return { label: "Nao informado", tone: "muted" as const };
}

function mapUserRow(row: UsuarioRow): AdminUserItem {
  const role = resolveUserRole(row);
  const status = resolveStatus(row);
  const name = pickString(row, ["nome", "name", "full_name"]) || "Usuario sem nome";
  const email = pickString(row, ["email"]) || "E-mail nao informado";
  const roleLabel = getRoleLabel(role);
  const specialty = pickString(row, ["especialidade", "specialty", "crp"]);
  const stableId =
    pickString(row, ["user_id", "id", "email", "nome", "name"]) ||
    `${name}-${email}-${role}`;

  return {
    id: stableId,
    name,
    email,
    role,
    roleLabel,
    specialty,
    statusLabel: status.label,
    statusTone: status.tone,
    searchText: `${name} ${email} ${roleLabel} ${role} ${specialty}`.toLowerCase(),
  };
}

export async function fetchAdminUsersData(): Promise<AdminUsersData> {
  const context = await getCurrentAdminContext();

  if (!context.clinicId) {
    return {
      adminName: context.adminName,
      clinicName: context.clinicName,
      inviteCode: "",
      inviteLink: "",
      inviteCodePersisted: false,
      users: [],
      hasClinicScope: false,
    };
  }

  const invitation = await ensureCurrentAdminClinicInviteCode(context);
  const [usuariosResult, psicologosRows] = await Promise.all([
    supabase
      .from("usuarios")
      .select("*")
      .eq("clinica_id", context.clinicId)
      .order("nome", { ascending: true }),
    runOptionalRowsQuery<UsuarioRow>(() =>
      supabase
        .from("psicologos")
        .select("*")
        .eq("clinica_id", context.clinicId)
        .order("nome", { ascending: true }),
    ),
  ]);

  if (usuariosResult.error) throw usuariosResult.error;

  const mergedRows = [
    ...((usuariosResult.data ?? []) as UsuarioRow[]),
    ...psicologosRows,
  ];
  const dedupedRows = Array.from(
    mergedRows.reduce((accumulator, row) => {
      const key =
        pickString(row, ["user_id", "id", "email"]) ||
        `${pickString(row, ["nome", "name", "full_name"])}-${pickString(row, ["crp", "especialidade", "specialty"])}`;

      if (!key || accumulator.has(key)) return accumulator;
      accumulator.set(key, row);
      return accumulator;
    }, new Map<string, UsuarioRow>()),
  ).map(([, row]) => row);

  const users = dedupedRows
    .map(mapUserRow)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  return {
    adminName: context.adminName,
    clinicName: context.clinicName,
    inviteCode: invitation.inviteCode,
    inviteLink: invitation.inviteLink,
    inviteCodePersisted: invitation.isPersisted,
    users,
    hasClinicScope: true,
  };
}
