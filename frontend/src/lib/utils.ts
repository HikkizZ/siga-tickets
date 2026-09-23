import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciales (máx. 2 letras) a partir de un nombre completo, para avatares de usuarios reales
 * del backend (que no traen `iniciales` precalculadas, a diferencia del mock). */
export function inicialesDeNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeras = partes.length === 1 ? partes[0]!.slice(0, 2) : `${partes[0]![0]}${partes[1]![0]}`;
  return primeras.toUpperCase();
}
