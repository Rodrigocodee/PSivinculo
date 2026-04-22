import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./errors.mjs";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== "object") return "";

  const value = headers[headerName];

  if (Array.isArray(value)) {
    return normalizeString(value[0]);
  }

  return normalizeString(value);
}

let cachedClient = null;
let cachedSignature = "";

export function extractBearerToken(headers) {
  const authorizationHeader =
    getHeaderValue(headers, "authorization") || getHeaderValue(headers, "Authorization");

  if (!authorizationHeader) return "";

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return normalizeString(match?.[1]);
}

export function getSupabaseServerConfig(env = process.env) {
  const url = normalizeString(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const serviceRoleKey = normalizeString(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = normalizeString(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY);

  if (!url) {
    throw new HttpError(500, "SUPABASE_URL ou VITE_SUPABASE_URL nao foi configurada no servidor.", {
      code: "SUPABASE_CONFIG_ERROR",
    });
  }

  if (!serviceRoleKey) {
    throw new HttpError(500, "SUPABASE_SERVICE_ROLE_KEY nao foi configurada no servidor.", {
      code: "SUPABASE_CONFIG_ERROR",
    });
  }

  return {
    url,
    serviceRoleKey,
    anonKey,
  };
}

export function getServerSupabaseClient(env = process.env) {
  const config = getSupabaseServerConfig(env);
  const signature = `${config.url}::${config.serviceRoleKey}`;

  if (cachedClient && cachedSignature === signature) {
    return cachedClient;
  }

  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  cachedSignature = signature;

  return cachedClient;
}

export function getRequestSupabaseClient(accessToken, env = process.env) {
  const normalizedAccessToken = normalizeString(accessToken);
  const config = getSupabaseServerConfig(env);
  const requestKey = config.anonKey || config.serviceRoleKey;

  if (!normalizedAccessToken) {
    throw new HttpError(401, "Nao foi possivel identificar a sessao autenticada da requisicao.", {
      code: "AUTH_SESSION_REQUIRED",
    });
  }

  return createClient(config.url, requestKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${normalizedAccessToken}`,
      },
    },
  });
}

export async function resolveSupabaseAuthUser(accessToken, env = process.env) {
  const normalizedAccessToken = normalizeString(accessToken);
  if (!normalizedAccessToken) return null;

  const supabase = getServerSupabaseClient(env);
  const { data, error } = await supabase.auth.getUser(normalizedAccessToken);

  if (error) {
    return null;
  }

  return data.user ?? null;
}
