// Token de CUENTA de portal (JWT, scope:"portal-cuenta", TTL 7 días, docs/api.md sección "Cuentas
// de cliente (Fase D)") para /mesa-de-ayuda/cuenta/* — distinto del token de portal por TICKET
// (src/lib/portal/token.ts, scope:"portal", 15 min) y del JWT interno (src/lib/auth/token.ts).
// Los tres son módulos separados, nunca se mezclan.
//
// A propósito en localStorage, no sessionStorage: a diferencia del token de ticket (efímero, 15
// min, portal en equipo compartido), este es una sesión persistente de verdad — tiene que
// sobrevivir cerrar la pestaña/el navegador, igual que el JWT interno (src/lib/auth/token.ts).
// Mismos try/catch de SSR/modo privado que esos dos módulos.

const CUENTA_TOKEN_KEY = "siga-ot:cuenta-token";

export function getCuentaToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CUENTA_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCuentaToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUENTA_TOKEN_KEY, token);
  } catch {
    // localStorage no disponible: la sesión de cuenta simplemente no persiste entre recargas.
  }
}

export function clearCuentaToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CUENTA_TOKEN_KEY);
  } catch {
    // ver setCuentaToken
  }
}
