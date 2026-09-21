import type { Adjunto } from "../entities/Adjunto.js";

// storage_key y sha256 son internos (revelan dónde y cómo se guarda): no salen en la API.
export function toAdjuntoDto(a: Adjunto) {
  return {
    id: a.id,
    nombre: a.nombre,
    mime: a.mime,
    tamanoBytes: a.tamanoBytes,
    estado: a.estado,
    subidoPor: a.subidoPor ? { id: a.subidoPor.id, nombre: a.subidoPor.nombre } : null,
    creadoEn: a.creadoEn,
  };
}
export type AdjuntoDto = ReturnType<typeof toAdjuntoDto>;
