import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { Rol } from "./enums.js";
import { uuidTransformer } from "./transformers.js";

// Usuario técnico (inactivo) para recepcionado_por de tickets de portal/correo. Nunca inicia sesión.
export const SISTEMA_USERNAME = "sistema";

@Entity("usuario")
export class Usuario {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 50, unique: true })
  username!: string;

  @Column({ type: "nvarchar", length: 120 })
  nombre!: string;

  @Column({ type: "nvarchar", length: 80, nullable: true })
  cargo!: string | null;

  @Column({ type: "nvarchar", length: 160, unique: true })
  email!: string;

  // select:false → nunca viaja en un find() normal; el login lo pide explícitamente con addSelect.
  @Column({ type: "nvarchar", length: 120, select: false })
  passwordHash!: string;

  @Column({ type: "nvarchar", length: 20 })
  rol!: Rol;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @Column({ type: "bit", default: false })
  mustChangePassword!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
