import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { MensajeTicket } from "./MensajeTicket.js";
import { EstadoCorreoSaliente } from "./enums.js";
import { jsonTransformer, uuidTransformer } from "./transformers.js";

// Outbox transaccional: se inserta en la misma transacción del hecho que lo origina.
@Entity("correo_saliente")
export class CorreoSaliente {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 60 })
  plantilla!: string;

  @Column({ type: "nvarchar", length: 320 })
  para!: string;

  @Column({ type: "nvarchar", length: 300 })
  asunto!: string;

  @Column({ type: "nvarchar", length: "max" })
  cuerpoHtml!: string;

  @Column({ type: "nvarchar", length: "max", default: () => "'{}'", transformer: jsonTransformer })
  headers!: Record<string, string>;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  mensajeTicketId!: string | null;

  @ManyToOne(() => MensajeTicket, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "mensaje_ticket_id" })
  mensajeTicket!: MensajeTicket | null;

  @Column({ type: "nvarchar", length: 12, default: EstadoCorreoSaliente.PENDIENTE })
  estado!: EstadoCorreoSaliente;

  @Column({ type: "smallint", default: 0 })
  intentos!: number;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  proximoIntentoEn!: Date;

  @Column({ type: "nvarchar", length: "max", nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
