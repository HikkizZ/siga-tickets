import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Ot } from "./Ot.js";
import { Ticket } from "./Ticket.js";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

@Entity("ticket_ot")
export class TicketOt {
  @PrimaryColumn({ type: "uniqueidentifier", transformer: uuidTransformer })
  ticketId!: string;

  @ManyToOne(() => Ticket, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: Ticket;

  @PrimaryColumn({ type: "uniqueidentifier", transformer: uuidTransformer })
  otId!: string;

  @ManyToOne(() => Ot, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "ot_id" })
  ot!: Ot;

  // Índice único filtrado: una OT tiene a lo más un ticket de origen.
  @Column({ type: "bit", default: false })
  esOrigen!: boolean;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  vinculadoPorId!: string;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "vinculado_por_id" })
  vinculadoPor!: Usuario;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;
}
