import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // La suite de tests hace decenas de logins desde la misma IP.
  skip: () => env.nodeEnv === "test",
  message: {
    status: "error",
    code: "RATE_LIMITED",
    message: "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
  },
});
