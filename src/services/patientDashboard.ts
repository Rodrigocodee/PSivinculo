import { supabase } from "@/lib/supabase";
import { getCurrentPaciente, type CurrentPacienteContext } from "@/services/currentPatient";
import { resolvePsychologistNameById } from "@/services/psychologistLookup";

type DashboardConsultaRow = Record<string, unknown>;

export type PatientDashboardAppointment = {
  id: string;
  dateTime: string | null;
  status: string;
  sessionType: string | null;
  psychologistName: string;
};

export type PatientDashboardPayment = {
  id: string;
  dateTime: string | null;
  psychologistName: string;
  amount: number | null;
  status: string;
  paymentUrl: string | null;
};

export type PatientDashboardData = {
  patient: CurrentPacienteContext;
  nextAppointment: PatientDashboardAppointment | null;
  pendingPayments: PatientDashboardPayment[];
  recentHistory: PatientDashboardAppointment[];
  hasLinkedPatientRecord: boolean;
};

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getPossibleNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string") {
      const normalized = value.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return null;
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isCancelledAppointmentStatus(value: unknown) {
  return ["cancelada", "recusada"].includes(normalizeStatus(value));
}

function isAwaitingPaymentStatus(value: unknown) {
  return normalizeStatus(value) === "aguardando_pagamento";
}

function parseValidDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAppointmentSessionType(consulta: DashboardConsultaRow) {
  return (
    pickString(consulta, [
      "modalidade_consulta",
      "tipo_sessao",
      "session_type",
      "tipo_atendimento",
      "modalidade",
      "type",
    ]) || null
  );
}

function getConsultationPaymentUrl(consulta: DashboardConsultaRow) {
  return (
    pickString(consulta, ["asaas_invoice_url"]) ||
    pickString(consulta, ["asaas_bank_slip_url"]) ||
    null
  );
}

function mapAppointment(
  consulta: DashboardConsultaRow,
  psychologistName: string,
): PatientDashboardAppointment {
  return {
    id: pickString(consulta, ["id"]) || crypto.randomUUID(),
    dateTime: pickString(consulta, ["data_consulta"]) || null,
    status: pickString(consulta, ["status"]) || "",
    sessionType: getAppointmentSessionType(consulta),
    psychologistName,
  };
}

function mapPendingPayment(
  consulta: DashboardConsultaRow,
  psychologistName: string,
): PatientDashboardPayment {
  return {
    id: pickString(consulta, ["id"]) || crypto.randomUUID(),
    dateTime: pickString(consulta, ["data_consulta"]) || null,
    psychologistName,
    amount: getPossibleNumber(consulta, ["valor_consulta"]),
    status: pickString(consulta, ["status_pagamento"]) || "",
    paymentUrl: getConsultationPaymentUrl(consulta),
  };
}

function sortRecentHistory(consultas: DashboardConsultaRow[]) {
  return consultas
    .slice()
    .sort((left, right) => {
      const leftStatus = pickString(left, ["status"]).toLowerCase();
      const rightStatus = pickString(right, ["status"]).toLowerCase();
      const leftWeight = leftStatus === "realizada" ? 0 : 1;
      const rightWeight = rightStatus === "realizada" ? 0 : 1;

      if (leftWeight !== rightWeight) return leftWeight - rightWeight;

      const leftTime = parseValidDate(pickString(left, ["data_consulta"]))?.getTime() ?? 0;
      const rightTime = parseValidDate(pickString(right, ["data_consulta"]))?.getTime() ?? 0;

      return rightTime - leftTime;
    });
}

export async function fetchPatientDashboardData(): Promise<PatientDashboardData> {
  const patient = await getCurrentPaciente();

  if (!patient.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  if (!patient.patientId) {
    return {
      patient,
      nextAppointment: null,
      pendingPayments: [],
      recentHistory: [],
      hasLinkedPatientRecord: patient.isLinked,
    };
  }

  const nowIso = new Date().toISOString();

  const [nextAppointmentResult, recentHistoryResult, pendingPaymentsResult] = await Promise.all([
    supabase
      .from("consultas")
      .select("*")
      .eq("paciente_id", patient.patientId)
      .gte("data_consulta", nowIso)
      .order("data_consulta", { ascending: true })
      .limit(8),
    supabase
      .from("consultas")
      .select("*")
      .eq("paciente_id", patient.patientId)
      .lte("data_consulta", nowIso)
      .order("data_consulta", { ascending: false })
      .limit(12),
    supabase
      .from("consultas")
      .select("*")
      .eq("paciente_id", patient.patientId)
      .eq("status_pagamento", "aguardando_pagamento")
      .order("data_consulta", { ascending: true })
      .limit(12),
  ]);

  if (nextAppointmentResult.error) throw nextAppointmentResult.error;
  if (recentHistoryResult.error) throw recentHistoryResult.error;
  if (pendingPaymentsResult.error) throw pendingPaymentsResult.error;

  const nextAppointmentRows = ((nextAppointmentResult.data ?? []) as DashboardConsultaRow[]).filter(
    (consulta) => !isCancelledAppointmentStatus(consulta.status),
  );
  const nextAppointmentRow = nextAppointmentRows[0] ?? null;
  const recentHistoryRows = ((recentHistoryResult.data ?? []) as DashboardConsultaRow[]).filter(
    (consulta) => !isCancelledAppointmentStatus(consulta.status),
  );
  const pendingPaymentRows = ((pendingPaymentsResult.data ?? []) as DashboardConsultaRow[])
    .filter((consulta) => !isCancelledAppointmentStatus(consulta.status))
    .filter((consulta) => isAwaitingPaymentStatus(consulta.status_pagamento))
    .filter((consulta) => Boolean(getConsultationPaymentUrl(consulta)));

  const psychologistIds = new Set<string>(
    [patient.psychologistId, pickString(nextAppointmentRow, ["psicologo_id"])]
      .concat(recentHistoryRows.map((consulta) => pickString(consulta, ["psicologo_id"])))
      .concat(pendingPaymentRows.map((consulta) => pickString(consulta, ["psicologo_id"])))
      .filter(Boolean),
  );

  const psychologistNameById = new Map<string, string>();

  await Promise.all(
    Array.from(psychologistIds).map(async (psychologistId) => {
      const psychologistName = await resolvePsychologistNameById(
        psychologistId,
        pickString(
          (patient.user?.user_metadata || {}) as Record<string, unknown>,
          ["psychologist_name"],
        ),
      );

      psychologistNameById.set(psychologistId, psychologistName);
    }),
  );

  const nextAppointment = nextAppointmentRow
    ? mapAppointment(
        nextAppointmentRow,
        psychologistNameById.get(pickString(nextAppointmentRow, ["psicologo_id"])) ||
          "Psicologo(a)",
      )
    : null;

  return {
    patient,
    nextAppointment,
    pendingPayments: pendingPaymentRows.map((consulta) =>
      mapPendingPayment(
        consulta,
        psychologistNameById.get(pickString(consulta, ["psicologo_id"])) || "Psicologo(a)",
      ),
    ),
    recentHistory: sortRecentHistory(recentHistoryRows)
      .slice(0, 4)
      .map((consulta) =>
        mapAppointment(
          consulta,
          psychologistNameById.get(pickString(consulta, ["psicologo_id"])) || "Psicologo(a)",
        ),
      ),
    hasLinkedPatientRecord: patient.isLinked,
  };
}
