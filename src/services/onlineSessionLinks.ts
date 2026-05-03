export const ONLINE_SESSION_LINK_VALIDATION_MESSAGE =
  "Informe um link valido com http:// ou https://.";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

export function normalizeOnlineSessionLinkInput(value: string | null | undefined) {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    throw new Error(ONLINE_SESSION_LINK_VALIDATION_MESSAGE);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(ONLINE_SESSION_LINK_VALIDATION_MESSAGE);
  }

  return normalizedValue;
}

export function isValidOnlineSessionLinkInput(value: string | null | undefined) {
  try {
    normalizeOnlineSessionLinkInput(value);
    return true;
  } catch {
    return false;
  }
}
