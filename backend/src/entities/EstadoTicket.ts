import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { uuidTransformer } from "./transformers.js";

// Fase C: catálogo configurable de estados de Ticket (antes enum fijo nuevo/abierto/
// esperando_cliente/resuelto/cerrado en entities/enums.ts). Las 5 filas sembradas por la migración
// conservan el comportamiento especial que antes vivía codificado por valor literal en
// ticket.service.ts/ticket.common.ts, ahora expresado en estos flags:
//   - esEstadoInicial: estado con el que nace un ticket nuevo (debe haber exactamente una fila así).
//   - esDestinoReapertura: a qué estado vuelve un ticket al reabrirse (reabrirTicketSiCorresponde).
//   - esPausaSla: entrar a este estado pausa el reloj de SLA del ticket; salir lo reanuda.
//   - marcaResueltoEn / marcaCerradoEn: al entrar a este estado por primera vez se fija
//     Ticket.resueltoEn / Ticket.cerradoEn (una sola vez, no se borra al salir).
//   - esTerminal: excluye al ticket de la evaluación de SLA (jobs/slaJob.ts) y de los conteos de
//     "abiertos" (antes `estado NOT IN ('resuelto','cerrado')` literal en SQL).
// Un estado nuevo creado por el admin no activa ninguno de estos comportamientos a menos que se
// marque explícitamente: por defecto es un estado intermedio normal, no terminal.
@Entity("estado_ticket")
export class EstadoTicket {
  @PrimaryColumn({ type: "uniqueidentifier", default: () => "NEWID()", transformer: uuidTransformer })
  id!: string;

  @Column({ type: "nvarchar", length: 60, unique: true })
  nombre!: string;

  @Column({ type: "int", default: 0 })
  orden!: number;

  @Column({ type: "bit", default: true })
  activo!: boolean;

  @Column({ type: "bit", default: false })
  esEstadoInicial!: boolean;

  @Column({ type: "bit", default: false })
  esDestinoReapertura!: boolean;

  @Column({ type: "bit", default: false })
  esPausaSla!: boolean;

  @Column({ type: "bit", default: false })
  marcaResueltoEn!: boolean;

  @Column({ type: "bit", default: false })
  marcaCerradoEn!: boolean;

  @Column({ type: "bit", default: false })
  esTerminal!: boolean;

  @CreateDateColumn({ type: "datetimeoffset", precision: 3 })
  creadoEn!: Date;

  @Column({ type: "datetimeoffset", precision: 3, default: () => "SYSDATETIMEOFFSET()" })
  actualizadoEn!: Date;
}
