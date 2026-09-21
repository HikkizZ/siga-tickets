import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { EntidadEvento } from "./enums.js";
import { jsonTransformer, uuidTransformer } from "./transformers.js";

// Auditoría inmutable: un trigger de la BD rechaza UPDATE y DELETE.
@Entity("evento")
export class Evento {
  // bigint llega como string
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Column({ type: "nvarchar", length: 10 })
  entidadTipo!: EntidadEvento;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer })
  entidadId!: string;

  @Column({ type: "nvarchar", length: 40 })
  tipo!: string;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  actorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actor_id" })
  actor!: Usuario | null;

  @Column({ type: "nvarchar", length: 160, nullable: true })
  actorExterno!: string | null;

  @Column({ type: "nvarchar", length: "max", default: () => "'{}'", transformer: jsonTransformer })
  payload!: Record<string, unknown>;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  ocurridoEn!: Date;
}
