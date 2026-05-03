import { supabase } from "@/lib/supabase";
import {
  getCurrentPaciente,
  type CurrentPacienteContext,
} from "@/services/currentPatient";
import { resolvePsychologistNameById } from "@/services/psychologistLookup";

type ConsultationRow = Record<string, unknown>;

export type PatientDocument = {
  id: string;
  psychologistName: string;
  date: string | null;
  amount: number | null;
  amountLabel: string;
  status: string;
  statusLabel: string;
  downloadUrl: string | null;
  availabilityLabel: string | null;
};

export type PatientDocumentsData = {
  patient: CurrentPacienteContext;
  documents: PatientDocument[];
};

export const patientDocumentsQueryKey = ["patient-documents"];

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
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

function parseValidDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getConsultationPaymentUrl(consulta: ConsultationRow) {
  return (
    pickString(consulta, ["asaas_invoice_url"]) ||
    pickString(consulta, ["asaas_bank_slip_url"]) ||
    null
  );
}

function formatCurrency(amount: number | null) {
  if (amount == null) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function mapConsultationToDocument(
  consulta: ConsultationRow,
  psychologistName: string,
): PatientDocument {
  const amount = getPossibleNumber(consulta, ["valor_consulta"]);

  return {
    id: pickString(consulta, ["id"]) || crypto.randomUUID(),
    psychologistName,
    date: pickString(consulta, ["data_consulta"]) || null,
    amount,
    amountLabel: formatCurrency(amount),
    status: pickString(consulta, ["status_pagamento"]) || "pago",
    statusLabel: "Pago",
    downloadUrl: getConsultationPaymentUrl(consulta),
    availabilityLabel: getConsultationPaymentUrl(consulta) ? null : "Disponivel em breve",
  };
}

export async function fetchPatientDocumentsData(): Promise<PatientDocumentsData> {
  const patient = await getCurrentPaciente();

  if (!patient.user) {
    throw new Error("Nao foi possivel localizar uma sessao autenticada.");
  }

  if (!patient.patientId) {
    return {
      patient,
      documents: [],
    };
  }

  const { data, error } = await supabase
    .from("consultas")
    .select("*")
    .eq("paciente_id", patient.patientId)
    .eq("status_pagamento", "pago")
    .order("data_consulta", { ascending: false });

  if (error) throw error;

  const consultationRows = (data ?? []) as ConsultationRow[];
  const psychologistIds = new Set<string>(
    [patient.psychologistId]
      .concat(consultationRows.map((consulta) => pickString(consulta, ["psicologo_id"]) || ""))
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
        ) || "",
      );

      psychologistNameById.set(psychologistId, psychologistName);
    }),
  );

  const documents = consultationRows
    .map((consulta) =>
      mapConsultationToDocument(
        consulta,
        psychologistNameById.get(pickString(consulta, ["psicologo_id"]) || "") ||
          "Psicologo(a)",
      ),
    )
    .sort((left, right) => {
      const leftTime = parseValidDate(left.date)?.getTime() ?? 0;
      const rightTime = parseValidDate(right.date)?.getTime() ?? 0;
      return rightTime - leftTime;
    });

  return {
    patient,
    documents,
  };
}
