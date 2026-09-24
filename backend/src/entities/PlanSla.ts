import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { numericTransformer, uuidTransformer } from "./transformers.js";

// Fase B2: catálogo de Planes SLA con nombre propio (a diferencia del extinto sla_config, que eran
// 3 filas fijas por prioridad). Puede haber muchas filas, cada una activable/desactivable.
// Fase C: Prioridad.planSlaId conecta cada prioridad a un plan de aquí — este catálogo pasa a ser
// el único sistema real de cálculo de SLA (sla_config se retira) — ver entities/Prioridad.ts y
// docs/backend-diseno.md, sección de esta fase.
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
