export const AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE =
  "Voce tentou criar contas muitas vezes em pouco tempo. Aguarde alguns minutos e tente novamente.";
export const AUTH_USER_ALREADY_EXISTS_MESSAGE = "Este e-mail ja esta em uso.";
export const AUTH_SIGNUP_DISABLED_MESSAGE = "O cadastro esta temporariamente indisponivel.";
export const AUTH_WEAK_PASSWORD_MESSAGE = "A senha informada e fraca. Use uma senha mais segura.";

const AUTH_EMAIL_SEND_RATE_LIMIT_CODE = "over_email_send_rate_limit";
const AUTH_EMAIL_SEND_RATE_LIMIT_TEXT = "email rate limit exceeded";
const AUTH_USER_ALREADY_EXISTS_CODE = "user_already_exists";
const AUTH_SIGNUP_DISABLED_CODE = "signup_disabled";
const AUTH_WEAK_PASSWORD_CODE = "weak_password";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readErrorField(error: unknown, field: "message" | "code") {
  if (!isRecord(error)) return "";

  const value = error[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function isAuthEmailSendRateLimitError(error: unknown) {
  const code = readErrorField(error, "code").toLowerCase();
  const message = readErrorField(error, "message").toLowerCase();

  return (
    code === AUTH_EMAIL_SEND_RATE_LIMIT_CODE ||
    message.includes(AUTH_EMAIL_SEND_RATE_LIMIT_CODE) ||
    message.includes(AUTH_EMAIL_SEND_RATE_LIMIT_TEXT)
  );
}

export function getAuthEmailSendRateLimitMessage(error: unknown) {
  return isAuthEmailSendRateLimitError(error) ? AUTH_EMAIL_SEND_RATE_LIMIT_MESSAGE : null;
}

export function getFriendlyAuthSignUpErrorMessage(error: unknown) {
  const rateLimitMessage = getAuthEmailSendRateLimitMessage(error);
  if (rateLimitMessage) return rateLimitMessage;

  const code = readErrorField(error, "code").toLowerCase();
  const message = readErrorField(error, "message").toLowerCase();

  if (
    code === AUTH_USER_ALREADY_EXISTS_CODE ||
    message.includes(AUTH_USER_ALREADY_EXISTS_CODE) ||
    message.includes("user already registered") ||
    message.includes("already registered")
  ) {
    return AUTH_USER_ALREADY_EXISTS_MESSAGE;
  }

  if (
    code === AUTH_SIGNUP_DISABLED_CODE ||
    message.includes(AUTH_SIGNUP_DISABLED_CODE) ||
    message.includes("signup is disabled") ||
    message.includes("signups not allowed")
  ) {
    return AUTH_SIGNUP_DISABLED_MESSAGE;
  }

  if (
    code === AUTH_WEAK_PASSWORD_CODE ||
    message.includes(AUTH_WEAK_PASSWORD_CODE) ||
    message.includes("weak password")
  ) {
    return AUTH_WEAK_PASSWORD_MESSAGE;
  }

  return null;
}
