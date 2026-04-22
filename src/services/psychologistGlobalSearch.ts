import { supabase } from "@/lib/supabase";
import { getPsychologistServiceScope } from "@/services/psychologistScope";

const PATIENT_RESULT_LIMIT = 5;
const CONSULTATION_RESULT_LIMIT = 5;

type PatientRow = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
};

type ConsultaRow = {
  id: string;
  paciente_id: string;
  data_consulta: string;
  status: string;
  pacientes?: {
    id?: string;
    nome?: string;
  } | null;
};

export type PsychologistGlobalSearchResult =
  | {
      id: string;
      type: "patient";
      label: "Paciente";
      patientId: string;
      title: string;
      subtitle: string;
      matchScore: number;
      sortTimestamp: number;
    }
  | {
      id: string;
      type: "appointment";
      label: "Consulta";
      consultationId: string;
      patientId: string;
      appointmentDate: string;
      title: string;
      subtitle: string;
      matchScore: number;
      sortTimestamp: number;
    };

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getMatchScore(source: string, query: string) {
  const normalizedSource = normalizeText(source);
  const normalizedQuery = normalizeText(query);

  if (!normalizedSource || !normalizedQuery) return 0;
  if (normalizedSource === normalizedQuery) return 400;
  if (normalizedSource.startsWith(normalizedQuery)) return 300;

  const sourceWords = normalizedSource.split(/\s+/);
  if (sourceWords.some((word) => word.startsWith(normalizedQuery))) return 220;
  if (normalizedSource.includes(normalizedQuery)) return 160;

  return 0;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPhone(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return value?.trim() || "Sem telefone";
}

function formatPatientSubtitle(patient: PatientRow) {
  if (patient.email?.trim()) return patient.email.trim();
  return formatPhone(patient.telefone);
}

function formatConsultaStatus(status: string) {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "solicitada") return "Solicitada";
  if (normalizedStatus === "confirmada") return "Confirmada";
  if (normalizedStatus === "pendente") return "Pendente";
  if (normalizedStatus === "cancelada") return "Cancelada";
  if (normalizedStatus === "recusada") return "Recusada";
  if (normalizedStatus === "contraproposta") return "Contraproposta";
  if (normalizedStatus === "realizada") return "Realizada";
  if (normalizedStatus === "faltou") return "Faltou";
  if (normalizedStatus === "reagendada") return "Reagendada";

  return normalizedStatus ? normalizedStatus[0].toUpperCase() + normalizedStatus.slice(1) : "Consulta";
}

function formatConsultaSubtitle(consulta: ConsultaRow) {
  const date = parseDate(consulta.data_consulta);
  const dateLabel = date
    ? `${date.toLocaleDateString("pt-BR")} as ${date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Data nao informada";

  return `${dateLabel} · ${formatConsultaStatus(consulta.status || "")}`;
}

export async function searchPsychologistGlobal(query: string): Promise<PsychologistGlobalSearchResult[]> {
  const trimmedQuery = query.trim().replace(/\s+/g, " ");
  if (trimmedQuery.length < 2) return [];

  const scope = await getPsychologistServiceScope();
  let patientsQuery = supabase
    .from("pacientes")
    .select("id, nome, email, telefone")
    .eq("psicologo_id", scope.psychologistId)
    .ilike("nome", `%${trimmedQuery}%`)
    .order("nome", { ascending: true })
    .limit(PATIENT_RESULT_LIMIT);

  if (scope.clinicId) {
    patientsQuery = patientsQuery.eq("clinica_id", scope.clinicId);
  }

  const { data: patientsData, error: patientsError } = await patientsQuery;
  if (patientsError) throw patientsError;

  const patients = ((patientsData ?? []) as PatientRow[])
    .map((patient) => ({
      id: `patient-${patient.id}`,
      type: "patient" as const,
      label: "Paciente" as const,
      patientId: patient.id,
      title: patient.nome?.trim() || "Paciente",
      subtitle: formatPatientSubtitle(patient),
      matchScore: getMatchScore(patient.nome || "", trimmedQuery),
      sortTimestamp: 0,
    }))
    .filter((patient) => patient.matchScore > 0);

  const patientIds = patients.map((patient) => patient.patientId);
  if (patientIds.length === 0) {
    return patients.sort((a, b) => b.matchScore - a.matchScore || a.title.localeCompare(b.title));
  }

  let consultationsQuery = supabase
    .from("consultas")
    .select(`
      id,
      paciente_id,
      data_consulta,
      status,
      pacientes (
        id,
        nome
      )
    `)
    .eq("psicologo_id", scope.psychologistId)
    .in("paciente_id", patientIds)
    .order("data_consulta", { ascending: true })
    .limit(CONSULTATION_RESULT_LIMIT);

  if (scope.clinicId) {
    consultationsQuery = consultationsQuery.eq("clinica_id", scope.clinicId);
  }

  const { data: consultationsData, error: consultationsError } = await consultationsQuery;
  if (consultationsError) throw consultationsError;

  const consultations = ((consultationsData ?? []) as ConsultaRow[])
    .map((consulta) => {
      const patientName = consulta.pacientes?.nome?.trim() || "Paciente";
      const timestamp = parseDate(consulta.data_consulta)?.getTime() ?? 0;

      return {
        id: `appointment-${consulta.id}`,
        type: "appointment" as const,
        label: "Consulta" as const,
        consultationId: consulta.id,
        patientId: consulta.paciente_id,
        appointmentDate: consulta.data_consulta,
        title: patientName,
        subtitle: formatConsultaSubtitle(consulta),
        matchScore: getMatchScore(patientName, trimmedQuery),
        sortTimestamp: timestamp,
      };
    })
    .filter((consulta) => consulta.matchScore > 0)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.sortTimestamp - b.sortTimestamp;
    });

  return [...patients, ...consultations].sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (a.type !== b.type) return a.type === "patient" ? -1 : 1;
    if (a.type === "appointment" && b.type === "appointment") {
      return a.sortTimestamp - b.sortTimestamp;
    }
    return a.title.localeCompare(b.title);
  });
}
