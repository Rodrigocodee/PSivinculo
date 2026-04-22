import { supabase } from "@/lib/supabase";

type ServerErrorResponse = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

function extractServerErrorMessage(
  payload: ServerErrorResponse | null,
  fallbackMessage: string,
) {
  return payload?.error?.message?.trim() || fallbackMessage;
}

function toServerRequestError(
  payload: ServerErrorResponse | null,
  fallbackMessage: string,
) {
  const error = new Error(extractServerErrorMessage(payload, fallbackMessage)) as Error & {
    code?: string;
    details?: unknown;
  };

  if (payload?.error?.code) {
    error.code = payload.error.code;
  }

  if (payload?.error?.details !== undefined) {
    error.details = payload.error.details;
  }

  return error;
}

export async function buildAuthenticatedJsonRequestHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = session?.access_token?.trim();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    // Keep server-backed actions working when session hydration is temporarily unavailable.
  }

  return headers;
}

export async function readServerJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { success?: boolean })
    | ServerErrorResponse
    | null;

  if (
    !response.ok ||
    !payload ||
    (typeof payload === "object" && "success" in payload && payload.success !== true)
  ) {
    throw toServerRequestError(payload as ServerErrorResponse | null, fallbackMessage);
  }

  return payload as T;
}
