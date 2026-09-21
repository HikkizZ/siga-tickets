import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { EntidadAsignable } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

// entidad_tipo/entidad_id son polimórficos: columnas planas, sin FK.
// Se actualiza solo para cerrar el tramo (hasta); nunca se borra.
@Entity("asignacion")
export class Asignacion {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 10 })
  entidadTipo!: EntidadAsignable;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  entidadId!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  usuarioId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  desde!: Date;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  hasta!: Date | null;

  @Column({ type: "nvarchar", length: "max", nullable: true })
  motivoEntrada!: string | null;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  derivadoPorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "derivado_por_id" })
  derivadoPor!: Usuario | null;

  // Columna calculada DATEDIFF(SECOND, desde, hasta): solo lectura desde TypeORM.
  @Column({ type: "int", nullable: true, insert: false, update: false })
  duracionSeg!: number | null;
}
