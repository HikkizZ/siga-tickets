import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { OrigenOt } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

// Fase C: catálogo configurable de canales/fuente de Ticket (antes enum fijo portal/correo/
// telefono/presencial/interno en entities/enums.ts). Se muestra al admin como "Fuentes" en
// Configuración, aunque el nombre interno de la columna/entidad sigue siendo "canal" por
// continuidad con el resto del código (Ticket.canalId, ticket.validation.ts, etc.).
//   - esManual: si un humano puede elegir este canal al crear un ticket a mano (POST /tickets).
//     Portal y Correo quedan reservados a sus propios flujos automáticos (portal público, ingesta
//     de correo) — antes una lista blanca de Zod, ahora este flag por fila.
//   - origenOtEquivalente: a qué Origen de OT (enum fijo, sin cambios en esta fase) se traduce este
//     canal al convertir un ticket en OT (antes Record<CanalTicket, OrigenOt> exhaustivo en
//     ticket.conversion.service.ts; con un catálogo abierto ya no puede ser exhaustivo en tiempo de
//     compilación, así que la traducción vive en esta columna).
@Entity("canal_ticket")
export class CanalTicket {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 60, unique: true })
  nombre!: string;

  @Column({ type: "int", default: 0 })
  orden!: number;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @Column({ type: "bit", default: false })
  esManual!: boolean;

  @Column({ type: "nvarchar", length: 20 })
  origenOtEquivalente!: OrigenOt;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
