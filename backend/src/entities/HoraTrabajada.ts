import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ot } from "./Ot.js";
import { Usuario } from "./Usuario.js";
import { numericTransformer, uuidTransformer } from "./transformers.js";

@Entity("hora_trabajada")
export class HoraTrabajada {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  otId!: string;

  @ManyToOne(() => Ot, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  usuarioId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ type: "date" })
  fecha!: string;

  // CHECK en BD: 0 < horas <= 24
  @Column({ type: "decimal", precision: 5, scale: 2, transformer: numericTransformer })
  horas!: number;

  @Column({ type: "nvarchar", length: "max", nullable: true })
  detalle!: string | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
