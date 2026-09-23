import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Usuario } from "./Usuario.js";
import { uuidTransformer } from "./transformers.js";

// Fase A: config del buzón (IMAP entrante + SMTP saliente), antes fija por variables de entorno,
// ahora una fila administrable en BD (PUT /correo/config, solo admin). Hoy existe un único buzón
// conocido (decisión 0.1 del diseño): "singleton" simple, sin CRUD de múltiples buzones. El
// mecanismo elegido es un id FIJO y conocido de antemano (no NEWID()): el servicio siempre busca/
// upserta esta misma fila por este id; nunca hay una segunda.
export const CONFIGURACION_CORREO_ID = "00000000-0000-0000-0000-000000000001";

@Entity("configuracion_correo")
export class ConfiguracionCorreo {
  @PrimaryColumn({ type: "uniqueidentifier", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  imapHost!: string | null;

  @Column({ type: "int", nullable: true })
  imapPort!: number | null;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  imapUser!: string | null;

  // select:false → nunca viaja en un find()/GET normal, ni cifrada (mismo principio que
  // Usuario.passwordHash): solo la trae explícitamente correoConfig.service.ts vía addSelect.
  @Column({ type: "nvarchar", length: 500, nullable: true, select: false })
  imapPasswordCifrado!: string | null;

  @Column({ type: "nvarchar", length: 120, nullable: true })
  imapFolder!: string | null;

  @Column({ type: "bit", default: true })
  imapTls!: boolean;

  @Column({ type: "bit", default: false })
  imapHabilitado!: boolean;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  smtpHost!: string | null;

  @Column({ type: "int", nullable: true })
  smtpPort!: number | null;

  @Column({ type: "nvarchar", length: 255, nullable: true })
  smtpUser!: string | null;

  @Column({ type: "nvarchar", length: 500, nullable: true, select: false })
  smtpPasswordCifrado!: string | null;

  @Column({ type: "bit", default: true })
  smtpTls!: boolean;

  @Column({ type: "bit", default: false })
  smtpHabilitado!: boolean;

  // Remitente completo del SMTP saliente, p. ej. "Soporte <soporte@sigaltda.cl>". Reemplaza
  // env.mail.soporteEmail SOLO como "From" del envío real (SmtpMailer); soporteEmail sigue
  // viviendo en env.ts porque otro código fuera de mail/ lo usa para otra cosa (ver decisión
  // documentada en docs/backend-diseno.md, sección de esta fase).
  @Column({ type: "nvarchar", length: 255, nullable: true })
  correoDesde!: string | null;

  // Dominio para el Message-ID del buzón propio, administrable junto con el resto de la config.
  @Column({ type: "nvarchar", length: 120, nullable: true })
  dominio!: string | null;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;

  // Auditoría simple (sin tabla de eventos aparte): quién hizo el último cambio.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  actualizadoPorId!: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "actualizado_por_id" })
  actualizadoPor!: Usuario | null;
}
