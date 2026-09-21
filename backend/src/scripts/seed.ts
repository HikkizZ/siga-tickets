import { randomBytes } from "node:crypto";
import "dotenv/config";
import { z } from "zod";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { Feriado } from "../entities/Feriado.js";
import { Usuario, SISTEMA_USERNAME } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { hashPassword } from "../auth/password.js";

const CLIENTES = [
  "Minera Los Andes",
  "Constructora Vertiz",
  "Clínica Santa Elena",
  "Transportes Aconcagua",
  "Retail Nova",
];

// VERIFICAR contra el calendario oficial antes de producción (docs/backend-diseno.md sección 3).
// Los feriados no se cargan desde una API externa: se mantienen aquí / por endpoint admin.
const FERIADOS_2026: Array<{ fecha: string; nombre: string; irrenunciable?: boolean }> = [
  { fecha: "2026-01-01", nombre: "Año Nuevo", irrenunciable: true },
  { fecha: "2026-04-03", nombre: "Viernes Santo" },
  { fecha: "2026-04-04", nombre: "Sábado Santo" },
  { fecha: "2026-05-01", nombre: "Día del Trabajo", irrenunciable: true },
  { fecha: "2026-05-21", nombre: "Día de las Glorias Navales" },
  { fecha: "2026-06-21", nombre: "Día de los Pueblos Indígenas" },
  { fecha: "2026-06-29", nombre: "San Pedro y San Pablo" },
  { fecha: "2026-07-16", nombre: "Virgen del Carmen" },
  { fecha: "2026-08-15", nombre: "Asunción de la Virgen" },
  { fecha: "2026-09-18", nombre: "Independencia Nacional", irrenunciable: true },
  { fecha: "2026-09-19", nombre: "Día de las Glorias del Ejército" },
  { fecha: "2026-10-12", nombre: "Encuentro de Dos Mundos" },
  { fecha: "2026-10-31", nombre: "Día de las Iglesias Evangélicas y Protestantes" },
  { fecha: "2026-11-01", nombre: "Día de Todos los Santos" },
  { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2026-12-25", nombre: "Navidad", irrenunciable: true },
];

// La contraseña del admin jamás vive en el repo: solo por entorno.
const esquemaAdmin = z.object({
  SEED_ADMIN_USERNAME: z.string().min(3),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_NOMBRE: z.string().min(1),
  SEED_ADMIN_PASSWORD: z.string().min(8).max(72),
});

async function main() {
  const admin = esquemaAdmin.safeParse(process.env);
  if (!admin.success) {
    const faltan = admin.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(
      `Faltan o son inválidas variables del admin inicial (defínelas en .env o en el entorno):\n${faltan}`,
    );
    process.exit(1);
  }

  await AppDataSource.initialize();
  const usuarios = AppDataSource.getRepository(Usuario);

  // Idempotente: solo se crea si no existe; nunca se pisa una contraseña ya cambiada.
  if (!(await usuarios.existsBy({ username: SISTEMA_USERNAME }))) {
    await usuarios.save(
      usuarios.create({
        username: SISTEMA_USERNAME,
        nombre: "Sistema",
        cargo: null,
        email: "sistema@siga-ot.local",
        // Hash de un valor aleatorio descartado: nadie conoce la contraseña.
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        rol: Rol.LECTURA,
        activo: false,
      }),
    );
    console.log("Usuario sistema creado (inactivo)");
  }

  const a = admin.data;
  if (!(await usuarios.existsBy({ username: a.SEED_ADMIN_USERNAME }))) {
    await usuarios.save(
      usuarios.create({
        username: a.SEED_ADMIN_USERNAME,
        nombre: a.SEED_ADMIN_NOMBRE,
        cargo: null,
        email: a.SEED_ADMIN_EMAIL.toLowerCase(),
        passwordHash: await hashPassword(a.SEED_ADMIN_PASSWORD),
        rol: Rol.ADMIN,
        mustChangePassword: true,
      }),
    );
    console.log(`Admin ${a.SEED_ADMIN_USERNAME} creado`);
  }

  // Buscar-luego-insertar (SQL Server no tiene ON CONFLICT DO NOTHING): idempotente.
  const clientes = AppDataSource.getRepository(Cliente);
  for (const nombre of CLIENTES) {
    if (!(await clientes.existsBy({ nombre }))) await clientes.save(clientes.create({ nombre }));
  }

  const feriados = AppDataSource.getRepository(Feriado);
  for (const f of FERIADOS_2026) {
    if (!(await feriados.existsBy({ fecha: f.fecha }))) {
      await feriados.save(feriados.create({ fecha: f.fecha, nombre: f.nombre, irrenunciable: f.irrenunciable ?? false }));
    }
  }

  console.log("Seed completo");
  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
