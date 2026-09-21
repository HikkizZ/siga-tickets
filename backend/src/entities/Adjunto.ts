import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { EntidadAdjunto, EstadoAdjunto } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

@Entity("adjunto")
export class Adjunto {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 10 })
  entidadTipo!: EntidadAdjunto;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  entidadId!: string;

  @Column({ type: "nvarchar", length: 255 })
  nombre!: string;

  @Column({ type: "nvarchar", length: 120 })
  mime!: string;

  @Column({ type: "int" })
  tamanoBytes!: number;

  @Column({ type: "nchar", length: 64 })
  sha256!: string;

  @Column({ type: "nvarchar", length: 255 })
  storageKey!: string;

  @Column({ type: "nvarchar", length: 12, default: EstadoAdjunto.ESCANEANDO })
  estado!: EstadoAdjunto;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  subidoPorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "subido_por_id" })
  subidoPor!: Usuario | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;
}
