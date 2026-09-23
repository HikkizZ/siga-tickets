import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { uuidTransformer } from "./transformers.js";

// Fase D: cuenta de cliente del portal público, con login persistente. SUMADA al flujo existente
// de número+correo (portal.seguimiento.service.ts, token de 15 min por ticket) — no lo reemplaza.
// Completamente separada de Usuario (staff interno): nunca se mezcla con roles ni permisos
// internos, ni con ninguna tabla de ese mundo.
@Entity("cuenta_portal")
export class CuentaPortal {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  // Case-insensitive por la colación de la BD (Modern_Spanish_CI_AS), mismo criterio que
  // ticket.solicitanteEmail: sin LOWER() en ninguna consulta.
  @Column({ type: "nvarchar", length: 320, unique: true })
  email!: string;

  // select:false → nunca viaja en un find() normal; el login lo pide explícitamente con addSelect
  // (mismo criterio que Usuario.passwordHash).
  @Column({ type: "nvarchar", length: 120, select: false })
  passwordHash!: string;

  @Column({ type: "nvarchar", length: 120 })
  nombre!: string;

  // Activa de inmediato al registrarse: sin verificación de correo en esta fase (mismo nivel de
  // confianza que ya tiene hoy la creación de un ticket del portal).
  @Column({ type: "bit", default: true })
  activo!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
