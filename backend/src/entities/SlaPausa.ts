import { Column, Entity, PrimaryColumn } from "typeorm";
import { EntidadAsignable } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

@Entity("sla_pausa")
export class SlaPausa {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 10 })
  entidadTipo!: EntidadAsignable;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  entidadId!: string;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  desde!: Date;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  hasta!: Date | null;

  @Column({ type: "nvarchar", length: 200, nullable: true })
  motivo!: string | null;
}
