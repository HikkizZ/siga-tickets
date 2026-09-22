// Interfaz de verificación de captcha (Fase 5: portal público). Mismo espíritu que
// storage/antivirus.ts: el flujo (captchaToken exigido en la validación, el punto de extensión en
// los controladores) ya queda cableado; Turnstile/hCaptcha la reemplazan más adelante sin tocar
// los endpoints.
export interface Captcha {
  verificar(token: string): Promise<boolean>;
}

// Placeholder: aprueba cualquier token no vacío (Zod ya exige que captchaToken no esté vacío antes
// de llegar aquí). El portal NO está protegido de verdad hasta integrar un proveedor real (ver
// security/index.ts y docs/backend-diseno.md).
export class NoopCaptcha implements Captcha {
  async verificar(_token: string): Promise<boolean> {
    return true;
  }
}
