import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { uuidTransformer } from "./transformers.js";

// Fase B1: catálogo simple de departamentos (inspirado en osTicket, pero aditivo). A propósito no
// es un rediseño de ruteo ni de permisos: solo metadata asignable opcionalmente a un usuario
// (Usuario.departamentoId) y a un tema de ayuda (TemaAyuda.departamentoId).
@Entity("departamento")
export class Departamento {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 120, unique: true })
  nombre!: string;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
