import { setSupabaseRememberPreference, supabase } from "@/lib/supabase";
import {
  assertEmailAvailable,
  assertPhoneAvailable,
  isValidEmail,
  normalizeEmail,
  normalizePhoneDigits,
  resolveAuthenticatedAppUser,
} from "@/services/auth";
import { normalizeCpfDigits } from "@/services/pacientes";
import {
  findPsychologistByInviteCode,
  normalizeInviteCode,
  type PsychologistInviteLookup,
} from "@/services/psychologistInvite";

export type PatientRegistrationInput = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  cpf: string;
  inviteCode: string;
};

function logInviteDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][invite][${label}]`, payload);
}

function mapPatientSignUpErrorMessage(error: Error) {
  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("user already registered")) {
    return "Este e-mail ja esta em uso.";
  }

  if (rawMessage.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (rawMessage.includes("invalid email")) {
    return "Informe um e-mail valido.";
  }

  return "Nao foi possivel criar sua conta agora. Tente novamente.";
}

export async function validatePsychologistInviteCode(inviteCode: string): Promise<PsychologistInviteLookup> {
  const psychologist = await findPsychologistByInviteCode(inviteCode);

  if (!psychologist) {
    logInviteDebug("patient_lookup", {
      requestedCode: normalizeInviteCode(inviteCode),
      found: false,
    });
    throw new Error("O codigo do psicologo nao foi encontrado.");
  }

  if (!psychologist.psychologistId) {
    throw new Error("Este convite ainda nao esta configurado corretamente.");
  }

  logInviteDebug("patient_lookup", {
    requestedCode: normalizeInviteCode(inviteCode),
    found: true,
    persistedCode: psychologist.inviteCode,
    psychologistId: psychologist.psychologistId,
    clinicId: psychologist.clinicId,
  });

  return psychologist;
}

export async function signUpPatientWithInvite(input: PatientRegistrationInput) {
  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhoneDigits(input.phone);
  const cpf = normalizeCpfDigits(input.cpf);
  const inviteCode = normalizeInviteCode(input.inviteCode);

  if (!fullName) {
    throw new Error("Informe seu nome completo.");
  }

  if (!email) {
    throw new Error("Informe seu e-mail.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Informe um e-mail valido.");
  }

  if (!phone || ![10, 11].includes(phone.length)) {
    throw new Error("Informe um telefone valido.");
  }

  if (cpf.length !== 11) {
    throw new Error("Informe um CPF valido.");
  }

  if (!inviteCode) {
    throw new Error("Informe o codigo do psicologo.");
  }

  if (input.password.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  await assertEmailAvailable(email);
  await assertPhoneAvailable(phone);

  const psychologist = await validatePsychologistInviteCode(inviteCode);
  setSupabaseRememberPreference(true);

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        full_name: fullName,
        name: fullName,
        role: "patient",
        phone,
        telefone: phone,
        cpf,
        codigo_psicologo: inviteCode,
        codigo_convite_psicologo: inviteCode,
        psychologist_id: psychologist.psychologistId,
        psicologo_id: psychologist.psychologistId,
        clinic_id: psychologist.clinicId,
        clinica_id: psychologist.clinicId,
        psychologist_name: psychologist.psychologistName,
      },
    },
  });

  if (error) {
    throw new Error(mapPatientSignUpErrorMessage(error));
  }

  const appUser = data.user && data.session ? await resolveAuthenticatedAppUser(data.user) : null;

  return {
    session: data.session,
    user: data.user,
    appUser,
    psychologist,
    requiresEmailConfirmation: !data.session,
  };
}
