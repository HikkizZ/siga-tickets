import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ticket } from "./Ticket.js";
import { EstadoCorreoIngerido } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

@Entity("correo_ingerido")
export class CorreoIngerido {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  // UNIQUE: garantiza idempotencia de la ingesta
  @Column({ type: "nvarchar", length: 255, unique: true })
  messageId!: string;

  @Column({ type: "nvarchar", length: 60 })
  origen!: string;

  @Column({ type: "datetimeoffset", precision: 3 })
  recibidoEn!: Date;

  @Column({ type: "nvarchar", length: 12, default: EstadoCorreoIngerido.PENDIENTE })
  estado!: EstadoCorreoIngerido;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  ticketId!: string | null;

  @ManyToOne(() => Ticket, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: Ticket | null;

  @Column({ type: "nvarchar", length: "max", nullable: true })
  error!: string | null;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  rawRef!: string | null;
}
