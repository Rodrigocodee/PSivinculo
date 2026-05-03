import { HttpError } from "./errors.mjs";

export const PREVIEW_FEATURE_LOCK_MESSAGE =
  "Este recurso está disponível após ativar sua assinatura.";

const USUARIOS_ACCESS_SELECT =
  "id, auth_id, clinica_id, nome, email, telefone, tipo_usuario, ativo, plano_slug, status_assinatura, assinatura_ativa, created_at";
const ASSINATURAS_ASAAS_ACCESS_SELECT =
  "id, owner_type, auth_user_id, clinica_id, plano_slug, status_assinatura, payment_status, assinatura_ativa, created_at, updated_at";
const PROFESSIONAL_ROLE_TOKENS = new Set([
  "psicologo",
  "psicologa",
  "psychologist",
  "therapist",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparable(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeSubscriptionStatus(value) {
  return normalizeString(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z_]/g, "");
}

function pickString(source, keys) {
  if (!isRecord(source)) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickBoolean(source, keys) {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
  }

  return null;
}

function resolveSubscriptionAccessFromSource(source) {
  if (!isRecord(source)) return null;

  const planSlug = pickString(source, ["plano_slug", "plan_slug"]);
  const activeFlag = pickBoolean(source, ["assinatura_ativa", "subscription_active", "plan_active"]);
  const subscriptionStatus = normalizeSubscriptionStatus(
    pickString(source, ["status_assinatura", "subscription_status", "plan_status"]),
  );

  if (activeFlag === true) return true;

  if (
    activeFlag === false ||
    ["ACTIVE", "PENDING", "OVERDUE", "CANCELLED", "INACTIVE", "EXPIRED", "DELETED"].includes(
      subscriptionStatus,
    )
  ) {
    return false;
  }

  return planSlug ? null : null;
}

function normalizeAccessStatus(value) {
  const normalized = normalizeComparable(value);
  if (!normalized) return null;

  if (
    [
      "preview",
      "pending",
      "blocked",
      "locked",
      "awaiting_plan",
      "aguardando_plano",
      "inactive",
      "trial_locked",
    ].includes(normalized)
  ) {
    return false;
  }

  if (["active", "enabled", "granted", "released", "liberado", "full", "paid"].includes(normalized)) {
    return true;
  }

  return null;
}

function isClinicInvitedPsychologist(metadata, row) {
  const clinicId = pickString(row, ["clinica_id", "clinic_id"]) || pickString(metadata, ["clinica_id", "clinic_id"]);
  if (!clinicId) return false;

  const inviteCode =
    pickString(row, ["codigo_convite_clinica", "clinic_invite_code"]) ||
    pickString(metadata, ["codigo_convite_clinica", "clinic_invite_code"]);
  const origin =
    pickString(row, ["origem_cadastro", "registration_origin", "signup_origin"]) ||
    pickString(metadata, ["origem_cadastro", "registration_origin", "signup_origin"]);
  const signupFlow = pickString(row, ["signup_flow"]) || pickString(metadata, ["signup_flow"]);
  const inviteFlag =
    pickBoolean(row, ["cadastro_por_convite", "signup_via_clinic_invite", "clinic_invite_signup"]) ??
    pickBoolean(metadata, ["cadastro_por_convite", "signup_via_clinic_invite", "clinic_invite_signup"]);
  const normalizedOrigin = normalizeComparable(origin);
  const normalizedSignupFlow = normalizeComparable(signupFlow);

  return Boolean(
    inviteFlag === true ||
      inviteCode ||
      normalizedOrigin === "clinica_convite" ||
      normalizedOrigin === "clinic_invite" ||
      normalizedSignupFlow === "cadastro_psicologo_clinica" ||
      normalizedSignupFlow === "clinica_convite",
  );
}

function isPsychologistUser(metadata, row) {
  const roleToken =
    normalizeComparable(pickString(row, ["tipo_usuario"])) ||
    normalizeComparable(pickString(metadata, ["tipo_usuario", "role", "user_role", "perfil"]));

  return PROFESSIONAL_ROLE_TOKENS.has(roleToken);
}

async function fetchSingleRow(client, table, selectColumns, column, value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  try {
    const { data, error } = await client
      .from(table)
      .select(selectColumns)
      .eq(column, normalizedValue)
      .limit(1)
      .maybeSingle();

    if (error || !isRecord(data)) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchRows(client, table, selectColumns, column, value) {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) return null;

  try {
    const { data, error } = await client
      .from(table)
      .select(selectColumns)
      .eq(column, normalizedValue)
      .limit(50);

    if (error || !Array.isArray(data)) return null;
    return data.filter(isRecord);
  } catch {
    return null;
  }
}

async function loadAuthenticatedUsuario(client, authenticatedUser) {
  const metadata = isRecord(authenticatedUser?.user_metadata) ? authenticatedUser.user_metadata : {};
  const candidates = [
    ["auth_id", authenticatedUser?.id],
    ["id", authenticatedUser?.id],
    ["email", authenticatedUser?.email],
    ["email", pickString(metadata, ["email"])],
  ];
  const seen = new Set();

  for (const [column, value] of candidates) {
    const normalizedValue = normalizeString(value).toLowerCase();
    const key = `${column}:${normalizedValue}`;

    if (!normalizedValue || seen.has(key)) continue;
    seen.add(key);

    const row = await fetchSingleRow(client, "usuarios", USUARIOS_ACCESS_SELECT, column, value);
    if (row) return row;
  }

  return null;
}

async function loadSubscriptionRows(client, authenticatedUser, usuarioRow) {
  const candidates = [
    ["auth_user_id", authenticatedUser?.id],
    ["auth_user_id", pickString(usuarioRow, ["auth_id"])],
    ["auth_user_id", pickString(usuarioRow, ["id"])],
    ["clinica_id", pickString(usuarioRow, ["clinica_id"])],
  ];
  const seen = new Set();
  const rows = [];
  let queried = false;

  for (const [column, value] of candidates) {
    const normalizedValue = normalizeString(value).toLowerCase();
    const key = `${column}:${normalizedValue}`;

    if (!normalizedValue || seen.has(key)) continue;
    seen.add(key);
    queried = true;

    const nextRows = await fetchRows(
      client,
      "assinaturas_asaas",
      ASSINATURAS_ASAAS_ACCESS_SELECT,
      column,
      value,
    );

    if (Array.isArray(nextRows)) rows.push(...nextRows);
  }

  if (!queried) return null;

  const uniqueRows = [];
  const ids = new Set();

  for (const row of rows) {
    const id = pickString(row, ["id"]) || JSON.stringify(row);
    if (ids.has(id)) continue;
    ids.add(id);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

function resolveSubscriptionRowsAccess(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const accessValues = rows.map(resolveSubscriptionAccessFromSource);
  const activeCount = accessValues.filter((value) => value === true).length;

  if (activeCount === 1) return true;
  if (activeCount > 1) return false;
  if (accessValues.some((value) => value === false)) return false;

  return null;
}

function throwPreviewLock() {
  throw new HttpError(403, PREVIEW_FEATURE_LOCK_MESSAGE, {
    code: "PROFESSIONAL_PREVIEW_LOCKED",
  });
}

export async function assertProfessionalAccessForAuthenticatedUser(client, authenticatedUser) {
  if (!client || !isRecord(authenticatedUser)) return;

  const metadata = isRecord(authenticatedUser.user_metadata) ? authenticatedUser.user_metadata : {};
  const usuarioRow = await loadAuthenticatedUsuario(client, authenticatedUser);
  const isPsychologist = isPsychologistUser(metadata, usuarioRow || {});

  if (!isPsychologist) return;
  if (isClinicInvitedPsychologist(metadata, usuarioRow || {})) return;

  const subscriptionRows = await loadSubscriptionRows(client, authenticatedUser, usuarioRow || {});
  const subscriptionRowsAccess = resolveSubscriptionRowsAccess(subscriptionRows);
  if (subscriptionRowsAccess === true) return;
  if (subscriptionRowsAccess === false) throwPreviewLock();

  const usuarioAccess = resolveSubscriptionAccessFromSource(usuarioRow);
  if (usuarioAccess === true) return;
  if (usuarioAccess === false) throwPreviewLock();

  const accessFlag = pickBoolean(usuarioRow, [
    "professional_access_granted",
    "access_granted",
    "subscription_active",
    "plan_active",
    "assinatura_ativa",
  ]);
  if (accessFlag === true) return;
  if (accessFlag === false) throwPreviewLock();

  const accessStatus = normalizeAccessStatus(
    pickString(usuarioRow, [
      "professional_access_status",
      "access_status",
      "subscription_status",
      "plan_status",
      "status_assinatura",
    ]),
  );
  if (accessStatus === true) return;
  if (accessStatus === false) throwPreviewLock();

  throwPreviewLock();
}
