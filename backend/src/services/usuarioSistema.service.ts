import { Usuario, SISTEMA_USERNAME } from "../entities/Usuario.js";
import type { ManagerTransaccional } from "./folio.service.js";

// El usuario 'sistema' ya existe desde el seed de la Fase 0 (scripts/seed.ts): nunca se crea desde
// aquí. Se cachea en memoria porque el portal lo necesita en cada ticket/mensaje/adjunto público y
// nunca cambia en producción (~8 usuarios, sin motivo para pegarle a la BD cada vez).
let cacheId: string | null = null;

export async function obtenerUsuarioSistemaId(manager: ManagerTransaccional): Promise<string> {
  if (cacheId) return cacheId;
  const u = await manager.findOne(Usuario, { where: { username: SISTEMA_USERNAME } });
  if (!u) throw new Error("El usuario 'sistema' no existe: falta ejecutar el seed de la Fase 0 (npm run seed)");
  cacheId = u.id;
  return cacheId;
}

// Solo para tests: test/helpers.ts::limpiarBD() trunca la tabla usuario entre cada test, así que
// el id cacheado quedaría apuntando a una fila ya borrada. El cache de arriba está pensado para un
// proceso de producción donde 'sistema' no cambia nunca; en la suite sí "cambia" (se recrea en
// cada test), así que hay que invalidarlo en el único lugar que borra esa fila.
export function _resetCacheUsuarioSistemaParaTests(): void {
  cacheId = null;
}
