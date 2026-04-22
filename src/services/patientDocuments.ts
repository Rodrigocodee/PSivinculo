import { supabase } from "@/lib/supabase";
import {
  getCurrentPaciente,
  type CurrentPacienteContext,
} from "@/services/currentPatient";

type PagamentoRow = Record<string, unknown>;

export type PatientDocument = {
  id: string;
  type: "Recibo" | "Documento";
  description: string;
  date: string | null;
  amount: number | null;
  amountLabel: string;
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

function getPaymentDate(payment: PagamentoRow) {
  return (
    pickString(payment, ["data_pagamento", "data", "created_at", "updated_at", "data_vencimento"]) ||
    null
  );
}

function getDocumentDescription(payment: PagamentoRow, date: string | null) {
  const explicitDescription =
    pickString(payment, ["descricao", "description", "titulo", "reference", "nome_consulta"]) ||
    null;

  if (explicitDescription) return explicitDescription;

  const parsedDate = parseValidDate(date);
  if (parsedDate) {
    return `Pagamento de ${parsedDate.toLocaleDateString("pt-BR")}`;
  }

  return "Pagamento registrado";
}

function getDocumentType(payment: PagamentoRow): PatientDocument["type"] {
  const explicitType =
    pickString(payment, ["tipo_documento", "document_type", "tipo", "categoria", "category"]) ||
    "";
  const normalizedType = explicitType.toLowerCase();

  if (
    ["documento", "declaracao", "declaracao de comparecimento", "atestado", "arquivo"].some(
      (candidate) => normalizedType.includes(candidate),
    )
  ) {
    return "Documento";
  }

  return "Recibo";
}

function getRawDownloadReference(payment: PagamentoRow) {
  return (
    pickString(payment, [
      "download_url",
      "receipt_url",
      "recibo_url",
      "document_url",
      "arquivo_url",
      "pdf_url",
      "comprovante_url",
      "file_url",
      "url_recibo",
      "url_documento",
      "anexo_url",
    ]) || null
  );
}

function getDownloadUrl(payment: PagamentoRow) {
  const reference = getRawDownloadReference(payment);
  if (!reference) return null;

  if (/^(https?:\/\/|\/)/i.test(reference)) {
    return reference;
  }

  return null;
}

function formatCurrency(amount: number | null) {
  if (amount == null) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function mapPaymentToDocument(payment: PagamentoRow): PatientDocument {
  const date = getPaymentDate(payment);
  const amount = getPossibleNumber(payment, ["valor", "amount", "valor_pago", "total", "preco"]);
  const downloadUrl = getDownloadUrl(payment);

  return {
    id: pickString(payment, ["id"]) || crypto.randomUUID(),
    type: getDocumentType(payment),
    description: getDocumentDescription(payment, date),
    date,
    amount,
    amountLabel: formatCurrency(amount),
    downloadUrl,
    availabilityLabel: downloadUrl ? null : "Disponivel em breve",
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
    .from("pagamentos")
    .select("*")
    .eq("paciente_id", patient.patientId);

  if (error) throw error;

  const documents = ((data ?? []) as PagamentoRow[])
    .map(mapPaymentToDocument)
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
