import { env } from "../config/env.js";
import type { Captcha } from "./captcha.js";
import { NoopCaptcha } from "./captcha.js";
import { logger } from "../config/logger.js";

// Factory por env.captcha.provider (Fase 5). "turnstile"/"hcaptcha" quedan en el tipo (ver
// config/env.ts) como hueco para cuando existan credenciales; no se implementan de verdad todavía.
function crearCaptcha(): { captcha: Captcha; real: boolean } {
  if (env.captcha.provider === "noop") return { captcha: new NoopCaptcha(), real: false };
  throw new Error(`Proveedor de captcha no implementado todavía: ${env.captcha.provider}`);
}

const creado = crearCaptcha();
export const captcha: Captcha = creado.captcha;
export const captchaReal = creado.real;

// Llamado desde api/server.ts al arrancar, igual que advertirSiNoHayAntivirus.
export function advertirSiNoHayCaptchaReal(real: boolean): void {
  if (!real) {
    logger.warn(
      "No hay verificación de captcha real configurada (NoopCaptcha): el portal público acepta cualquier captchaToken no vacío (Turnstile/hCaptcha pendiente)",
    );
  }
}
