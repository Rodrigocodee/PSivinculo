import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getCurrentAdminContext } from "@/services/currentAdmin";

type AdminLookupRecord = {
  table: string;
  row: Record<string, unknown>;
};

type ConsultaRow = Record<string, unknown>;
type PacienteRow = Record<string, unknown>;
type PagamentoRow = Record<string, unknown>;
type UsuarioRow = Record<string, unknown>;

type AdminDashboardContext = {
  user: User | null;
  record: AdminLookupRecord | null;
  clinicId: string;
  clinicName: string;
  adminName: string;
};

export type AdminDashboardData = {
  adminName: string;
  clinicName: string;
  currentMonthLabel: string;
  psychologistCount: number;
  activePatientsCount: number;
  appointmentsThisMonth: number;
  revenueThisMonth: number | null;
  missedAppointmentsCount: number;
  occupancyRate: number | null;
  appointmentChart: Array<{ month: string; total: number }>;
  professionalChart: Array<{ name: string; value: number }>;
  revenueChart: Array<{ month: string; value: number }>;
  hasAppointmentChartData: boolean;
  hasProfessionalChartData: boolean;
  hasRevenueChartData: boolean;
  hasClinicScope: boolean;
};

export const adminDashboardQueryKey = ["admin-dashboard"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRole(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPsychologistRow(row: Record<string, unknown>) {
  const role = normalizeRole(
    pickString(row, ["role", "perfil", "tipo", "tipo_usuario", "user_type", "cargo"]),
  );

  if (
    [
      "psychologist",
      "psicologo",
      "psicologa",
      "psicólogo",
      "psicóloga",
      "therapist",
      "psi",
    ].includes(role)
  ) {
    return true;
  }

  return Boolean(
    pickString(row, ["crp", "especialidade", "specialty", "psicologo_id"]),
  );
}

function normalizePaidStatus(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPaidPaymentStatus(value: unknown) {
  return ["pago", "paid", "recebido", "completed", "concluido", "concluído"].includes(
    normalizePaidStatus(value),
  );
}

function getPossibleNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string" && value.trim()) {
      const normalized = value.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);

      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

function getPaymentDate(payment: PagamentoRow) {
  return pickString(payment, ["data_pagamento", "data", "created_at", "updated_at", "data_vencimento"]);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatShortMonth(date: Date) {
  const label = date.toLocaleDateString("pt-BR", { month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1, 3);
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getUserFallbackName(user: User | null) {
  const email = user?.email?.trim() || "";
  if (!email) return "Administrador(a)";

  const localPart = email.split("@")[0] || "administrador";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function getAuthenticatedUser() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

async function findAdminRecordInTable(table: string, user: User | null): Promise<AdminLookupRecord | null> {
  if (!user) return null;

  const candidates = [
    { column: "id", value: user.id },
    { column: "user_id", value: user.id },
    { column: "email", value: user.email || "" },
  ];

  for (const candidate of candidates) {
    if (!candidate.value) continue;

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(candidate.column, candidate.value)
      .maybeSingle();

    if (error || !data || !isRecord(data)) continue;

    return {
      table,
      row: data,
    };
  }

  return null;
}

async function findCurrentAdminRecord(user: User | null) {
  for (const table of ["usuarios", "profiles"] as const) {
    const record = await findAdminRecordInTable(table, user);
    if (record) return record;
  }

  return null;
}

async function resolveClinicName(clinicId: string, record: Record<string, unknown> | null, metadata: Record<string, unknown>) {
  const clinicFallbackName =
    pickString(record, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]) ||
    pickString(metadata, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]) ||
    "Clinica nao informada";

  if (!clinicId) return clinicFallbackName;

  try {
    const { data, error } = await supabase
      .from("clinicas")
      .select("*")
      .eq("id", clinicId)
      .maybeSingle();

    if (error || !data || !isRecord(data)) return clinicFallbackName;

    return (
      pickString(data, ["nome", "name", "nome_clinica", "clinic_name", "clinicName", "consultorio"]) ||
      clinicFallbackName
    );
  } catch {
    return clinicFallbackName;
  }
}

async function getCurrentAdminDashboardContext(): Promise<AdminDashboardContext> {
  const context = await getCurrentAdminContext();

  return {
    user: context.user,
    record: context.record,
    clinicId: context.clinicId,
    clinicName: context.clinicName,
    adminName: context.adminName,
  };
}

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

function buildMonthBuckets(now: Date, totalMonths = 6) {
  return Array.from({ length: totalMonths }, (_, index) => {
    const date = addMonths(startOfMonth(now), -(totalMonths - 1) + index);
    return {
      key: formatMonthKey(date),
      label: formatShortMonth(date),
      date,
    };
  });
}

function getPsychologistIdentifier(row: Record<string, unknown>) {
  return (
    pickString(row, ["psicologo_id"]) ||
    pickString(row, ["user_id"]) ||
    pickString(row, ["id"]) ||
    ""
  );
}

function getPsychologistDisplayName(row: Record<string, unknown>) {
  return pickString(row, ["nome", "name", "full_name"]) || "Profissional";
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  const context = await getCurrentAdminDashboardContext();
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const monthBuckets = buildMonthBuckets(now);
  const chartStart = monthBuckets[0]?.date || currentMonthStart;
  const chartStartIso = chartStart.toISOString();
  const currentMonthEndIso = currentMonthEnd.toISOString();

  if (!context.clinicId) {
    return {
      adminName: context.adminName,
      clinicName: context.clinicName,
      currentMonthLabel: formatMonthLabel(now),
      psychologistCount: 0,
      activePatientsCount: 0,
      appointmentsThisMonth: 0,
      revenueThisMonth: null,
      missedAppointmentsCount: 0,
      occupancyRate: null,
      appointmentChart: monthBuckets.map((bucket) => ({ month: bucket.label, total: 0 })),
      professionalChart: [],
      revenueChart: [],
      hasAppointmentChartData: false,
      hasProfessionalChartData: false,
      hasRevenueChartData: false,
      hasClinicScope: false,
    };
  }

  const [consultasResult, pacientesRows, pagamentosRows, usuariosRows, psicologosRows] = await Promise.all([
    supabase
      .from("consultas")
      .select("id, clinica_id, psicologo_id, data_consulta, status")
      .eq("clinica_id", context.clinicId)
      .gte("data_consulta", chartStartIso)
      .lte("data_consulta", currentMonthEndIso)
      .order("data_consulta", { ascending: true }),
    runOptionalRowsQuery<PacienteRow>(() =>
      supabase.from("pacientes").select("*").eq("clinica_id", context.clinicId),
    ),
    runOptionalRowsQuery<PagamentoRow>(() =>
      supabase.from("pagamentos").select("*").eq("clinica_id", context.clinicId),
    ),
    runOptionalRowsQuery<UsuarioRow>(() =>
      supabase.from("usuarios").select("*").eq("clinica_id", context.clinicId),
    ),
    runOptionalRowsQuery<UsuarioRow>(() =>
      supabase.from("psicologos").select("*").eq("clinica_id", context.clinicId),
    ),
  ]);

  if (consultasResult.error) throw consultasResult.error;

  const consultas = (consultasResult.data ?? []) as ConsultaRow[];
  const pacientes = pacientesRows;
  const pagamentos = pagamentosRows;
  const usuarios = usuariosRows;
  const psicologos = psicologosRows;

  const currentMonthConsultas = consultas.filter((consulta) => {
    const date = parseDate(pickString(consulta, ["data_consulta"]));
    return Boolean(date) && date! >= currentMonthStart && date! <= currentMonthEnd;
  });

  const missedAppointmentsCount = currentMonthConsultas.filter(
    (consulta) => pickString(consulta, ["status"]).toLowerCase() === "faltou",
  ).length;

  const activePatientsCount = pacientes.filter((paciente) => {
    const isActive = pickBoolean(paciente, ["ativo"]);
    return isActive !== false;
  }).length;

  const usersPsychologists = usuarios.filter(isPsychologistRow);
  const psychologistIdToName = new Map<string, string>();

  for (const row of [...usersPsychologists, ...psicologos]) {
    const identifier = getPsychologistIdentifier(row);
    if (!identifier || psychologistIdToName.has(identifier)) continue;
    psychologistIdToName.set(identifier, getPsychologistDisplayName(row));
  }

  const fallbackPsychologistIds = new Set<string>();
  for (const paciente of pacientes) {
    const psychologistId = pickString(paciente, ["psicologo_id"]);
    if (psychologistId) fallbackPsychologistIds.add(psychologistId);
  }
  for (const consulta of consultas) {
    const psychologistId = pickString(consulta, ["psicologo_id"]);
    if (psychologistId) fallbackPsychologistIds.add(psychologistId);
  }

  const psychologistCount = (() => {
    const knownIds = new Set(
      usersPsychologists
        .map(getPsychologistIdentifier)
        .filter(Boolean),
    );

    if (knownIds.size > 0) return knownIds.size;

    const fallbackIds = new Set(
      [...psicologos, ...usuarios]
        .map(getPsychologistIdentifier)
        .filter(Boolean),
    );

    if (fallbackIds.size > 0) return fallbackIds.size;
    return fallbackPsychologistIds.size;
  })();

  const appointmentChart = monthBuckets.map((bucket) => ({
    month: bucket.label,
    total: consultas.filter((consulta) => {
      const date = parseDate(pickString(consulta, ["data_consulta"]));
      return Boolean(date) && formatMonthKey(date!) === bucket.key;
    }).length,
  }));

  const professionalChart = Array.from(
    currentMonthConsultas.reduce((accumulator, consulta) => {
      const psychologistId = pickString(consulta, ["psicologo_id"]) || "sem-profissional";
      const current = accumulator.get(psychologistId);

      accumulator.set(psychologistId, {
        name: psychologistIdToName.get(psychologistId) || "Profissional nao identificado",
        value: (current?.value || 0) + 1,
      });

      return accumulator;
    }, new Map<string, { name: string; value: number }>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);

  const reliablePayments = pagamentos.filter((pagamento) => {
    const amount = getPossibleNumber(pagamento, ["valor", "amount", "valor_pago", "total", "preco"]);
    const date = parseDate(getPaymentDate(pagamento));

    return amount !== null && amount >= 0 && Boolean(date);
  });

  const revenueChart = monthBuckets.map((bucket) => ({
    month: bucket.label,
    value: reliablePayments
      .filter((pagamento) => isPaidPaymentStatus(pagamento.status))
      .filter((pagamento) => {
        const date = parseDate(getPaymentDate(pagamento));
        return Boolean(date) && formatMonthKey(date!) === bucket.key;
      })
      .reduce(
        (total, pagamento) =>
          total + (getPossibleNumber(pagamento, ["valor", "amount", "valor_pago", "total", "preco"]) || 0),
        0,
      ),
  }));

  const revenueThisMonth = reliablePayments.length > 0
    ? reliablePayments
        .filter((pagamento) => isPaidPaymentStatus(pagamento.status))
        .filter((pagamento) => {
          const date = parseDate(getPaymentDate(pagamento));
          return Boolean(date) && date! >= currentMonthStart && date! <= currentMonthEnd;
        })
        .reduce(
          (total, pagamento) =>
            total + (getPossibleNumber(pagamento, ["valor", "amount", "valor_pago", "total", "preco"]) || 0),
          0,
        )
    : null;

  return {
    adminName: context.adminName,
    clinicName: context.clinicName,
    currentMonthLabel: formatMonthLabel(now),
    psychologistCount,
    activePatientsCount,
    appointmentsThisMonth: currentMonthConsultas.length,
    revenueThisMonth,
    missedAppointmentsCount,
    occupancyRate: null,
    appointmentChart,
    professionalChart,
    revenueChart,
    hasAppointmentChartData: appointmentChart.some((item) => item.total > 0),
    hasProfessionalChartData: professionalChart.some((item) => item.value > 0),
    hasRevenueChartData: reliablePayments.length > 0 && revenueChart.some((item) => item.value > 0),
    hasClinicScope: true,
  };
}
