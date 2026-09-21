import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ticket } from "./Ticket.js";
import { Usuario } from "./Usuario.js";
import { TipoMensajeTicket } from "./enums.js";
import { jsonTransformer, uuidTransformer } from "./transformers.js";

// Append-only. El CHECK autor/tipo vive en la migración.
@Entity("mensaje_ticket")
export class MensajeTicket {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  ticketId!: string;

  @ManyToOne(() => Ticket, (t) => t.mensajes, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: Ticket;

  @Column({ type: "nvarchar", length: 20 })
  tipo!: TipoMensajeTicket;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  autorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "autor_id" })
  autor!: Usuario | null;

  @Column({ type: "nvarchar", length: 160, nullable: true })
  autorExterno!: string | null;

  @Column({ type: "nvarchar", length: "max" })
  cuerpo!: string;

  // HTML ya sanitizado
  @Column({ type: "nvarchar", length: "max", nullable: true })
  cuerpoHtml!: string | null;

  // UNIQUE solo cuando no es NULL: índice filtrado uq_mensaje_ticket_message_id (un UNIQUE de
  // SQL Server admitiría un único NULL).
  @Column({ type: "nvarchar", length: 255, nullable: true })
  messageId!: string | null;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  inReplyTo!: string | null;

  @Column({ type: "nvarchar", length: "max", nullable: true, transformer: jsonTransformer })
  referencias!: string[] | null;

  @Column({ type: "datetimeoffset", precision: 3, nullable: true })
  enviadoEn!: Date | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;
}
