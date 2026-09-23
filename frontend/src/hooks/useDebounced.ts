import { useEffect, useState } from "react";

/** Valor debounced (Fase 1): el filtro de texto del Tablero y Todas las OT ahora pega contra el
 * backend en cada cambio — sin esto, cada tecla dispararía un GET /ots nuevo. */
export function useDebounced<T>(valor: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(valor), delayMs);
    return () => clearTimeout(t);
  }, [valor, delayMs]);
  return debounced;
}
