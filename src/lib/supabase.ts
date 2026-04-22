import { createClient, type SupportedStorage } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REMEMBER_ME_STORAGE_KEY = "psivinculo-remember-me";

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function safeGetItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write errors to keep auth usable.
  }
}

function safeRemoveItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage cleanup errors to keep auth usable.
  }
}

export function getSupabaseRememberPreference() {
  if (!canUseBrowserStorage()) return true;

  const storedValue = safeGetItem(window.localStorage, REMEMBER_ME_STORAGE_KEY);
  if (storedValue == null) return true;

  return storedValue === "true";
}

export function setSupabaseRememberPreference(remember: boolean) {
  if (!canUseBrowserStorage()) return;
  safeSetItem(window.localStorage, REMEMBER_ME_STORAGE_KEY, String(remember));
}

const supabaseStorage: SupportedStorage = {
  getItem(key) {
    if (!canUseBrowserStorage()) return null;
    return safeGetItem(window.sessionStorage, key) ?? safeGetItem(window.localStorage, key);
  },
  setItem(key, value) {
    if (!canUseBrowserStorage()) return;

    const remember = getSupabaseRememberPreference();
    const preferredStorage = remember ? window.localStorage : window.sessionStorage;
    const alternateStorage = remember ? window.sessionStorage : window.localStorage;

    safeSetItem(preferredStorage, key, value);
    safeRemoveItem(alternateStorage, key);
  },
  removeItem(key) {
    if (!canUseBrowserStorage()) return;

    safeRemoveItem(window.localStorage, key);
    safeRemoveItem(window.sessionStorage, key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storage: supabaseStorage,
  },
});
