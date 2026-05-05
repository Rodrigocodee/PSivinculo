/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ESSENCIAL_CHECKOUT_URL?: string;
  readonly VITE_PROFISSIONAL_CHECKOUT_URL?: string;
  readonly VITE_CLINICA_DUO_CHECKOUT_URL?: string;
  readonly VITE_CLINICA_EXPANSAO_CHECKOUT_URL?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
