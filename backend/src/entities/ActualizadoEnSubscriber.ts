import { EventSubscriber, type EntitySubscriberInterface, type UpdateEvent } from "typeorm";

// @UpdateDateColumn de TypeORM en SQL Server escribe CURRENT_TIMESTAMP, que es un datetime en
// HORA LOCAL del servidor (Chile, -03:00) y al convertirlo a datetimeoffset queda con offset
// +00:00: desfasado. Por eso actualizado_en es una columna normal y se fija aquí, en UTC,
// en cada save(). En un UPDATE por query builder hay que pasar actualizadoEn explícitamente.
@EventSubscriber()
export class ActualizadoEnSubscriber implements EntitySubscriberInterface {
  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    if (event.entity && event.metadata.columns.some((c) => c.propertyName === "actualizadoEn")) {
      event.entity.actualizadoEn = new Date();
    }
  }
}
