import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { numericTransformer, uuidTransformer } from "./transformers.js";

// Fase B2: catálogo de Planes SLA con nombre propio (a diferencia de sla_config, que son 3 filas
// fijas por prioridad). Mismos 5 campos de configuración que SlaConfig, pero acá puede haber muchas
// filas, cada una activable/desactivable. ALCANCE ACOTADO A PROPÓSITO: esto es solo un catálogo
// CRUD, todavía sin ninguna relación desde OT/Ticket ni conectado al cálculo real de SLA (ese sigue
// siendo sla_config, sin cambios) — ver docs/backend-diseno.md, sección de esta fase.
@Entity("plan_sla")
export class PlanSla {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 160, unique: true })
  nombre!: string;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @Column({ type: "int" })
  horasResolucion!: number;

  @Column({ type: "int" })
  horasPrimeraRespuesta!: number;

  @Column({ type: "bit", default: true })
  usarHorasHabiles!: boolean;

  @Column({ type: "bit", default: true })
  pausarEnEsperaCliente!: boolean;

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0.2, transformer: numericTransformer })
  umbralPorVencer!: number;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
