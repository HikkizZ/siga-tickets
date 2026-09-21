import { AppDataSource } from "../config/dataSource.js";

// Uso: tsx src/scripts/migrate.ts run | revert
async function main() {
  const accion = process.argv[2];
  if (accion !== "run" && accion !== "revert") {
    console.error("Uso: npm run migration:run | npm run migration:revert");
    process.exit(1);
  }

  await AppDataSource.initialize();
  if (accion === "run") {
    const aplicadas = await AppDataSource.runMigrations({ transaction: "each" });
    console.log(aplicadas.length ? `Aplicadas: ${aplicadas.map((m) => m.name).join(", ")}` : "Sin migraciones pendientes");
  } else {
    await AppDataSource.undoLastMigration({ transaction: "each" });
    console.log("Última migración revertida");
  }
  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
