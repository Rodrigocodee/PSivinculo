import type { Session, User } from "@supabase/supabase-js";
import { setSupabaseRememberPreference, supabase } from "@/lib/supabase";
import { CLINIC_ADMIN_USER_TYPE } from "@/services/adminAccess";
import {
  assertEmailAvailable,
  isValidEmail,
  normalizeEmail,
  normalizePhoneDigits,
  resolveAuthenticatedAppUser,
} from "@/services/auth";
import { linkPendingSubscriptionAfterRegistration } from "@/services/subscriptionPersistence";

type TemplateRow = Record<string, unknown>;

type RegistrationStage = "auth" | "clinicas" | "usuarios" | "auth_metadata";

type AuthRecoveryResult = {
  user: User;
  session: Session | null;
  requiresEmailConfirmation: boolean;
  source: "sign_up" | "sign_in_repair" | "existing_session";
};

type PersistedClinicResult = {
  clinicId: string;
  row: TemplateRow | null;
  wasReused: boolean;
};

type ExistingAdminUserRecord = {
  row: TemplateRow;
  matchColumn: string;
  matchValue: string;
};

type AdminUserPayloadInput = {
  authUserId: string;
  clinicId: string;
  email: string;
  clinicName: string;
};

export type AdminClinicRegistrationInput = {
  password: string;
  clinicName: string;
  clinicCnpj: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicAddress: string;
  clinicCity: string;
  clinicState: string;
};

const CLINIC_CNPJ_COLUMNS = ["cnpj"] as const;
const CLINIC_EMAIL_COLUMNS = ["email"] as const;

const CLINIC_EMAIL_IN_USE_MESSAGE =
  "O e-mail da clinica ja esta em uso. Use um e-mail exclusivo para a conta administrativa da clinica.";
const REGISTRATION_LOG_PREFIX = "[Psivinculo][clinic-registration]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function normalizeCnpjDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

function normalizeStateCode(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
}

function readErrorField(
  error: unknown,
  field: "message" | "details" | "hint" | "code",
) {
  if (!isRecord(error)) return "";

  const value = error[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readErrorStatus(error: unknown) {
  if (!isRecord(error)) return null;

  const directStatus = error.status;
  if (typeof directStatus === "number" && Number.isFinite(directStatus)) return directStatus;
  if (typeof directStatus === "string" && directStatus.trim()) {
    const parsedStatus = Number(directStatus);
    if (Number.isFinite(parsedStatus)) return parsedStatus;
  }

  const statusCode = error.statusCode;
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) return statusCode;
  if (typeof statusCode === "string" && statusCode.trim()) {
    const parsedStatusCode = Number(statusCode);
    if (Number.isFinite(parsedStatusCode)) return parsedStatusCode;
  }

  return null;
}

function isAuthRateLimitError(error: unknown) {
  const status = readErrorStatus(error);
  if (status === 429) return true;

  const message = readErrorField(error, "message").toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}

function toErrorMessage(error: unknown) {
  const message = readErrorField(error, "message");
  const details = readErrorField(error, "details");
  const hint = readErrorField(error, "hint");
  const code = readErrorField(error, "code");

  const fragments = [
    message,
    details ? `Detalhes: ${details}` : "",
    hint ? `Sugestao: ${hint}` : "",
    code ? `Codigo: ${code}` : "",
  ].filter(Boolean);

  if (fragments.length > 0) return fragments.join(" | ");
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Falha sem detalhes retornados.";
}

function logRegistrationStep(stage: RegistrationStage, action: string, payload: Record<string, unknown>) {
  console.info(`${REGISTRATION_LOG_PREFIX}[${stage}][${action}]`, payload);
}

function logRegistrationFailure(stage: RegistrationStage, action: string, payload: Record<string, unknown>) {
  console.warn(`${REGISTRATION_LOG_PREFIX}[${stage}][${action}]`, payload);
}

function mapSignUpErrorMessage(error: Error) {
  const rawMessage = error.message.toLowerCase();

  if (isAuthRateLimitError(error)) {
    return "O Supabase/Auth bloqueou temporariamente novas tentativas de cadastro (429 - rate limit). Aguarde alguns instantes antes de tentar novamente.";
  }

  if (rawMessage.includes("user already registered")) {
    return CLINIC_EMAIL_IN_USE_MESSAGE;
  }

  if (rawMessage.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (rawMessage.includes("invalid email")) {
    return "Informe um e-mail valido.";
  }

  return `Falha ao criar a conta no Supabase/Auth. ${toErrorMessage(error)}`;
}

async function getTableTemplateRow(table: "usuarios" | "clinicas") {
  const { data, error } = await supabase.from(table).select("*").limit(1).maybeSingle();
  if (error || !data) return null;
  return data as TemplateRow;
}

async function getCurrentAuthSnapshot() {
  const session = (await supabase.auth.getSession()).data.session;
  const user = session?.user ?? (await supabase.auth.getUser()).data.user ?? null;
  return {
    session: session ?? null,
    user,
  };
}

function buildClinicPayload(input: AdminClinicRegistrationInput) {
  return {
    nome: input.clinicName.trim(),
    cnpj: normalizeCnpjDigits(input.clinicCnpj),
    email: normalizeEmail(input.clinicEmail),
    telefone: normalizePhoneDigits(input.clinicPhone),
    endereco: input.clinicAddress.trim(),
  };
}

function buildAdminUserPayload(
  _template: TemplateRow | null,
  input: AdminUserPayloadInput,
) {
  return buildRequiredAdminUserPayload(input);
}

function buildRequiredAdminUserPayload(input: AdminUserPayloadInput) {
  return {
    id: input.authUserId,
    auth_id: input.authUserId,
    nome: input.clinicName.trim(),
    email: normalizeEmail(input.email),
    clinica_id: input.clinicId,
    tipo_usuario: CLINIC_ADMIN_USER_TYPE,
  };
}

function buildAdminUserCandidatePayloads(
  template: TemplateRow | null,
  input: AdminUserPayloadInput,
) {
  const candidates = [
    buildAdminUserPayload(template, input),
  ];

  return candidates.filter((payload, index, collection) => {
    if (Object.keys(payload).length === 0) return false;
    const signature = JSON.stringify(payload);
    return collection.findIndex((candidate) => JSON.stringify(candidate) === signature) === index;
  });
}

async function findRecordByColumn(
  table: "usuarios" | "clinicas",
  column: string,
  value: string,
) {
  if (!value) return null;

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (error || !data || !isRecord(data)) return null;
    return data;
  } catch {
    return null;
  }
}

async function findExistingClinicRecord(
  template: TemplateRow | null,
  input: AdminClinicRegistrationInput,
) {
  const candidates = [
    ...CLINIC_CNPJ_COLUMNS.map((column) => ({
      column,
      enabled: template == null || column in (template || {}),
      value: normalizeCnpjDigits(input.clinicCnpj),
    })),
    ...CLINIC_EMAIL_COLUMNS.map((column) => ({
      column,
      enabled: template == null || column in (template || {}),
      value: normalizeEmail(input.clinicEmail),
    })),
  ];

  for (const candidate of candidates) {
    if (!candidate.enabled || !candidate.value) continue;

    const row = await findRecordByColumn("clinicas", candidate.column, candidate.value);
    if (row) return row;
  }

  return null;
}

function getClinicIdFromRow(row: TemplateRow | null | undefined) {
  return pickString(row, ["id"]);
}

async function createOrReuseClinicRecord(
  template: TemplateRow | null,
  input: AdminClinicRegistrationInput,
) {
  const existingClinic = await findExistingClinicRecord(template, input);

  if (existingClinic) {
    const clinicId = getClinicIdFromRow(existingClinic);
    if (clinicId) {
      logRegistrationStep("clinicas", "reused_existing", {
        clinicId,
        cnpj: normalizeCnpjDigits(input.clinicCnpj),
        clinicEmail: normalizeEmail(input.clinicEmail),
      });

      return {
        clinicId,
        row: existingClinic,
        wasReused: true,
      } satisfies PersistedClinicResult;
    }
  }

  const clinicPayload = buildClinicPayload(input);

  logRegistrationStep("clinicas", "insert_attempt", {
    payload: clinicPayload,
    clinicEmail: normalizeEmail(input.clinicEmail),
    cnpj: normalizeCnpjDigits(input.clinicCnpj),
  });

  const insertResult = await supabase
    .from("clinicas")
    .insert(clinicPayload)
    .select("*")
    .maybeSingle();

  logRegistrationStep("clinicas", "insert_response", {
    response: insertResult,
    data: insertResult.data,
    error: insertResult.error,
    errorMessage: readErrorField(insertResult.error, "message"),
    errorDetails: readErrorField(insertResult.error, "details"),
    errorHint: readErrorField(insertResult.error, "hint"),
    errorCode: readErrorField(insertResult.error, "code"),
  });

  const { data, error } = insertResult;

  if (!error && data && isRecord(data)) {
    const persistedClinicId = getClinicIdFromRow(data);

    logRegistrationStep("clinicas", "insert_success", {
      clinicId: persistedClinicId || null,
    });

    if (persistedClinicId) {
      return {
        clinicId: persistedClinicId,
        row: data,
        wasReused: false,
      } satisfies PersistedClinicResult;
    }
  }

  const recoveredClinic = await findExistingClinicRecord(template, input);
  if (recoveredClinic) {
    const recoveredClinicId = getClinicIdFromRow(recoveredClinic);

    if (recoveredClinicId) {
      logRegistrationStep("clinicas", "recovered_existing_after_insert", {
        clinicId: recoveredClinicId,
        insertError: error ? toErrorMessage(error) : null,
      });

      return {
        clinicId: recoveredClinicId,
        row: recoveredClinic,
        wasReused: true,
      } satisfies PersistedClinicResult;
    }
  }

  logRegistrationFailure("clinicas", "insert_failed", {
    payload: clinicPayload,
    response: insertResult,
    errorMessage: readErrorField(error, "message"),
    errorDetails: readErrorField(error, "details"),
    errorHint: readErrorField(error, "hint"),
    errorCode: readErrorField(error, "code"),
    error: toErrorMessage(error),
  });
  throw new Error(
    `Nao foi possivel salvar a clinica em public.clinicas. ${toErrorMessage(error)}`,
  );
}

async function findExistingAdminUserRecord(
  authUserId: string,
  email: string,
): Promise<ExistingAdminUserRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const candidates = [
    { column: "auth_id", value: authUserId },
    { column: "id", value: authUserId },
    { column: "email", value: normalizedEmail },
  ];

  for (const candidate of candidates) {
    const row = await findRecordByColumn("usuarios", candidate.column, candidate.value);
    if (!row) continue;

    return {
      row,
      matchColumn: candidate.column,
      matchValue: candidate.value,
    };
  }

  return null;
}

function sanitizeAdminUserUpdatePayload(payload: Record<string, unknown>) {
  const updatePayload = { ...payload };
  delete updatePayload.id;
  return updatePayload;
}

async function persistAdminUserRecord(
  input: AdminUserPayloadInput,
  template: TemplateRow | null,
) {
  const resolvedAdminName = input.clinicName.trim();

  if (!resolvedAdminName) {
    throw new Error("Nao foi possivel criar o admin da clinica porque o nome da clinica nao foi informado.");
  }

  logRegistrationStep("usuarios", "resolved_admin_input", {
    authUserId: input.authUserId,
    nome: resolvedAdminName,
    email: normalizeEmail(input.email),
    clinica_id: input.clinicId,
    clinicName: input.clinicName,
  });

  let existingRecord = await findExistingAdminUserRecord(input.authUserId, input.email);

  if (existingRecord) {
    logRegistrationStep("usuarios", "existing_record_found", {
      matchColumn: existingRecord.matchColumn,
      matchValue: existingRecord.matchValue,
      recordId: pickString(existingRecord.row, ["id"]),
      auth_id: pickString(existingRecord.row, ["auth_id"]),
      tipo_usuario: pickString(existingRecord.row, ["tipo_usuario"]),
      clinica_id: pickString(existingRecord.row, ["clinica_id", "clinic_id"]),
    });
  }

  const candidatePayloads = buildAdminUserCandidatePayloads(template, input);
  let lastError: unknown = null;

  for (let index = 0; index < candidatePayloads.length; index += 1) {
    const payload = candidatePayloads[index];

    logRegistrationStep("usuarios", "persist_attempt", {
      candidateIndex: index,
      payload,
      payloadKeys: Object.keys(payload),
      nome: typeof payload.nome === "string" ? payload.nome : null,
      email: typeof payload.email === "string" ? payload.email : null,
      payload_clinica_id:
        typeof payload.clinica_id === "string"
          ? payload.clinica_id
          : typeof payload.clinic_id === "string"
            ? payload.clinic_id
            : null,
      authUserId: input.authUserId,
      clinica_id: input.clinicId,
      tipo_usuario: payload.tipo_usuario ?? null,
    });

    if (existingRecord) {
      const updatePayload = sanitizeAdminUserUpdatePayload(payload);
      const updateResult = await supabase
        .from("usuarios")
        .update(updatePayload)
        .eq(existingRecord.matchColumn, existingRecord.matchValue)
        .select("*")
        .maybeSingle();

      if (!updateResult.error && updateResult.data && isRecord(updateResult.data)) {
        logRegistrationStep("usuarios", "update_success", {
          candidateIndex: index,
          persistedId: pickString(updateResult.data, ["id"]),
        });
        return updateResult.data;
      }

      if (!updateResult.error) {
        const reloadedRecord = await findExistingAdminUserRecord(input.authUserId, input.email);
        if (reloadedRecord) {
          logRegistrationStep("usuarios", "update_success_reloaded", {
            candidateIndex: index,
            persistedId: pickString(reloadedRecord.row, ["id"]),
          });
          return reloadedRecord.row;
        }
      }

      lastError = updateResult.error || new Error("Update em public.usuarios nao retornou registro.");
      logRegistrationFailure("usuarios", "update_failed", {
        candidateIndex: index,
        payload: updatePayload,
        response: updateResult,
        errorMessage: readErrorField(lastError, "message"),
        errorDetails: readErrorField(lastError, "details"),
        errorHint: readErrorField(lastError, "hint"),
        errorCode: readErrorField(lastError, "code"),
        error: toErrorMessage(lastError),
        payloadKeys: Object.keys(updatePayload),
      });
    }

    const upsertResult = await supabase
      .from("usuarios")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .maybeSingle();

    if (!upsertResult.error && upsertResult.data && isRecord(upsertResult.data)) {
      logRegistrationStep("usuarios", "upsert_success", {
        candidateIndex: index,
        persistedId: pickString(upsertResult.data, ["id"]),
      });
      return upsertResult.data;
    }

    if (!upsertResult.error) {
      const reloadedRecord = await findExistingAdminUserRecord(input.authUserId, input.email);
      if (reloadedRecord) {
        logRegistrationStep("usuarios", "upsert_success_reloaded", {
          candidateIndex: index,
          persistedId: pickString(reloadedRecord.row, ["id"]),
        });
        return reloadedRecord.row;
      }
    }

    lastError = upsertResult.error || new Error("Upsert em public.usuarios nao retornou registro.");
    logRegistrationFailure("usuarios", "upsert_failed", {
      candidateIndex: index,
      payload,
      response: upsertResult,
      errorMessage: readErrorField(lastError, "message"),
      errorDetails: readErrorField(lastError, "details"),
      errorHint: readErrorField(lastError, "hint"),
      errorCode: readErrorField(lastError, "code"),
      error: toErrorMessage(lastError),
      payloadKeys: Object.keys(payload),
    });

    existingRecord = await findExistingAdminUserRecord(input.authUserId, input.email);
  }

  throw new Error(
    `A conta Auth e a clinica foram criadas, mas nao foi possivel criar o admin em public.usuarios. ${toErrorMessage(lastError)}`,
  );
}

async function createOrRecoverClinicAdminAuth(input: {
  email: string;
  password: string;
  clinicName: string;
  phone: string;
}) {
  const currentAuth = await getCurrentAuthSnapshot();

  if (normalizeEmail(currentAuth.user?.email || "") === input.email && currentAuth.user) {
    logRegistrationStep("auth", "reused_existing_session", {
      authUserId: currentAuth.user.id,
      email: input.email,
    });

    return {
      user: currentAuth.user,
      session: currentAuth.session,
      requiresEmailConfirmation: !currentAuth.session,
      source: "existing_session",
    } satisfies AuthRecoveryResult;
  }

  logRegistrationStep("auth", "sign_up_attempt", {
    email: input.email,
  });

  const signUpResult = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.clinicName,
        name: input.clinicName,
        role: CLINIC_ADMIN_USER_TYPE,
        perfil: CLINIC_ADMIN_USER_TYPE,
        tipo_usuario: CLINIC_ADMIN_USER_TYPE,
        user_type: CLINIC_ADMIN_USER_TYPE,
        cargo: CLINIC_ADMIN_USER_TYPE,
        phone: input.phone,
        telefone: input.phone,
        email: input.email,
        signup_flow: "cadastro_clinica",
      },
    },
  });

  if (!signUpResult.error && signUpResult.data.user) {
    logRegistrationStep("auth", "sign_up_success", {
      authUserId: signUpResult.data.user.id,
      requiresEmailConfirmation: !signUpResult.data.session,
    });

    return {
      user: signUpResult.data.user,
      session: signUpResult.data.session,
      requiresEmailConfirmation: !signUpResult.data.session,
      source: "sign_up",
    } satisfies AuthRecoveryResult;
  }

  const signUpError = signUpResult.error;
  const rawSignUpMessage = signUpError?.message.toLowerCase() || "";

  if (rawSignUpMessage.includes("user already registered")) {
    logRegistrationFailure("auth", "sign_up_user_already_registered", {
      email: input.email,
      error: signUpError ? toErrorMessage(signUpError) : null,
    });

    const signInResult = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (!signInResult.error && signInResult.data.user) {
      logRegistrationStep("auth", "sign_in_repair_success", {
        authUserId: signInResult.data.user.id,
        email: input.email,
      });

      return {
        user: signInResult.data.user,
        session: signInResult.data.session,
        requiresEmailConfirmation: !signInResult.data.session,
        source: "sign_in_repair",
      } satisfies AuthRecoveryResult;
    }

    logRegistrationFailure("auth", "sign_in_repair_failed", {
      email: input.email,
      error: toErrorMessage(signInResult.error),
    });
  }

  logRegistrationFailure("auth", "sign_up_failed", {
    email: input.email,
    error: toErrorMessage(signUpError),
  });
  throw new Error(mapSignUpErrorMessage(signUpError || new Error("Falha ao criar conta Auth.")));
}

async function syncAdminAuthMetadata(input: {
  authUserId: string;
  phone: string;
  clinicId: string;
  clinicName: string;
}) {
  const currentAuth = await getCurrentAuthSnapshot();
  const currentUser = currentAuth.user;

  if (!currentUser || currentUser.id !== input.authUserId) {
    logRegistrationStep("auth_metadata", "skipped_without_matching_session", {
      authUserId: input.authUserId,
      currentAuthUserId: currentUser?.id || null,
    });
    return null;
  }

  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...(currentUser.user_metadata || {}),
      full_name: input.clinicName.trim(),
      name: input.clinicName.trim(),
      phone: normalizePhoneDigits(input.phone),
      telefone: normalizePhoneDigits(input.phone),
      role: CLINIC_ADMIN_USER_TYPE,
      perfil: CLINIC_ADMIN_USER_TYPE,
      tipo_usuario: CLINIC_ADMIN_USER_TYPE,
      user_type: CLINIC_ADMIN_USER_TYPE,
      cargo: CLINIC_ADMIN_USER_TYPE,
      clinica_id: input.clinicId,
      clinic_id: input.clinicId,
      clinic_name: input.clinicName.trim(),
      nome_clinica: input.clinicName.trim(),
      signup_flow: "cadastro_clinica",
    },
  });

  if (error) {
    logRegistrationFailure("auth_metadata", "update_failed", {
      authUserId: input.authUserId,
      clinica_id: input.clinicId,
      error: toErrorMessage(error),
    });
    return currentUser;
  }

  logRegistrationStep("auth_metadata", "update_success", {
    authUserId: input.authUserId,
    clinica_id: input.clinicId,
  });
  return data.user ?? currentUser;
}

async function tryLinkPendingSubscriptionForClinic(input: {
  email: string;
  cnpj: string;
}) {
  try {
    await linkPendingSubscriptionAfterRegistration({
      email: input.email,
      cpfCnpj: input.cnpj,
    });
  } catch (error) {
    console.warn("[Psivinculo][subscription-link][clinic_registration_failed]", {
      email: input.email,
      cnpj: input.cnpj,
      error: error instanceof Error ? error.message : "Unknown link failure",
    });
  }
}

export async function signUpClinicAdmin(input: AdminClinicRegistrationInput) {
  const clinicName = input.clinicName.trim();
  const clinicCnpj = normalizeCnpjDigits(input.clinicCnpj);
  const clinicPhone = normalizePhoneDigits(input.clinicPhone);
  const clinicEmail = normalizeEmail(input.clinicEmail);
  const clinicAddress = input.clinicAddress.trim();
  const clinicCity = input.clinicCity.trim();
  const clinicState = normalizeStateCode(input.clinicState);
  const adminEmail = clinicEmail;
  const adminPhone = clinicPhone;

  if (input.password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");

  if (!clinicName) throw new Error("Informe o nome da clinica.");
  if (clinicCnpj.length !== 14) throw new Error("Informe um CNPJ valido para a clinica.");
  if (!clinicPhone || ![10, 11].includes(clinicPhone.length)) throw new Error("Informe um telefone valido para a clinica.");
  if (!clinicEmail) throw new Error("Informe o e-mail da clinica.");
  if (!isValidEmail(clinicEmail)) throw new Error("Informe um e-mail valido para a clinica.");
  if (!clinicAddress) throw new Error("Informe o endereco da clinica.");
  if (!clinicCity) throw new Error("Informe a cidade da clinica.");
  if (clinicState.length !== 2) throw new Error("Informe a sigla do estado com 2 letras.");

  await assertEmailAvailable(adminEmail, CLINIC_EMAIL_IN_USE_MESSAGE);

  setSupabaseRememberPreference(true);

  const [clinicTemplate, userTemplate] = await Promise.all([
    getTableTemplateRow("clinicas"),
    getTableTemplateRow("usuarios"),
  ]);

  const authResult = await createOrRecoverClinicAdminAuth({
    email: adminEmail,
    password: input.password,
    clinicName,
    phone: adminPhone,
  });

  logRegistrationStep("auth", "resolved_user", {
    authUserId: authResult.user.id,
    source: authResult.source,
  });

  try {
    const clinicResult = await createOrReuseClinicRecord(clinicTemplate, {
      ...input,
      clinicName,
      clinicCnpj,
      clinicPhone,
      clinicEmail,
      clinicAddress,
      clinicCity,
      clinicState,
    });

    const adminUserRow = await persistAdminUserRecord(
      {
        authUserId: authResult.user.id,
        clinicId: clinicResult.clinicId,
        email: adminEmail,
        clinicName,
      },
      userTemplate,
    );

    logRegistrationStep("usuarios", "resolved_record", {
      persistedId: pickString(adminUserRow, ["id"]),
      auth_id: pickString(adminUserRow, ["auth_id"]),
      clinica_id: pickString(adminUserRow, ["clinica_id", "clinic_id"]) || clinicResult.clinicId,
      tipo_usuario: pickString(adminUserRow, ["tipo_usuario"]),
    });

    const updatedUser = await syncAdminAuthMetadata({
      authUserId: authResult.user.id,
      phone: adminPhone,
      clinicId: clinicResult.clinicId,
      clinicName,
    });
    await tryLinkPendingSubscriptionForClinic({
      email: clinicEmail,
      cnpj: clinicCnpj,
    });
    const resolvedUser = updatedUser || authResult.user;
    const appUser = await resolveAuthenticatedAppUser(resolvedUser);

    return {
      session: authResult.session,
      user: resolvedUser,
      appUser,
      clinicId: clinicResult.clinicId,
      requiresEmailConfirmation: authResult.requiresEmailConfirmation,
    };
  } catch (registrationError) {
    console.error("Erro ao concluir cadastro da clinica:", registrationError);
    throw new Error(
      registrationError instanceof Error
        ? registrationError.message
        : "A conta foi criada, mas nao foi possivel concluir o cadastro da clinica.",
    );
  }
}
