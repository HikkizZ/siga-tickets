import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { PlanSla } from "./PlanSla.js";
import { uuidTransformer } from "./transformers.js";

// Fase C: catálogo configurable de prioridades de Ticket/OT (antes enum fijo alta/media/baja en
// entities/enums.ts). Ticket.prioridadId y Ot.prioridadId apuntan a esta misma tabla — antes
// compartían el mismo enum TS, ahora comparten la misma fila de catálogo.
//
// planSlaId conecta cada prioridad a un Plan SLA (Fase B2, antes sin uso real) y retira sla_config
// (3 filas fijas por el enum viejo): el SLA de verdad se calcula desde el plan asignado aquí. Una
// prioridad sin plan asignado (planSlaId NULL) no tiene SLA — sus vencimientos quedan NULL, columnas
// ya nullable en Ticket/Ot.
@Entity("prioridad")
export class Prioridad {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 60, unique: true })
  nombre!: string;

  @Column({ type: "int", default: 0 })
  orden!: number;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  planSlaId!: string | null;

  @ManyToOne(() => PlanSla, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "plan_sla_id" })
  planSla!: PlanSla | null;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
