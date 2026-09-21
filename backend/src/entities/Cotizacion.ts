import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Cliente } from "./Cliente.js";
import { Ot } from "./Ot.js";
import { EstadoCotizacion } from "./enums.js";
import { bigintTransformer, uuidTransformer } from "./transformers.js";

@Entity("cotizacion")
export class Cotizacion {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 12, unique: true })
  numero!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  otId!: string | null;

  @ManyToOne(() => Ot, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot | null;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: "NO ACTION" })
  @JoinColumn({ name: "cliente_id" })
  cliente!: Cliente | null;

  @Column({ type: "bigint", transformer: bigintTransformer })
  montoClp!: number;

  @Column({ type: "date", default: () => "CONVERT(date, SYSDATETIMEOFFSET())" })
  fecha!: string;

  @Column({ type: "nvarchar", length: 12, default: EstadoCotizacion.BORRADOR })
  estado!: EstadoCotizacion;

  @Column({ type: "smallint", default: 1 })
  version!: number;

  // Una sola principal por OT (índice único filtrado en BD)
  @Column({ type: "bit", default: false })
  esPrincipal!: boolean;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  aprobadaEn!: Date | null;

  // Soft delete: anular en vez de borrar
  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  anuladaEn!: Date | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
