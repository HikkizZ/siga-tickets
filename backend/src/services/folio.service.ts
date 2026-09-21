import type { DataSource, EntityManager } from "typeorm";

export type SerieFolio = "TK" | "OT" | "COT";

declare const transaccional: unique symbol;

// Marca de tipo: un EntityManager cualquiera NO es asignable a este; la única forma de
// obtener uno es enTransaccion(). Así siguienteFolio no compila fuera de una transacción.
export type ManagerTransaccional = EntityManager & { readonly [transaccional]: true };

export function enTransaccion<T>(ds: DataSource, fn: (manager: ManagerTransaccional) => Promise<T>): Promise<T> {
  return ds.transaction((manager) => fn(manager as ManagerTransaccional));
}

// Sin huecos: el contador se incrementa dentro de la misma transacción que inserta el
// registro, así un rollback también revierte el folio (una SEQUENCE dejaría hueco). El
// UPDATE toma el lock de la fila y serializa a los concurrentes.
export async function siguienteFolio(manager: ManagerTransaccional, serie: SerieFolio): Promise<string> {
  // Barrera en runtime por si alguien esquiva el tipo con un cast.
  if (!manager.queryRunner?.isTransactionActive) {
    throw new Error("siguienteFolio exige una transacción activa");
  }

  // OUTPUT devuelve la fila ya incrementada en la misma sentencia atómica. El número se
  // rellena con ceros hasta `ancho` y, a diferencia de lpad de PG, nunca se trunca si lo excede.
  const filas: Array<{ folio: string }> = await manager.query(
    `UPDATE folio_counter SET ultimo = ultimo + 1
     OUTPUT inserted.serie + '-' + RIGHT(
       REPLICATE('0', inserted.ancho) + CAST(inserted.ultimo AS nvarchar(20)),
       CASE WHEN LEN(CAST(inserted.ultimo AS nvarchar(20))) > inserted.ancho
            THEN LEN(CAST(inserted.ultimo AS nvarchar(20))) ELSE inserted.ancho END
     ) AS folio
     WHERE serie = @0`,
    [serie],
  );
  const folio = filas[0]?.folio;
  if (!folio) throw new Error(`Serie de folio desconocida: ${serie}`);
  return folio;
}
