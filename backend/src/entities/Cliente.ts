import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { uuidTransformer } from "./transformers.js";

@Entity("cliente")
export class Cliente {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 160, unique: true })
  nombre!: string;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
