import { supabase } from "@/lib/supabase";
import { getCurrentPsychologistContext } from "@/services/currentPsychologist";
import {
  normalizeAppointmentModality,
  type AppointmentModality,
} from "@/services/psychologistConsultationSettings";

const PSYCHOLOGIST_CONSULTATION_SELECT = `
  id,
  paciente_id,
  psicologo_id,
  data_consulta,
  data_consulta_solicitada_original,
  respondida_em,
  status,
  observacoes,
  modalidade_consulta,
  modalidade,
  valor_consulta,
  duracao_consulta_min,
  local_presencial,
  status_pagamento,
  asaas_payment_id,
  asaas_invoice_url,
  asaas_bank_slip_url,
  pacientes (
    id,
    nome
  )
`;

export type PsychologistConsultationPaymentStatus =
  | "nao_gerado"
  | "aguardando_pagamento"
  | "pago"
  | "vencido"
  | "cancelado"
  | "erro";

export type PsychologistFinancialStatusFilter =
  | "all"
  | PsychologistConsultationPaymentStatus;

export type PsychologistAgendaMode = "day" | "week" | "month";

export const PSYCHOLOGIST_PAYMENT_STATUS_LABELS: Record<
  PsychologistConsultationPaymentStatus,
  string
> = {
  nao_gerado: "Sem cobranca",
  aguardando_pagamento: "Pagamento pendente",
  pago: "Pago",
  vencido: "Pagamento vencido",
  cancelado: "Pagamento cancelado",
  erro: "Erro no pagamento",
};

type RawConsultationRow = Record<string, unknown>;

type PsychologistConsultationIdentity = {
  userId: string | null;
  userAuthId: string | null;
  consultationPsychologistIds: string[];
};

export type PsychologistConsultationRecord = {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string | null;
  consultationDateTime: string;
  consultationDateKey: string;
  consultationMonthKey: string | null;
  consultationTimeLabel: string;
  requestedDateTimeOriginal: string | null;
  respondedAt: string | null;
  consultationStatus: string;
  modality: AppointmentModality | null;
  consultationValue: number | null;
  durationMinutes: number;
  roomLabel: string;
  notes: string;
  paymentStatus: PsychologistConsultationPaymentStatus;
  asaasPaymentId: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  paymentLink: string | null;
  billingTypeLabel: "Asaas Split" | "Externo/Sem cobranca";
  descriptionLabel: string;
  hasGeneratedCharge: boolean;
};

export type PsychologistAgendaData = {
  mode: PsychologistAgendaMode;
  referenceDateKey: string;
  periodStartKey: string;
  periodEndKey: string;
  consultations: PsychologistConsultationRecord[];
};

export type PsychologistFinancialPatientOption = {
  id: string;
  nome: string;
};

export type PsychologistFinancialSummaryData = {
  selectedMonth: string;
  monthOptions: Array<{ value: string; label: string }>;
  patients: PsychologistFinancialPatientOption[];
  consultations: PsychologistConsultationRecord[];
  summary: {
    receivedAmount: number;
    pendingAmount: number;
    paidCount: number;
    billedCount: number;
  };
};

export type PsychologistReceivablesData = {
  selectedMonth: string;
  monthOptions: Array<{ value: string; label: string }>;
  totalReceivedAmount: number;
  splitConfiguredPercentage: number;
  receivables: PsychologistConsultationRecord[];
};

export type PsychologistReportsData = {
  selectedMonth: string;
  monthOptions: Array<{ value: string; label: string }>;
  summary: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    missedAppointments: number;
    activePatients: number;
  };
  charts: {
    appointments: Array<{ month: string; total: number }>;
    revenue: Array<{ month: string; value: number }>;
    results: Array<{ name: string; value: number; color: string }>;
  };
};

function pickString(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickNumber(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const normalizedValue = value.trim();
      let parsedValue = Number(normalizedValue);

      if (
        !Number.isFinite(parsedValue) &&
        /^\d{1,3}(\.\d{3})*,\d+$/.test(normalizedValue)
      ) {
        parsedValue = Number(
          normalizedValue.replace(/\./g, "").replace(",", "."),
        );
      }

      if (!Number.isFinite(parsedValue) && /^\d+,\d+$/.test(normalizedValue)) {
        parsedValue = Number(normalizedValue.replace(",", "."));
      }

      if (Number.isFinite(parsedValue)) {
        return Number(parsedValue.toFixed(2));
      }
    }
  }

  return null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() || "")
        .filter((value) => value.length > 0),
    ),
  );
}

function parseValidDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date: Date) {
  return formatDateKey(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1, 3);
}

function normalizeConsultationStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePaymentStatus(
  value: unknown,
): PsychologistConsultationPaymentStatus {
  if (typeof value !== "string") {
    return "nao_gerado";
  }

  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue === "nao_gerado" ||
    normalizedValue === "aguardando_pagamento" ||
    normalizedValue === "pago" ||
    normalizedValue === "vencido" ||
    normalizedValue === "cancelado" ||
    normalizedValue === "erro"
  ) {
    return normalizedValue;
  }

  return "nao_gerado";
}

function getStartOfWeek(referenceDate: Date) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getEndOfWeek(referenceDate: Date) {
  const end = getStartOfWeek(referenceDate);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getStartOfMonth(referenceDate: Date) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
}

function getEndOfMonth(referenceDate: Date) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function formatDateTimeRangeValue(date: Date, isEnd = false) {
  const dateKey = formatDateKey(date);
  return `${dateKey}T${isEnd ? "23:59:59" : "00:00:00"}`;
}

function resolveRoomLabel(
  consultationStatus: string,
  modality: AppointmentModality | null,
  presentialLocation: string | null,
) {
  if (modality === "presencial" && presentialLocation) {
    return presentialLocation;
  }

  if (modality === "presencial") return "Presencial";
  if (modality === "online") return "Online";
  if (consultationStatus === "solicitada") return "A confirmar";
  if (consultationStatus === "contraproposta") return "Aguardando paciente";
  return "Sala 1";
}

function resolveDescriptionLabel(
  consultationStatus: string,
  modality: AppointmentModality | null,
  notes: string,
) {
  if (notes) return notes;
  if (consultationStatus === "solicitada") return "Solicitacao de horario";
  if (consultationStatus === "contraproposta") return "Contraproposta de horario";
  if (modality === "presencial") return "Consulta presencial";
  if (modality === "online") return "Consulta online";
  return "Sessao individual";
}

function isGeneratedChargeRecord(
  paymentStatus: PsychologistConsultationPaymentStatus,
  asaasPaymentId: string | null,
  invoiceUrl: string | null,
  bankSlipUrl: string | null,
) {
  if (paymentStatus !== "nao_gerado") return true;
  return Boolean(asaasPaymentId || invoiceUrl || bankSlipUrl);
}

function normalizeConsultationRecord(
  consultation: RawConsultationRow,
): PsychologistConsultationRecord {
  const consultationDateTime =
    pickString(consultation, ["data_consulta"]) || "";
  const consultationDate = parseValidDate(consultationDateTime);
  const consultationStatus = normalizeConsultationStatus(consultation.status);
  const modality = normalizeAppointmentModality(
    pickString(consultation, ["modalidade_consulta", "modalidade"]) || null,
  );
  const notes = pickString(consultation, ["observacoes"]);
  const paymentStatus = normalizePaymentStatus(consultation.status_pagamento);
  const invoiceUrl = pickString(consultation, ["asaas_invoice_url"]) || null;
  const bankSlipUrl =
    pickString(consultation, ["asaas_bank_slip_url"]) || null;
  const asaasPaymentId = pickString(consultation, ["asaas_payment_id"]) || null;
  const hasGeneratedCharge = isGeneratedChargeRecord(
    paymentStatus,
    asaasPaymentId,
    invoiceUrl,
    bankSlipUrl,
  );
  const patientsRecord =
    consultation.pacientes &&
    typeof consultation.pacientes === "object" &&
    !Array.isArray(consultation.pacientes)
      ? (consultation.pacientes as Record<string, unknown>)
      : null;

  return {
    id: pickString(consultation, ["id"]) || "",
    patientId: pickString(consultation, ["paciente_id"]) || "",
    patientName: pickString(patientsRecord, ["nome"]) || "Paciente",
    psychologistId: pickString(consultation, ["psicologo_id"]) || null,
    consultationDateTime,
    consultationDateKey: consultationDate ? formatDateKey(consultationDate) : "",
    consultationMonthKey: consultationDate ? formatMonthKey(consultationDate) : null,
    consultationTimeLabel: consultationDate
      ? consultationDate.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--",
    requestedDateTimeOriginal:
      pickString(consultation, ["data_consulta_solicitada_original"]) || null,
    respondedAt: pickString(consultation, ["respondida_em"]) || null,
    consultationStatus,
    modality,
    consultationValue: pickNumber(consultation, ["valor_consulta"]),
    durationMinutes:
      pickNumber(consultation, ["duracao_consulta_min", "duracao_minutos"]) ?? 50,
    roomLabel: resolveRoomLabel(
      consultationStatus,
      modality,
      pickString(consultation, ["local_presencial"]) || null,
    ),
    notes,
    paymentStatus,
    asaasPaymentId,
    invoiceUrl,
    bankSlipUrl,
    paymentLink: invoiceUrl || bankSlipUrl || null,
    billingTypeLabel: hasGeneratedCharge
      ? "Asaas Split"
      : "Externo/Sem cobranca",
    descriptionLabel: resolveDescriptionLabel(
      consultationStatus,
      modality,
      notes,
    ),
    hasGeneratedCharge,
  };
}

function buildMonthOptions(
  consultations: PsychologistConsultationRecord[],
  extraMonthKeys: string[] = [],
) {
  const currentMonthKey = formatMonthKey(new Date());
  const monthKeys = Array.from(
    new Set(
      [currentMonthKey, ...extraMonthKeys, ...consultations]
        .map((value) =>
          typeof value === "string" ? value : value.consultationMonthKey,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => b.localeCompare(a));

  return monthKeys.map((monthKey) => ({
    value: monthKey,
    label: formatMonthLabel(monthKey),
  }));
}

function resolveSelectedMonth(
  requestedMonthKey: string | null | undefined,
  monthOptions: Array<{ value: string; label: string }>,
) {
  const normalizedRequestedMonth = requestedMonthKey?.trim() || "";
  const currentMonthKey = formatMonthKey(new Date());

  if (
    normalizedRequestedMonth &&
    monthOptions.some((option) => option.value === normalizedRequestedMonth)
  ) {
    return normalizedRequestedMonth;
  }

  if (monthOptions.some((option) => option.value === currentMonthKey)) {
    return currentMonthKey;
  }

  return monthOptions[0]?.value || currentMonthKey;
}

function filterConsultationsByMonth(
  consultations: PsychologistConsultationRecord[],
  monthKey: string,
) {
  return consultations.filter(
    (consultation) => consultation.consultationMonthKey === monthKey,
  );
}

function filterConsultationsByPaymentStatus(
  consultations: PsychologistConsultationRecord[],
  paymentStatus: PsychologistFinancialStatusFilter,
) {
  if (paymentStatus === "all") return consultations;

  return consultations.filter(
    (consultation) => consultation.paymentStatus === paymentStatus,
  );
}

function sumConsultationsByPaymentStatus(
  consultations: PsychologistConsultationRecord[],
  paymentStatus: PsychologistConsultationPaymentStatus,
) {
  return consultations
    .filter((consultation) => consultation.paymentStatus === paymentStatus)
    .reduce(
      (total, consultation) => total + (consultation.consultationValue ?? 0),
      0,
    );
}

function sortConsultationsByDateDesc(
  consultations: PsychologistConsultationRecord[],
) {
  return consultations.slice().sort((left, right) => {
    const leftTime =
      parseValidDate(left.consultationDateTime)?.getTime() ?? Number.MIN_SAFE_INTEGER;
    const rightTime =
      parseValidDate(right.consultationDateTime)?.getTime() ??
      Number.MIN_SAFE_INTEGER;

    return rightTime - leftTime;
  });
}

function buildPatientOptions(consultations: PsychologistConsultationRecord[]) {
  const patientsMap = new Map<string, string>();

  for (const consultation of consultations) {
    if (!consultation.patientId) continue;
    if (patientsMap.has(consultation.patientId)) continue;
    patientsMap.set(consultation.patientId, consultation.patientName);
  }

  return Array.from(patientsMap.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"));
}

function buildRollingMonthKeys(referenceMonthKey: string, size: number) {
  const [year, month] = referenceMonthKey.split("-").map(Number);
  const referenceDate = new Date(year, (month || 1) - 1, 1);

  return Array.from({ length: size }, (_, index) => {
    const monthDate = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() - (size - 1 - index),
      1,
    );
    return formatMonthKey(monthDate);
  });
}

function getConsultationOutcome(
  consultation: PsychologistConsultationRecord,
) {
  if (
    consultation.consultationStatus === "faltou" ||
    consultation.consultationStatus === "ausente"
  ) {
    return "missed";
  }

  if (
    consultation.consultationStatus === "cancelada" ||
    consultation.paymentStatus === "cancelado"
  ) {
    return "cancelled";
  }

  if (
    consultation.consultationStatus === "realizada" ||
    consultation.paymentStatus === "pago"
  ) {
    return "completed";
  }

  return "other";
}

function logFinancialSnapshot(
  identity: PsychologistConsultationIdentity,
  consultations: PsychologistConsultationRecord[],
  period: string,
) {
  if (!import.meta.env.DEV) return;

  console.info("[Psivinculo][financeiro-psi]", {
    "usuario.id": identity.userId,
    "usuario.auth_id": identity.userAuthId,
    totalConsultasEncontradas: consultations.length,
    periodo: period,
    somaPago: sumConsultationsByPaymentStatus(consultations, "pago"),
    somaPendente: sumConsultationsByPaymentStatus(
      consultations,
      "aguardando_pagamento",
    ),
  });
}

async function resolvePsychologistConsultationIdentity() {
  const context = await getCurrentPsychologistContext();
  const usuariosRow = context.usuariosRecord?.row || null;
  const recordRow = context.record?.row || null;

  return {
    userId:
      pickString(usuariosRow, ["id"]) ||
      pickString(recordRow, ["id"]) ||
      context.user?.id ||
      null,
    userAuthId:
      pickString(usuariosRow, ["auth_id"]) || context.user?.id || null,
    consultationPsychologistIds: uniqueNonEmpty([
      context.psychologistId,
      context.user?.id,
      pickString(usuariosRow, ["id"]),
      pickString(usuariosRow, ["auth_id"]),
      pickString(recordRow, ["id"]),
      pickString(recordRow, ["auth_id"]),
      pickString(recordRow, ["psicologo_id"]),
      pickString(recordRow, ["user_id"]),
    ]),
  } satisfies PsychologistConsultationIdentity;
}

async function fetchPsychologistConsultations(input?: {
  startDateTime?: string;
  endDateTime?: string;
}) {
  const identity = await resolvePsychologistConsultationIdentity();

  if (identity.consultationPsychologistIds.length === 0) {
    throw new Error("Nao foi possivel identificar o psicologo autenticado.");
  }

  let query = supabase
    .from("consultas")
    .select(PSYCHOLOGIST_CONSULTATION_SELECT)
    .in("psicologo_id", identity.consultationPsychologistIds)
    .order("data_consulta", { ascending: true });

  if (input?.startDateTime) {
    query = query.gte("data_consulta", input.startDateTime);
  }

  if (input?.endDateTime) {
    query = query.lte("data_consulta", input.endDateTime);
  }

  const { data, error } = await query;

  if (error) throw error;

  return {
    identity,
    consultations: ((data ?? []) as RawConsultationRow[]).map(
      normalizeConsultationRecord,
    ),
  };
}

export async function getPsychologistAgendaData(input: {
  mode: PsychologistAgendaMode;
  referenceDate: string;
}) {
  const referenceDate =
    parseValidDate(`${input.referenceDate}T12:00:00`) ?? new Date();

  let periodStart = new Date(referenceDate);
  let periodEnd = new Date(referenceDate);

  if (input.mode === "week") {
    periodStart = getStartOfWeek(referenceDate);
    periodEnd = getEndOfWeek(referenceDate);
  } else if (input.mode === "month") {
    periodStart = getStartOfMonth(referenceDate);
    periodEnd = getEndOfMonth(referenceDate);
  }

  const { identity, consultations } = await fetchPsychologistConsultations({
    startDateTime: formatDateTimeRangeValue(periodStart),
    endDateTime: formatDateTimeRangeValue(periodEnd, true),
  });

  const data = {
    mode: input.mode,
    referenceDateKey: formatDateKey(referenceDate),
    periodStartKey: formatDateKey(periodStart),
    periodEndKey: formatDateKey(periodEnd),
    consultations,
  } satisfies PsychologistAgendaData;

  logFinancialSnapshot(
    identity,
    consultations,
    `${input.mode}:${data.periodStartKey}:${data.periodEndKey}`,
  );

  return data;
}

export async function getPsychologistFinancialSummary(input?: {
  monthKey?: string | null;
  paymentStatus?: PsychologistFinancialStatusFilter;
}) {
  const { identity, consultations } = await fetchPsychologistConsultations();
  const monthOptions = buildMonthOptions(consultations, [
    input?.monthKey?.trim() || "",
  ]);
  const selectedMonth = resolveSelectedMonth(input?.monthKey, monthOptions);
  const monthConsultations = filterConsultationsByMonth(
    consultations,
    selectedMonth,
  );
  const filteredConsultations = filterConsultationsByPaymentStatus(
    monthConsultations,
    input?.paymentStatus ?? "all",
  );

  logFinancialSnapshot(identity, monthConsultations, selectedMonth);

  return {
    selectedMonth,
    monthOptions,
    patients: buildPatientOptions(consultations),
    consultations: sortConsultationsByDateDesc(filteredConsultations),
    summary: {
      receivedAmount: sumConsultationsByPaymentStatus(monthConsultations, "pago"),
      pendingAmount: sumConsultationsByPaymentStatus(
        monthConsultations,
        "aguardando_pagamento",
      ),
      paidCount: monthConsultations.filter(
        (consultation) => consultation.paymentStatus === "pago",
      ).length,
      billedCount: monthConsultations.filter(
        (consultation) => consultation.hasGeneratedCharge,
      ).length,
    },
  } satisfies PsychologistFinancialSummaryData;
}

export async function getPsychologistReceivables(input?: {
  monthKey?: string | null;
}) {
  const { identity, consultations } = await fetchPsychologistConsultations();
  const monthOptions = buildMonthOptions(consultations, [
    input?.monthKey?.trim() || "",
  ]);
  const selectedMonth = resolveSelectedMonth(input?.monthKey, monthOptions);
  const monthConsultations = filterConsultationsByMonth(
    consultations,
    selectedMonth,
  );
  const receivables = sortConsultationsByDateDesc(
    monthConsultations.filter(
      (consultation) =>
        consultation.hasGeneratedCharge ||
        consultation.paymentStatus === "pago" ||
        consultation.paymentStatus === "aguardando_pagamento" ||
        consultation.paymentStatus === "vencido" ||
        consultation.paymentStatus === "cancelado" ||
        consultation.paymentStatus === "erro",
    ),
  );

  logFinancialSnapshot(identity, monthConsultations, `recebimentos:${selectedMonth}`);

  return {
    selectedMonth,
    monthOptions,
    totalReceivedAmount: sumConsultationsByPaymentStatus(monthConsultations, "pago"),
    splitConfiguredPercentage: 95,
    receivables,
  } satisfies PsychologistReceivablesData;
}

export async function getPsychologistReports(input?: {
  monthKey?: string | null;
}) {
  const { identity, consultations } = await fetchPsychologistConsultations();
  const monthOptions = buildMonthOptions(consultations, [
    input?.monthKey?.trim() || "",
  ]);
  const selectedMonth = resolveSelectedMonth(input?.monthKey, monthOptions);
  const monthConsultations = filterConsultationsByMonth(
    consultations,
    selectedMonth,
  );
  const rollingMonthKeys = buildRollingMonthKeys(selectedMonth, 12);

  logFinancialSnapshot(identity, monthConsultations, `relatorios:${selectedMonth}`);

  return {
    selectedMonth,
    monthOptions,
    summary: {
      totalAppointments: monthConsultations.length,
      completedAppointments: monthConsultations.filter(
        (consultation) => getConsultationOutcome(consultation) === "completed",
      ).length,
      cancelledAppointments: monthConsultations.filter(
        (consultation) => getConsultationOutcome(consultation) === "cancelled",
      ).length,
      missedAppointments: monthConsultations.filter(
        (consultation) => getConsultationOutcome(consultation) === "missed",
      ).length,
      activePatients: new Set(
        monthConsultations
          .map((consultation) => consultation.patientId)
          .filter(Boolean),
      ).size,
    },
    charts: {
      appointments: rollingMonthKeys.map((monthKey) => ({
        month: formatShortMonthLabel(monthKey),
        total: consultations.filter(
          (consultation) => consultation.consultationMonthKey === monthKey,
        ).length,
      })),
      revenue: rollingMonthKeys.map((monthKey) => ({
        month: formatShortMonthLabel(monthKey),
        value: consultations
          .filter(
            (consultation) =>
              consultation.consultationMonthKey === monthKey &&
              consultation.paymentStatus === "pago",
          )
          .reduce(
            (total, consultation) =>
              total + (consultation.consultationValue ?? 0),
            0,
          ),
      })),
      results: [
        {
          name: "Realizadas",
          value: monthConsultations.filter(
            (consultation) => getConsultationOutcome(consultation) === "completed",
          ).length,
          color: "hsl(155, 50%, 45%)",
        },
        {
          name: "Canceladas",
          value: monthConsultations.filter(
            (consultation) => getConsultationOutcome(consultation) === "cancelled",
          ).length,
          color: "hsl(0, 65%, 55%)",
        },
        {
          name: "Faltas",
          value: monthConsultations.filter(
            (consultation) => getConsultationOutcome(consultation) === "missed",
          ).length,
          color: "hsl(38, 90%, 55%)",
        },
      ],
    },
  } satisfies PsychologistReportsData;
}
