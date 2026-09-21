import type { Logger } from "pino";
import type { Rol } from "../entities/enums.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      user?: {
        id: string;
        username: string;
        rol: Rol;
      };
      validated?: { body?: unknown; params?: unknown; query?: unknown };
    }
  }
}

export {};
