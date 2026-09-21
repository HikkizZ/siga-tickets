import { Column, Entity, PrimaryColumn } from "typeorm";
import { Prioridad } from "./enums.js";
import { numericTransformer } from "./transformers.js";

@Entity("sla_config")
export class SlaConfig {
  @PrimaryColumn({ type: "nvarchar", length: 10 })
  prioridad!: Prioridad;

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
}
