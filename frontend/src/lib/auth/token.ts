// Guarda el JWT en localStorage (decisión de diseño: app interna de ~8 personas, sin scripts de
// terceros — ver docs/frontend-diseno.md). Todo acceso pasa por acá para no repetir el try/catch
// de "localStorage puede no existir" (SSR, modo privado, cuotas) en cada llamador.

const TOKEN_KEY = "siga-ot:token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage no disponible: la sesión simplemente no persiste entre recargas.
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ver setToken
  }
}
