import { supabase } from "@/lib/supabase";
import { getCurrentAdminContext } from "@/services/currentAdmin";

type PaymentRow = {
  id: string;
  psicologo_id: string | null;
  paciente_id: string | null;
  valor: number | string | null;
  data_pagamento: string | null;
  created_at: string | null;
  status: string | null;
  forma_pagamento: string | null;
};

type UserRow = {
  id: string;
  nome: string | null;
  tipo_usuario: string | null;
  ativo: boolean | null;
};

type PatientRow = {
  id: string;
  nome: string | null;
};

type FinancialTableRow = {
  id: string;
  patientName: string;
  date: string | null;
  method: string | null;
  amount: number;
  statusLabel: string;
  statusTone: "success" | "warning" | "destructive" | "muted";
  monthKey: string | null;
};

export type AdminFinancialData = {
  adminName: string;
  clinicName: string;
  totalReceived: number;
  totalPending: number;
  psychologistsCount: number;
  transfersValue: number | null;
  professionalRevenueChart: Array<{ name: string; value: number }>;
  paymentMethodChart: Array<{ name: string; value: number; percentage: number }>;
  payments: FinancialTableRow[];
  monthOptions: Array<{ value: string; label: string }>;
  hasClinicScope: boolean;
  hasProfessionalRevenueData: boolean;
  hasPaymentMethodData: boolean;
  hasPaymentsData: boolean;
};

export const adminFinancialQueryKey = ["admin-financial"];

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatPaymentMethod(value: string | null | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) return null;

  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeRole(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeStatus(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getPossibleNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function extractPaymentDate(payment: PaymentRow) {
  return payment.data_pagamento || payment.created_at || null;
}

function extractMonthKey(payment: PaymentRow) {
  const date = parseDate(extractPaymentDate(payment));
  return date ? formatMonthKey(date) : null;
}

function getPaymentStatusMeta(status: string | null | undefined) {
  const normalized = normalizeStatus(status);

  if (["pago", "paid", "recebido", "completed", "concluido"].includes(normalized)) {
    return {
      bucket: "paid" as const,
      label: "Pago",
      tone: "success" as const,
    };
  }

  if (["pendente", "pending", "aberto", "open"].includes(normalized)) {
    return {
      bucket: "pending" as const,
      label: "Pendente",
      tone: "warning" as const,
    };
  }

  if (["cancelado", "cancelada", "cancelled", "canceled"].includes(normalized)) {
    return {
      bucket: "other" as const,
      label: "Cancelado",
      tone: "destructive" as const,
    };
  }

  if (!normalized) {
    return {
      bucket: "other" as const,
      label: "Nao informado",
      tone: "muted" as const,
    };
  }

  return {
    bucket: "other" as const,
    label: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    tone: "muted" as const,
  };
}

function isPsychologistUser(user: UserRow) {
  return ["psicologo", "psicologa", "psychologist", "therapist", "psi"].includes(normalizeRole(user.tipo_usuario));
}

function buildMonthOptions(payments: FinancialTableRow[]) {
  const monthKeys = Array.from(
    new Set(
      payments
        .map((payment) => payment.monthKey)
        .filter((monthKey): monthKey is string => Boolean(monthKey)),
    ),
  ).sort((left, right) => right.localeCompare(left));

  if (monthKeys.length === 0) {
    monthKeys.push(formatMonthKey(new Date()));
  }

  return monthKeys.map((monthKey) => ({
    value: monthKey,
    label: formatMonthLabel(monthKey),
  }));
}

export async function fetchAdminFinancialData(): Promise<AdminFinancialData> {
  const context = await getCurrentAdminContext();

  if (!context.clinicId) {
    return {
      adminName: context.adminName,
      clinicName: context.clinicName,
      totalReceived: 0,
      totalPending: 0,
      psychologistsCount: 0,
      transfersValue: null,
      professionalRevenueChart: [],
      paymentMethodChart: [],
      payments: [],
      monthOptions: [
        {
          value: formatMonthKey(new Date()),
          label: formatMonthLabel(formatMonthKey(new Date())),
        },
      ],
      hasClinicScope: false,
      hasProfessionalRevenueData: false,
      hasPaymentMethodData: false,
      hasPaymentsData: false,
    };
  }

  const [paymentsResult, usersResult, patientsResult] = await Promise.all([
    supabase
      .from("pagamentos")
      .select("id, psicologo_id, paciente_id, valor, data_pagamento, created_at, status, forma_pagamento")
      .eq("clinica_id", context.clinicId),
    supabase
      .from("usuarios")
      .select("id, nome, tipo_usuario, ativo")
      .eq("clinica_id", context.clinicId),
    supabase
      .from("pacientes")
      .select("id, nome")
      .eq("clinica_id", context.clinicId),
  ]);

  if (paymentsResult.error) throw paymentsResult.error;
  if (usersResult.error) throw usersResult.error;
  if (patientsResult.error) throw patientsResult.error;

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const users = (usersResult.data ?? []) as UserRow[];
  const patients = (patientsResult.data ?? []) as PatientRow[];

  const psychologistUsers = users.filter(isPsychologistUser);
  const psychologistNameById = new Map(
    psychologistUsers.map((user) => [user.id, user.nome?.trim() || "Profissional nao identificado"]),
  );
  const patientNameById = new Map(
    patients.map((patient) => [patient.id, patient.nome?.trim() || "Paciente nao identificado"]),
  );

  const normalizedPayments = payments
    .map((payment) => {
      const statusMeta = getPaymentStatusMeta(payment.status);
      const amount = getPossibleNumber(payment.valor);

      return {
        raw: payment,
        amount,
        monthKey: extractMonthKey(payment),
        date: extractPaymentDate(payment),
        method: formatPaymentMethod(payment.forma_pagamento),
        statusMeta,
      };
    })
    .sort((left, right) => {
      const leftTime = parseDate(left.date)?.getTime() ?? 0;
      const rightTime = parseDate(right.date)?.getTime() ?? 0;
      return rightTime - leftTime;
    });

  const totalReceived = normalizedPayments
    .filter((payment) => payment.statusMeta.bucket === "paid")
    .reduce((total, payment) => total + payment.amount, 0);

  const totalPending = normalizedPayments
    .filter((payment) => payment.statusMeta.bucket === "pending")
    .reduce((total, payment) => total + payment.amount, 0);

  const professionalRevenueMap = normalizedPayments
    .filter((payment) => payment.statusMeta.bucket === "paid" && payment.raw.psicologo_id)
    .reduce((accumulator, payment) => {
      const psychologistId = payment.raw.psicologo_id || "";
      if (!psychologistId) return accumulator;

      accumulator.set(psychologistId, (accumulator.get(psychologistId) || 0) + payment.amount);
      return accumulator;
    }, new Map<string, number>());

  const professionalRevenueChart = Array.from(professionalRevenueMap)
    .map(([id, value]) => ({
      name: psychologistNameById.get(id) || "Profissional nao identificado",
      value,
    }))
    .sort((left, right) => right.value - left.value);

  const paymentMethodCounts = normalizedPayments
    .filter((payment) => payment.method)
    .reduce((accumulator, payment) => {
      const method = payment.method || "";
      if (!method) return accumulator;

      accumulator.set(method, (accumulator.get(method) || 0) + 1);
      return accumulator;
    }, new Map<string, number>());

  const totalMethods = Array.from(paymentMethodCounts.values()).reduce((total, value) => total + value, 0);

  const paymentMethodChart = Array.from(paymentMethodCounts)
    .map(([name, value]) => ({
      name,
      value,
      percentage: totalMethods > 0 ? Math.round((value / totalMethods) * 100) : 0,
    }))
    .sort((left, right) => right.value - left.value);

  const financialTableRows: FinancialTableRow[] = normalizedPayments.map((payment) => ({
    id: payment.raw.id,
    patientName: payment.raw.paciente_id
      ? patientNameById.get(payment.raw.paciente_id) || "Paciente nao identificado"
      : "Paciente nao identificado",
    date: payment.date,
    method: payment.method,
    amount: payment.amount,
    statusLabel: payment.statusMeta.label,
    statusTone: payment.statusMeta.tone,
    monthKey: payment.monthKey,
  }));

  return {
    adminName: context.adminName,
    clinicName: context.clinicName,
    totalReceived,
    totalPending,
    psychologistsCount: psychologistUsers.length,
    transfersValue: null,
    professionalRevenueChart,
    paymentMethodChart,
    payments: financialTableRows,
    monthOptions: buildMonthOptions(financialTableRows),
    hasClinicScope: true,
    hasProfessionalRevenueData: professionalRevenueChart.length > 0,
    hasPaymentMethodData: paymentMethodChart.length > 0,
    hasPaymentsData: financialTableRows.length > 0,
  };
}
