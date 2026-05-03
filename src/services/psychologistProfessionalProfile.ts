import {
  getCrpDigits,
  getCurrentPsychologistContext,
  isValidCrp,
  normalizePhone,
} from "@/services/currentPsychologist";

export const psychologistPaymentReturnRoute = "/psi/pagamento/retorno";
export const psychologistPaymentProfileRoute = "/psi/configuracoes?origem=pagamento#perfil";

export type PsychologistProfessionalProfileFieldKey =
  | "nome"
  | "telefone"
  | "cpf"
  | "crp"
  | "especialidade";

export type PsychologistProfessionalProfileField = {
  key: PsychologistProfessionalProfileFieldKey;
  label: string;
  sourceColumns: string[];
  required: boolean;
  complete: boolean;
};

export type PsychologistProfessionalProfileCompletion = {
  isComplete: boolean;
  fields: PsychologistProfessionalProfileField[];
  missingFields: PsychologistProfessionalProfileField[];
  usesCpfField: boolean;
};

const NAME_COLUMNS = ["nome", "name", "full_name"];
const PHONE_COLUMNS = ["telefone", "phone", "celular"];
const CPF_COLUMNS = ["cpf"];
const CRP_COLUMNS = ["crp", "registro"];
const SPECIALTY_COLUMNS = ["especialidade", "specialty"];

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function hasAnyColumn(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return false;
  return keys.some((key) => key in source);
}

function pickProfileValue(
  row: Record<string, unknown> | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  rowKeys: string[],
  metadataKeys = rowKeys,
) {
  void metadata;
  void metadataKeys;
  return pickString(row, rowKeys);
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function hasPsychologistProfileCpfField(row: Record<string, unknown> | null | undefined) {
  return hasAnyColumn(row, CPF_COLUMNS);
}

export function evaluatePsychologistProfessionalProfileCompletion(input: {
  row: Record<string, unknown> | null | undefined;
  metadata?: Record<string, unknown> | null;
}): PsychologistProfessionalProfileCompletion {
  const row = input.row || null;
  const metadata = input.metadata || null;
  const usesCpfField = hasPsychologistProfileCpfField(row);
  const phoneDigits = normalizePhone(pickProfileValue(row, metadata, PHONE_COLUMNS));
  const cpfDigits = normalizeCpf(pickProfileValue(row, metadata, CPF_COLUMNS));
  const crpValue = pickProfileValue(row, metadata, CRP_COLUMNS);

  const fields: PsychologistProfessionalProfileField[] = [
    {
      key: "nome",
      label: "nome",
      sourceColumns: NAME_COLUMNS,
      required: true,
      complete: Boolean(pickProfileValue(row, metadata, NAME_COLUMNS, ["full_name", "name", "nome"])),
    },
    {
      key: "telefone",
      label: "telefone",
      sourceColumns: PHONE_COLUMNS,
      required: true,
      complete: Boolean(phoneDigits && [10, 11].includes(phoneDigits.length)),
    },
    ...(usesCpfField
      ? [
          {
            key: "cpf" as const,
            label: "CPF",
            sourceColumns: CPF_COLUMNS,
            required: true,
            complete: cpfDigits.length === 11,
          },
        ]
      : []),
    {
      key: "crp",
      label: "CRP",
      sourceColumns: CRP_COLUMNS,
      required: true,
      complete: Boolean(crpValue && isValidCrp(getCrpDigits(crpValue))),
    },
    {
      key: "especialidade",
      label: "especialidade",
      sourceColumns: SPECIALTY_COLUMNS,
      required: true,
      complete: Boolean(pickProfileValue(row, metadata, SPECIALTY_COLUMNS)),
    },
  ];

  const missingFields = fields.filter((field) => field.required && !field.complete);

  return {
    isComplete: missingFields.length === 0,
    fields,
    missingFields,
    usesCpfField,
  };
}

export async function getCurrentPsychologistProfessionalProfileCompletion() {
  const context = await getCurrentPsychologistContext();
  const metadata = (context.user?.user_metadata || {}) as Record<string, unknown>;
  const row = context.usuariosRecord?.row || context.record?.row || null;

  return evaluatePsychologistProfessionalProfileCompletion({ row, metadata });
}
