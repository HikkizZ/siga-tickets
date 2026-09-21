import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ot } from "./Ot.js";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

@Entity("ot_colaborador")
export class OtColaborador {
  @PrimaryColumn({ type: "uniqueidentifier", transformer: uuidTransformer })
  otId!: string;

  @ManyToOne(() => Ot, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot;

  @PrimaryColumn({ type: "uniqueidentifier", transformer: uuidTransformer })
  usuarioId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  agregadoPorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "agregado_por_id" })
  agregadoPor!: Usuario;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;
}
