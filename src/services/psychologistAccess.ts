export const CLINIC_INVITED_PSYCHOLOGIST_ORIGIN = "clinica_convite";
export const CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW = "cadastro_psicologo_clinica";

const CLINIC_ID_KEYS = ["clinica_id", "clinic_id"] as const;
const CLINIC_INVITE_CODE_KEYS = ["codigo_convite_clinica", "clinic_invite_code"] as const;
const CLINIC_INVITE_ORIGIN_KEYS = ["origem_cadastro", "registration_origin", "signup_origin"] as const;
const CLINIC_INVITE_FLAG_KEYS = [
  "cadastro_por_convite",
  "signup_via_clinic_invite",
  "clinic_invite_signup",
] as const;
const SIGNUP_FLOW_KEYS = ["signup_flow"] as const;

type RecordLike = Record<string, unknown> | null | undefined;

export type PsychologistClinicAccess = {
  clinicId: string;
  clinicInviteCode: string;
  origin: string;
  signupFlow: string;
  isClinicInvitedPsychologist: boolean;
  usesClinicPlan: boolean;
};

function pickString(source: RecordLike, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function pickBoolean(source: RecordLike, keys: readonly string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }

  return null;
}

function normalizeComparableValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function resolvePsychologistClinicAccess(
  metadata: RecordLike,
  row: RecordLike,
): PsychologistClinicAccess {
  const clinicId =
    pickString(row, CLINIC_ID_KEYS) ||
    pickString(metadata, CLINIC_ID_KEYS);
  const clinicInviteCode =
    pickString(row, CLINIC_INVITE_CODE_KEYS) ||
    pickString(metadata, CLINIC_INVITE_CODE_KEYS);
  const origin =
    pickString(row, CLINIC_INVITE_ORIGIN_KEYS) ||
    pickString(metadata, CLINIC_INVITE_ORIGIN_KEYS);
  const signupFlow =
    pickString(row, SIGNUP_FLOW_KEYS) ||
    pickString(metadata, SIGNUP_FLOW_KEYS);
  const explicitInviteFlag =
    pickBoolean(row, CLINIC_INVITE_FLAG_KEYS) ??
    pickBoolean(metadata, CLINIC_INVITE_FLAG_KEYS);
  const normalizedOrigin = normalizeComparableValue(origin);
  const normalizedSignupFlow = normalizeComparableValue(signupFlow);
  const invitedByOrigin =
    normalizedOrigin === CLINIC_INVITED_PSYCHOLOGIST_ORIGIN ||
    normalizedOrigin === "clinic_invite";
  const invitedByFlow =
    normalizedSignupFlow === CLINIC_INVITED_PSYCHOLOGIST_SIGNUP_FLOW ||
    normalizedSignupFlow === CLINIC_INVITED_PSYCHOLOGIST_ORIGIN;
  const invitedByStoredCode = Boolean(clinicId && clinicInviteCode);
  const isClinicInvitedPsychologist = Boolean(
    clinicId &&
    (
      explicitInviteFlag === true ||
      invitedByOrigin ||
      invitedByFlow ||
      invitedByStoredCode
    ),
  );

  return {
    clinicId,
    clinicInviteCode,
    origin,
    signupFlow,
    isClinicInvitedPsychologist,
    usesClinicPlan: isClinicInvitedPsychologist,
  };
}
