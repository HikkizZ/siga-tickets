import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";
import { Cliente } from "./Cliente.js";
import { MensajeTicket } from "./MensajeTicket.js";
import { Usuario } from "./Usuario.js";
import { CanalTicket, EstadoTicket, Prioridad, SlaEstado } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

@Entity("ticket")
export class Ticket {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 12, unique: true })
  numero!: string;

  @Column({ type: "nvarchar", length: 200 })
  asunto!: string;

  @Column({ type: "nvarchar", length: "max" })
  descripcion!: string;

  @Column({ type: "nvarchar", length: 120 })
  solicitanteNombre!: string;

  // Case-insensitive por la colación de la BD (Modern_Spanish_CI_AS), no por el tipo.
  @Column({ type: "nvarchar", length: 320 })
  solicitanteEmail!: string;

  @Column({ type: "nvarchar", length: 40, nullable: true })
  solicitanteTelefono!: string | null;

  @Column({ type: "nvarchar", length: 160, nullable: true })
  solicitanteEmpresa!: string | null;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: "NO ACTION" })
  @JoinColumn({ name: "cliente_id" })
  cliente!: Cliente | null;

  @Column({ type: "nvarchar", length: 20 })
  canal!: CanalTicket;

  @Column({ type: "nvarchar", length: 10 })
  prioridad!: Prioridad;

  @Column({ type: "nvarchar", length: 20, default: EstadoTicket.NUEVO })
  estado!: EstadoTicket;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  fechaIngreso!: Date;

  // Inmutable: la BD no lo impide, el servicio no debe exponer forma de cambiarlo.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  recepcionadoPorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "recepcionado_por_id" })
  recepcionadoPor!: Usuario;

  // Denormalizado desde asignacion; NULL = nadie lo ha tomado.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  responsableActualId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "responsable_actual_id" })
  responsableActual!: Usuario | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  primeraRespuestaEn!: Date | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  resueltoEn!: Date | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  cerradoEn!: Date | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  slaResolucionVenceEn!: Date | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  slaRespuestaVenceEn!: Date | null;

  @Column({ type: "nvarchar", length: 12, default: SlaEstado.EN_PLAZO })
  slaEstado!: SlaEstado;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  slaPausadoDesde!: Date | null;

  @Column({ type: "uniqueidentifier", default: () => "NEWID()", unique: true, transformer: uuidTransformer })
  tokenPublico!: string;

  @OneToMany(() => MensajeTicket, (m) => m.ticket, { cascade: true })
  mensajes!: MensajeTicket[];

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
