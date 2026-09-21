import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ot } from "./Ot.js";
import { uuidTransformer } from "./transformers.js";

@Entity("etapa_ot")
export class EtapaOt {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  otId!: string;

  @ManyToOne(() => Ot, (o) => o.etapas, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot;

  @Column({ type: "nvarchar", length: 120 })
  nombre!: string;

  @Column({ type: "date" })
  fechaInicio!: string;

  @Column({ type: "date" })
  fechaTermino!: string;

  @Column({ type: "smallint" })
  orden!: number;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
