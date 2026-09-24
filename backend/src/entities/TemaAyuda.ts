import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Departamento } from "./Departamento.js";
import { Prioridad } from "./Prioridad.js";
import { uuidTransformer } from "./transformers.js";

// Fase B1: catálogo de temas de ayuda (inspirado en osTicket "Help Topics"), aditivo. Se puede
// asignar opcionalmente a un ticket (Ticket.temaAyudaId, ver ticket.service.ts::crearTicket) sin
// ningún comportamiento automático todavía: autocompletar prioridad/departamento al elegir un
// tema es una decisión de UX que queda para una fase posterior de frontend.
@Entity("tema_ayuda")
export class TemaAyuda {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 120, unique: true })
  nombre!: string;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  // Si aparece como opción en el portal público (fase futura) o es solo interno.
  @Column({ type: "bit", default: true })
  esPublico!: boolean;

  // Departamento sugerido por defecto; nullable, sin FK obligatoria.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  departamentoId!: string | null;

  @ManyToOne(() => Departamento, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "departamento_id" })
  departamento!: Departamento | null;

  // Fase C: antes columna string espejo del CHECK de Prioridad; ahora FK opcional al catálogo.
  @Column({ type: "uniqueidentifier", transformer: uuidTransformer, nullable: true })
  prioridadSugeridaId!: string | null;

  @ManyToOne(() => Prioridad, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "prioridad_sugerida_id" })
  prioridadSugerida!: Prioridad | null;

  // Orden manual para el listado (en vez de solo alfabético); ver GET /temas-ayuda.
  @Column({ type: "int", default: 0 })
  orden!: number;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
