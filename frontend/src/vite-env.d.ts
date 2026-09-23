/// <reference types="vite/client" />

// Declara explícitamente las variables VITE_* propias (además de las estándar que ya trae
// vite/client) para poder leerlas con notación de punto pese a `noPropertyAccessFromIndexSignature`.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
