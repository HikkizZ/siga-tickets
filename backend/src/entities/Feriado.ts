import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("feriado")
export class Feriado {
  @PrimaryColumn({ type: "date" })
  fecha!: string;

  @Column({ type: "nvarchar", length: 120 })
  nombre!: string;

  @Column({ type: "bit", default: false })
  irrenunciable!: boolean;
}
