import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
import { Cliente } from "./Cliente.js";
import { EtapaOt } from "./EtapaOt.js";
import { Prioridad } from "./Prioridad.js";
import { Usuario } from "./Usuario.js";
import { CategoriaOt, EstadoOt, OrigenOt, SlaEstado } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

@Entity("ot")
export class Ot {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 12, unique: true })
  numero!: string;

  @Column({ type: "nvarchar", length: 200 })
  titulo!: string;

  @Column({ type: "nvarchar", length: "max" })
  descripcion!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "cliente_id" })
  cliente!: Cliente | null;

  @Column({ type: "nvarchar", length: 120, nullable: true })
  areaInterna!: string | null;

  // CHECK en BD: interna implica área y sin cliente; no interna implica cliente.
  @Column({ type: "bit", default: false })
  esInterna!: boolean;

  @Column({ type: "nvarchar", length: 20 })
  categoria!: CategoriaOt;

  // Fase C: antes columna string con CHECK (mismo enum que Ticket); ahora FK al catálogo
  // compartido (entities/Prioridad.ts) — comparte tabla con Ticket.prioridadId.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  prioridadId!: string;

  @ManyToOne(() => Prioridad, { nullable: false, onDelete: "NO ACTION" })
  @JoinColumn({ name: "prioridad_id" })
  prioridad!: Prioridad;

  @Column({ type: "nvarchar", length: 20 })
  origen!: OrigenOt;

  @Column({ type: "nvarchar", length: 200, nullable: true })
  ubicacion!: string | null;

  @Column({ type: "nvarchar", length: 120, nullable: true })
  solicitanteNombre!: string | null;

  @Column({ type: "nvarchar", length: 160, nullable: true })
  solicitanteContacto!: string | null;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  fechaIngreso!: Date;

  @Column({ type: "date", nullable: true })
  fechaEstimadaTermino!: string | null;

  @Column({ type: "nvarchar", length: 20, default: EstadoOt.INGRESADO })
  estado!: EstadoOt;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  recepcionadoPorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "recepcionado_por_id" })
  recepcionadoPor!: Usuario;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  responsableActualId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "responsable_actual_id" })
  responsableActual!: Usuario | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  terminadoEn!: Date | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  slaResolucionVenceEn!: Date | null;

  @Column({ type: "nvarchar", length: 12, default: SlaEstado.EN_PLAZO })
  slaEstado!: SlaEstado;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  slaPausadoDesde!: Date | null;

  @OneToMany(() => EtapaOt, (e) => e.ot, { cascade: true })
  etapas!: EtapaOt[];

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
