import { sendManualPatientRegistrationEmail } from "./email.mjs";
import { HttpError } from "./errors.mjs";
import {
  extractBearerToken,
  getRequestSupabaseClient,
  resolveSupabaseAuthUser,
} from "./supabase.mjs";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value) {
  const normalizedValue = normalizeEmail(value);
  return Boolean(normalizedValue) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue);
}

function pickString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
}

function buildPublicBaseUrl(requestHeaders, env) {
  const configuredBaseUrl = normalizeString(
    env.APP_BASE_URL || env.PUBLIC_APP_URL || env.SITE_URL,
  ).replace(/\/+$/g, "");

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const forwardedProto = getHeaderValue(requestHeaders, "x-forwarded-proto")
    .split(",")[0]
    .trim();
  const forwardedHost = getHeaderValue(requestHeaders, "x-forwarded-host");
  const host = forwardedHost || getHeaderValue(requestHeaders, "host");
  const protocol = forwardedProto || "http";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`.replace(/\/+$/g, "");
}

function buildPatientRegistrationPath(inviteCode) {
  const normalizedInviteCode = normalizeString(inviteCode);

  return normalizedInviteCode
    ? `/cadastro/paciente?codigo=${encodeURIComponent(normalizedInviteCode)}`
    : "/cadastro/paciente";
}

function buildPatientRegistrationUrl(inviteCode, requestHeaders, env) {
  const baseUrl = buildPublicBaseUrl(requestHeaders, env);
  const path = buildPatientRegistrationPath(inviteCode);

  return baseUrl ? `${baseUrl}${path}` : path;
}

async function resolveAuthenticatedRequestContext(requestHeaders, env) {
  const accessToken = extractBearerToken(requestHeaders);

  if (!accessToken) {
    throw new HttpError(401, "A requisicao precisa enviar um token Bearer valido.", {
      code: "AUTH_TOKEN_REQUIRED",
    });
  }

  const authenticatedUser = await resolveSupabaseAuthUser(accessToken, env);

  if (!authenticatedUser) {
    throw new HttpError(401, "Nao foi possivel validar a sessao autenticada da requisicao.", {
      code: "AUTH_SESSION_INVALID",
    });
  }

  return {
    accessToken,
    authenticatedUser,
    userClient: getRequestSupabaseClient(accessToken, env),
  };
}

async function loadManualPatient(client, patientId) {
  const normalizedPatientId = normalizeString(patientId);

  if (!normalizedPatientId) {
    throw new HttpError(400, "Informe o paciente cadastrado para enviar o e-mail.", {
      code: "PATIENT_ID_REQUIRED",
    });
  }

  const { data, error } = await client
    .from("pacientes")
    .select("id, nome, email, psicologo_id, clinica_id")
    .eq("id", normalizedPatientId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Nao foi possivel carregar o paciente cadastrado.", {
      code: "PATIENT_LOOKUP_FAILED",
      details: {
        message: normalizeString(error.message) || null,
        code: normalizeString(error.code) || null,
      },
    });
  }

  if (!isRecord(data)) {
    throw new HttpError(404, "Nao foi possivel localizar o paciente cadastrado.", {
      code: "PATIENT_NOT_FOUND",
    });
  }

  return data;
}

async function loadPsychologist(client, authenticatedUser, psychologistId) {
  const candidates = [
    ["id", psychologistId],
    ["auth_id", psychologistId],
    ["auth_id", authenticatedUser?.id],
    ["id", authenticatedUser?.id],
    ["email", authenticatedUser?.email],
  ];
  const seen = new Set();

  for (const [column, value] of candidates) {
    const normalizedValue = normalizeString(value);
    const key = `${column}:${normalizedValue.toLowerCase()}`;

    if (!normalizedValue || seen.has(key)) continue;
    seen.add(key);

    const { data, error } = await client
      .from("usuarios")
      .select("id, auth_id, nome, email, codigo_convite")
      .eq(column, normalizedValue)
      .limit(1)
      .maybeSingle();

    if (!error && isRecord(data)) {
      return data;
    }
  }

  return null;
}

export async function sendManualPatientRegistrationEmailForPatient(input, options = {}) {
  const normalizedInput = isRecord(input) ? input : {};
  const env = options.env || process.env;
  const requestHeaders = options.requestHeaders || {};
  const { authenticatedUser, userClient } = await resolveAuthenticatedRequestContext(
    requestHeaders,
    env,
  );
  const patient = await loadManualPatient(userClient, normalizedInput.patientId);
  const patientEmail = normalizeEmail(pickString(patient, ["email"]));

  if (!isValidEmail(patientEmail)) {
    return {
      attempted: false,
      sent: false,
      skippedReason: "patient_email_invalid_or_missing",
    };
  }

  const psychologist = await loadPsychologist(
    userClient,
    authenticatedUser,
    pickString(patient, ["psicologo_id"]),
  );
  const psychologistName =
    pickString(psychologist, ["nome"]) ||
    pickString(authenticatedUser?.user_metadata, ["full_name", "name"]) ||
    "seu psicologo";
  const inviteCode = pickString(psychologist, ["codigo_convite"]);
  const inviteUrl = buildPatientRegistrationUrl(inviteCode, requestHeaders, env);
  const email = await sendManualPatientRegistrationEmail(
    {
      to: patientEmail,
      patientName: pickString(patient, ["nome"]) || "Paciente",
      psychologistName,
      inviteUrl,
    },
    {
      env,
      baseUrl: buildPublicBaseUrl(requestHeaders, env),
    },
  );

  return {
    attempted: true,
    sent: true,
    event: "manual_patient_registration",
    email,
  };
}
