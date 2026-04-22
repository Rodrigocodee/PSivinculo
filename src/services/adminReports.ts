import { supabase } from "@/lib/supabase";
import { getCurrentAdminContext } from "@/services/currentAdmin";

type ConsultaRow = {
  id: string;
  psicologo_id: string | null;
  data_consulta: string | null;
  status: string | null;
  created_at: string | null;
};

type PaymentRow = {
  id: string;
  psicologo_id: string | null;
  valor: number | string | null;
  data_pagamento: string | null;
  created_at: string | null;
  status: string | null;
};

type PatientRow = {
  id: string;
  created_at: string | null;
};

type UserRow = {
  id: string;
  nome: string | null;
};

type RankingRow = {
  id: string;
  name: string;
  appointments: number;
  revenue: number | null;
  occupancy: number | null;
};

type OptionalRowsResult<T> = {
  rows: T[];
  available: boolean;
};

export type AdminReportsData = {
  adminName: string;
  clinicName: string;
  currentMonthLabel: string;
  consultationsThisMonth: number;
  newPatientsThisMonth: number | null;
  revenueThisMonth: number | null;
  cancellationsThisMonth: number;
  appointmentChart: Array<{ month: string; total: number }>;
  revenueChart: Array<{ month: string; value: number }>;
  professionalRanking: RankingRow[];
  hasClinicScope: boolean;
  hasAppointmentChartData: boolean;
  hasRevenueChartData: boolean;
  hasNewPatientsMetric: boolean;
  hasRevenueMetric: boolean;
  hasProfessionalRankingData: boolean;
};

export const adminReportsQueryKey = ["admin-reports"];

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

function normalizeStatus(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isCancelledStatus(value: string | null | undefined) {
  return ["cancelada", "cancelado", "cancelled", "canceled"].includes(normalizeStatus(value));
}

function isPaidStatus(value: string | null | undefined) {
  return ["pago", "paid", "recebido", "completed", "concluido", "concluido"].includes(normalizeStatus(value));
}

function getPossibleNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
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

async function runOptionalRowsQuery<T>(
  factory: () => Promise<{ data: T[] | null; error: unknown }>,
): Promise<OptionalRowsResult<T>> {
  try {
    const result = await factory();

    if (result.error || !Array.isArray(result.data)) {
      return {
        rows: [],
        available: false,
      };
    }

    return {
      rows: result.data,
      available: true,
    };
  } catch {
    return {
      rows: [],
      available: false,
    };
  }
}

export async function fetchAdminReportsData(): Promise<AdminReportsData> {
  const context = await getCurrentAdminContext();
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const monthBuckets = buildMonthBuckets(now);
  const chartStart = monthBuckets[0]?.date || currentMonthStart;

  if (!context.clinicId) {
    return {
      adminName: context.adminName,
      clinicName: context.clinicName,
      currentMonthLabel: formatMonthLabel(now),
      consultationsThisMonth: 0,
      newPatientsThisMonth: null,
      revenueThisMonth: null,
      cancellationsThisMonth: 0,
      appointmentChart: monthBuckets.map((bucket) => ({ month: bucket.label, total: 0 })),
      revenueChart: monthBuckets.map((bucket) => ({ month: bucket.label, value: 0 })),
      professionalRanking: [],
      hasClinicScope: false,
      hasAppointmentChartData: false,
      hasRevenueChartData: false,
      hasNewPatientsMetric: false,
      hasRevenueMetric: false,
      hasProfessionalRankingData: false,
    };
  }

  const consultationsResult = await supabase
    .from("consultas")
    .select("id, psicologo_id, data_consulta, status, created_at")
    .eq("clinica_id", context.clinicId)
    .gte("data_consulta", chartStart.toISOString())
    .lte("data_consulta", currentMonthEnd.toISOString())
    .order("data_consulta", { ascending: true });

  if (consultationsResult.error) {
    throw consultationsResult.error;
  }

  const [patientsResult, paymentsResult, usersResult] = await Promise.all([
    runOptionalRowsQuery<PatientRow>(() =>
      supabase
        .from("pacientes")
        .select("id, created_at")
        .eq("clinica_id", context.clinicId),
    ),
    runOptionalRowsQuery<PaymentRow>(() =>
      supabase
        .from("pagamentos")
        .select("id, psicologo_id, valor, data_pagamento, created_at, status")
        .eq("clinica_id", context.clinicId)
        .order("data_pagamento", { ascending: true }),
    ),
    runOptionalRowsQuery<UserRow>(() =>
      supabase
        .from("usuarios")
        .select("id, nome")
        .eq("clinica_id", context.clinicId),
    ),
  ]);

  const consultations = (consultationsResult.data ?? []) as ConsultaRow[];
  const patients = patientsResult.rows;
  const payments = paymentsResult.rows;
  const users = usersResult.rows;

  const currentMonthConsultations = consultations.filter((consultation) => {
    const date = parseDate(consultation.data_consulta);
    return Boolean(date) && date! >= currentMonthStart && date! <= currentMonthEnd;
  });

  const cancellationsThisMonth = currentMonthConsultations.filter((consultation) =>
    isCancelledStatus(consultation.status),
  ).length;

  const patientsCreatedAtReliable =
    patientsResult.available &&
    (patients.length === 0 || patients.some((patient) => Boolean(parseDate(patient.created_at))));

  const newPatientsThisMonth = patientsCreatedAtReliable
    ? patients.filter((patient) => {
        const date = parseDate(patient.created_at);
        return Boolean(date) && date! >= currentMonthStart && date! <= currentMonthEnd;
      }).length
    : null;

  const paymentsWithReliableData = payments.filter((payment) => {
    const date = parseDate(payment.data_pagamento || payment.created_at);
    const amount = getPossibleNumber(payment.valor);

    return Boolean(date) && amount !== null;
  });

  const hasRevenueMetric = paymentsResult.available;

  const paidPayments = paymentsWithReliableData.filter((payment) => isPaidStatus(payment.status));
  const paidPaymentsInChartRange = paidPayments.filter((payment) => {
    const date = parseDate(payment.data_pagamento || payment.created_at);
    return Boolean(date) && date! >= chartStart && date! <= currentMonthEnd;
  });
  const paidPaymentsThisMonth = paidPayments.filter((payment) => {
    const date = parseDate(payment.data_pagamento || payment.created_at);
    return Boolean(date) && date! >= currentMonthStart && date! <= currentMonthEnd;
  });

  const revenueThisMonth = hasRevenueMetric
    ? paidPaymentsThisMonth.reduce((total, payment) => total + (getPossibleNumber(payment.valor) || 0), 0)
    : null;

  const appointmentChart = monthBuckets.map((bucket) => ({
    month: bucket.label,
    total: consultations.filter((consultation) => {
      const date = parseDate(consultation.data_consulta);
      return Boolean(date) && formatMonthKey(date!) === bucket.key;
    }).length,
  }));

  const revenueChart = monthBuckets.map((bucket) => ({
    month: bucket.label,
    value: hasRevenueMetric
      ? paidPaymentsInChartRange
          .filter((payment) => {
            const date = parseDate(payment.data_pagamento || payment.created_at);
            return Boolean(date) && formatMonthKey(date!) === bucket.key;
          })
          .reduce((total, payment) => total + (getPossibleNumber(payment.valor) || 0), 0)
      : 0,
  }));

  const userNameById = new Map(
    users.map((user) => [
      user.id,
      pickString(user as unknown as Record<string, unknown>, ["nome"]) || "Profissional nao identificado",
    ]),
  );

  const currentMonthProfessionalConsultations = currentMonthConsultations.filter(
    (consultation) => !isCancelledStatus(consultation.status),
  );

  const professionalRevenueById = (() => {
    const reliableProfessionalPayments = paidPaymentsThisMonth.filter((payment) => payment.psicologo_id);

    if (!hasRevenueMetric || reliableProfessionalPayments.length === 0) {
      return {
        available: false,
        values: new Map<string, number>(),
      };
    }

    const values = reliableProfessionalPayments.reduce((accumulator, payment) => {
      const psychologistId = payment.psicologo_id || "";
      if (!psychologistId) return accumulator;

      accumulator.set(
        psychologistId,
        (accumulator.get(psychologistId) || 0) + (getPossibleNumber(payment.valor) || 0),
      );

      return accumulator;
    }, new Map<string, number>());

    return {
      available: values.size > 0,
      values,
    };
  })();

  const professionalRanking = Array.from(
    currentMonthProfessionalConsultations.reduce((accumulator, consultation) => {
      const psychologistId = consultation.psicologo_id || "sem-profissional";
      const current = accumulator.get(psychologistId);

      accumulator.set(psychologistId, {
        id: psychologistId,
        name: userNameById.get(psychologistId) || "Profissional nao identificado",
        appointments: (current?.appointments || 0) + 1,
        revenue: professionalRevenueById.available
          ? professionalRevenueById.values.get(psychologistId) || 0
          : null,
        occupancy: null,
      });

      return accumulator;
    }, new Map<string, RankingRow>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => {
      if (right.appointments !== left.appointments) {
        return right.appointments - left.appointments;
      }

      const rightRevenue = right.revenue ?? -1;
      const leftRevenue = left.revenue ?? -1;

      if (rightRevenue !== leftRevenue) {
        return rightRevenue - leftRevenue;
      }

      return left.name.localeCompare(right.name, "pt-BR");
    });

  return {
    adminName: context.adminName,
    clinicName: context.clinicName,
    currentMonthLabel: formatMonthLabel(now),
    consultationsThisMonth: currentMonthConsultations.length,
    newPatientsThisMonth,
    revenueThisMonth,
    cancellationsThisMonth,
    appointmentChart,
    revenueChart,
    professionalRanking,
    hasClinicScope: true,
    hasAppointmentChartData: appointmentChart.some((item) => item.total > 0),
    hasRevenueChartData: hasRevenueMetric && revenueChart.some((item) => item.value > 0),
    hasNewPatientsMetric: patientsCreatedAtReliable,
    hasRevenueMetric,
    hasProfessionalRankingData: professionalRanking.length > 0,
  };
}
