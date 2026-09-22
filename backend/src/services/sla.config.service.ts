import { AppDataSource } from "../config/dataSource.js";
import { SlaConfig } from "../entities/SlaConfig.js";
import type { Prioridad } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { enTransaccion } from "./folio.service.js";
import { recalcularAbiertosPorPrioridad } from "./sla.calculo.service.js";

export interface SlaConfigDto {
  prioridad: Prioridad;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles: boolean;
  pausarEnEsperaCliente: boolean;
  umbralPorVencer: number;
}

const toDto = (c: SlaConfig): SlaConfigDto => ({
  prioridad: c.prioridad,
  horasResolucion: c.horasResolucion,
  horasPrimeraRespuesta: c.horasPrimeraRespuesta,
  usarHorasHabiles: c.usarHorasHabiles,
  pausarEnEsperaCliente: c.pausarEnEsperaCliente,
  umbralPorVencer: c.umbralPorVencer,
});

export async function obtenerSlaConfig(): Promise<SlaConfigDto[]> {
  const filas = await AppDataSource.getRepository(SlaConfig).find({ order: { prioridad: "ASC" } });
  return filas.map(toDto);
}

export interface CambioSlaConfig {
  prioridad: Prioridad;
  horasResolucion?: number | undefined;
  horasPrimeraRespuesta?: number | undefined;
  usarHorasHabiles?: boolean | undefined;
  pausarEnEsperaCliente?: boolean | undefined;
  umbralPorVencer?: number | undefined;
}

// Actualiza una o más filas de sla_config y, por cada una, recalcula en la misma transacción el
// vencimiento de todo lo abierto de esa prioridad (recalcularAbiertosPorPrioridad).
export async function actualizarSlaConfig(cambios: CambioSlaConfig[]): Promise<SlaConfigDto[]> {
  await enTransaccion(AppDataSource, async (m) => {
    for (const c of cambios) {
      const fila = await m.findOne(SlaConfig, { where: { prioridad: c.prioridad } });
      // No debería pasar: Zod ya restringe prioridad a alta/media/baja y la migración siembra
      // las 3 filas; código defensivo por si algún día la semilla cambia.
      if (!fila) throw new AppError(400, "SLA_CONFIG_INVALIDO", `Prioridad desconocida: ${c.prioridad}`);

      if (c.horasResolucion !== undefined) fila.horasResolucion = c.horasResolucion;
      if (c.horasPrimeraRespuesta !== undefined) fila.horasPrimeraRespuesta = c.horasPrimeraRespuesta;
      if (c.usarHorasHabiles !== undefined) fila.usarHorasHabiles = c.usarHorasHabiles;
      if (c.pausarEnEsperaCliente !== undefined) fila.pausarEnEsperaCliente = c.pausarEnEsperaCliente;
      if (c.umbralPorVencer !== undefined) fila.umbralPorVencer = c.umbralPorVencer;

      await m.save(SlaConfig, fila);
      await recalcularAbiertosPorPrioridad(m, c.prioridad, fila);
    }
  });
  return obtenerSlaConfig();
}
