import cors from "cors";
import express from "express";
// Parchea Express para que un handler `async` que rechaza llame a next(err) en vez de
// terminar como promesa no manejada (que tumbaba el proceso entero).
import "express-async-errors";
import { AppDataSource } from "../config/dataSource.js";
import { AppError } from "../errors/AppError.js";
import { errorHandler, notFound } from "../middlewares/errorHandler.js";
import { requestLogger } from "../middlewares/requestLogger.js";
import { adjuntoRouter } from "../routes/adjunto.routes.js";
import { authRouter } from "../routes/auth.routes.js";
import { buscarRouter } from "../routes/buscar.routes.js";
import { canalTicketRouter } from "../routes/canalTicket.routes.js";
import { clienteRouter } from "../routes/cliente.routes.js";
import { correoConfigRouter } from "../routes/correoConfig.routes.js";
import { correoIngeridoRouter } from "../routes/correoIngerido.routes.js";
import { cotizacionRouter } from "../routes/cotizacion.routes.js";
import { dashboardRouter } from "../routes/dashboard.routes.js";
import { departamentoRouter } from "../routes/departamento.routes.js";
import { estadoTicketRouter } from "../routes/estadoTicket.routes.js";
import { notificacionRouter } from "../routes/notificacion.routes.js";
import { otRouter } from "../routes/ot.routes.js";
import { portalRouter } from "../routes/portal.routes.js";
import { prioridadRouter } from "../routes/prioridad.routes.js";
import { slaRouter } from "../routes/sla.routes.js";
import { temaAyudaRouter } from "../routes/temaAyuda.routes.js";
import { ticketRouter } from "../routes/ticket.routes.js";
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
app.use("/api/v1/ots", otRouter);
app.use("/api/v1/tickets", ticketRouter);
app.use("/api/v1/cotizaciones", cotizacionRouter);
app.use("/api/v1/adjuntos", adjuntoRouter);
app.use("/api/v1/sla", slaRouter);
app.use("/api/v1/notificaciones", notificacionRouter);
app.use("/api/v1/correos-ingeridos", correoIngeridoRouter);
app.use("/api/v1/correo", correoConfigRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/buscar", buscarRouter);
app.use("/api/v1/departamentos", departamentoRouter);
app.use("/api/v1/temas-ayuda", temaAyudaRouter);
app.use("/api/v1/prioridades", prioridadRouter);
app.use("/api/v1/estados-ticket", estadoTicketRouter);
app.use("/api/v1/fuentes-ticket", canalTicketRouter);

// Portal público (Fase 5): sin JWT interno, sin prefijo /api/v1 (ver docs/backend-diseno.md sección 4).
app.use("/publico", portalRouter);

// Deben ir al final: el 404 para rutas no montadas y el manejador central de errores.
app.use(notFound);
app.use(errorHandler);
