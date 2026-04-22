function readErrorField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const fieldValue = (value as Record<string, unknown>)[key];
  return typeof fieldValue === "string" ? fieldValue.trim() : "";
}

function normalizeErrorText(error: unknown) {
  return [
    readErrorField(error, "message"),
    readErrorField(error, "details"),
    readErrorField(error, "hint"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export const CONSULTA_RESPONSE_MIGRATION_MESSAGE =
  "O banco ainda nao foi atualizado com o novo fluxo de resposta de consultas. Aplique a migration mais recente e tente novamente.";

export function isConsultaResponseSchemaMissingError(error: unknown) {
  const normalizedCode = readErrorField(error, "code").toUpperCase();
  const normalizedText = normalizeErrorText(error);

  if (normalizedText.includes("data_consulta_solicitada_original")) return true;
  if (normalizedText.includes("respondida_em")) return true;

  return normalizedCode === "42703" && normalizedText.includes("consultas");
}

export function isConsultaResponseRpcMissingError(error: unknown) {
  const normalizedCode = readErrorField(error, "code").toUpperCase();
  const normalizedText = normalizeErrorText(error);

  if (normalizedText.includes("respond_consulta_request")) return true;
  if (normalizedText.includes("respond_consulta_counterproposal")) return true;

  return normalizedCode === "PGRST202";
}
