import cors from "cors";
import express from "express";
// Parchea Express para que un handler `async` que rechaza llame a next(err) en vez de
// terminar como promesa no manejada (que tumbaba el proceso entero).
import "express-async-errors";
import { AppDataSource } from "../config/dataSource.js";
import { AppError } from "../errors/AppError.js";
import { errorHandler, notFound } from "../middlewares/errorHandler.js";
import { requestLogger } from "../middlewares/requestLogger.js";
import { authRouter } from "../routes/auth.routes.js";
import { clienteRouter } from "../routes/cliente.routes.js";
import { usuarioRouter } from "../routes/usuario.routes.js";

export const app = express();

// Sin esto el navegador oculta al frontend el token renovado por sliding expiration.
app.use(cors({ exposedHeaders: ["X-Renewed-Token", "X-Request-Id"] }));
app.use(requestLogger);
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await AppDataSource.query("SELECT 1");
  } catch {
    throw new AppError(503, "DB_UNAVAILABLE", "Base de datos no disponible");
  }
  res.json({ status: "ok", data: { db: "ok" } });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/usuarios", usuarioRouter);
app.use("/api/v1/clientes", clienteRouter);

// Deben ir al final: el 404 para rutas no montadas y el manejador central de errores.
app.use(notFound);
app.use(errorHandler);
