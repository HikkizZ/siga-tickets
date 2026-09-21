import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("calendario_laboral")
export class CalendarioLaboral {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  // 1 = lunes ... 7 = domingo (ISO)
  @Column({ type: "smallint" })
  diaSemana!: number;

  // Formato HH:MM:SS
  @Column({ type: "time" })
  horaInicio!: string;

  @Column({ type: "time" })
  horaFin!: string;
}
