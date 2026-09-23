// Token de portal (JWT, scope:"portal", TTL 15 min, docs/api.md sección "Pública (Fase 5)") para
// /mesa-de-ayuda/seguimiento — distinto del JWT interno (src/lib/auth/token.ts), nunca se mezclan.
// Se guarda en sessionStorage, no localStorage: el portal es de cara al público, posiblemente en
// equipos compartidos, y el token ya expira solo en 15 minutos de todas formas — sessionStorage
// se limpia al cerrar la pestaña, que es el comportamiento correcto acá. Junto al token se guarda
// el número del ticket al que corresponde, para no tener que re-pedir el formulario si el usuario
// navega directo a /mesa-de-ayuda/seguimiento con un token ya guardado. Mismos try/catch de
// SSR/modo privado que ya usa token.ts.

const PORTAL_TOKEN_KEY = "siga-ot:portal-token";

type PortalTokenGuardado = { token: string; numero: string };

export function getPortalToken(): PortalTokenGuardado | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.sessionStorage.getItem(PORTAL_TOKEN_KEY);
    if (!crudo) return null;
    return JSON.parse(crudo) as PortalTokenGuardado;
  } catch {
    return null;
  }
}

export function setPortalToken(token: string, numero: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PORTAL_TOKEN_KEY, JSON.stringify({ token, numero } satisfies PortalTokenGuardado));
  } catch {
    // sessionStorage no disponible: el seguimiento simplemente no persiste entre recargas.
  }
}

export function clearPortalToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PORTAL_TOKEN_KEY);
  } catch {
    // ver setPortalToken
  }
}
