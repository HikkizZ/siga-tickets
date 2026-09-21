import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ot } from "./Ot.js";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

@Entity("comentario_ot")
export class ComentarioOt {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  otId!: string;

  @ManyToOne(() => Ot, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  autorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "autor_id" })
  autor!: Usuario;

  @Column({ type: "nvarchar", length: "max" })
  cuerpo!: string;

  // Interno por defecto
  @Column({ type: "bit", default: false })
  visibleCliente!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
