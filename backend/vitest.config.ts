import { defineConfig } from "vitest/config";

// Se fija en el proceso principal (lo heredan globalSetup y los workers) y PISA lo que
// haya en .env: la suite trunca tablas, así que jamás debe apuntar a la BD de desarrollo.
process.env.NODE_ENV = "test";
process.env.DB_NAME = "siga-tickets-test";
process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "secreto-solo-para-tests-0123456789abcdef";

export default defineConfig({
  test: {
    globalSetup: ["src/test/globalSetup.ts"],
    // Los archivos comparten una sola BD y se limpian entre tests: en serie.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
