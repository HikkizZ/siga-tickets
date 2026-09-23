import { Column, Entity, PrimaryColumn } from "typeorm";

// Cursor de lectura del buzón (Fase 6), persistido entre reinicios del worker. Una fila por
// origen (MailboxSource.nombre()); sembrada vacía, la crea el primer procesarIngesta() (MERGE en
// jobs/ingestaCorreoJob.ts). Mismo espíritu minimalista que FolioCounter.
@Entity("mailbox_cursor")
export class MailboxCursor {
  @PrimaryColumn({ type: "nvarchar", length: 60 })
  origen!: string;

  @Column({ type: "nvarchar", length: 128 })
  cursor!: string;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
