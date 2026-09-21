import { Column, Entity, PrimaryColumn } from "typeorm";

// Se incrementa solo vía siguienteFolio() (services/folio.service.ts), dentro de la transacción del insert.
@Entity("folio_counter")
export class FolioCounter {
  @PrimaryColumn({ type: "nvarchar", length: 8 })
  serie!: string;

  // bigint llega como string
  @Column({ type: "bigint" })
  ultimo!: string;

  @Column({ type: "smallint" })
  ancho!: number;
}
