/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_PERSIST_JWT?: "true" | "false";
  readonly VITE_TEST_USER_EMAIL?: string;
  readonly VITE_TEST_USER_PWD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
