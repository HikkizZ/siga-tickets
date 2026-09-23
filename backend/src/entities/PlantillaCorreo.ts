import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

// Fase B2: plantillas de correo editables (catálogo administrable por un admin, PUT
// /correo/plantillas/:nombre), con fallback seguro al texto fijo de
// mail/outbound/plantillas.ts::renderPlantilla cuando no hay fila para `nombre`, cuando
// `activa=false`, o cuando falla la interpolación (ver renderPlantillaConfigurable en ese mismo
// archivo). `nombre` es de tipo `string` (no un enum TS acá, mismo criterio que
// CorreoSaliente.plantilla) pero en la práctica solo toma uno de los 3 valores de
// mail/outbound/plantillas.ts::NombrePlantilla — Zod lo restringe en la validación de entrada.
@Entity("plantilla_correo")
export class PlantillaCorreo {
  @PrimaryColumn({ type: "nvarchar", length: 40 })
  nombre!: string;

  @Column({ type: "nvarchar", length: 500 })
  asunto!: string;

  @Column({ type: "nvarchar", length: "max" })
  cuerpoHtml!: string;

  @Column({ type: "bit", default: true })
  activa!: boolean;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;

  // Auditoría simple (sin tabla de eventos aparte), mismo patrón que ConfiguracionCorreo.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  actualizadoPorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actualizado_por_id" })
  actualizadoPor!: Usuario | null;
}
