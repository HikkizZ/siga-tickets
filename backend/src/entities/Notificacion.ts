import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

@Entity("notificacion")
export class Notificacion {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  usuarioId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ type: "nvarchar", length: 40 })
  tipo!: string;

  @Column({ type: "nvarchar", length: 20 })
  entidadTipo!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  entidadId!: string;

  @Column({ type: "nvarchar", length: 200 })
  titulo!: string;

  @Column({ type: "nvarchar", length: "max" })
  cuerpo!: string;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  leidaEn!: Date | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;
}
