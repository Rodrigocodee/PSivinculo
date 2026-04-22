/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ESSENCIAL_CHECKOUT_URL?: string;
  readonly VITE_PROFISSIONAL_CHECKOUT_URL?: string;
  readonly VITE_CLINICA_DUO_CHECKOUT_URL?: string;
  readonly VITE_CLINICA_EXPANSAO_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
