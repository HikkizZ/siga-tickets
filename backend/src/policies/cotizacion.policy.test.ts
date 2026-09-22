import { describe, expect, it } from "vitest";
import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { exigirEscrituraCotizacion, puedeEscribirCotizacion } from "./cotizacion.policy.js";

describe("cotizacion.policy (sección 6 del diseño: sin excepción por fila)", () => {
  it("admin y gestion pueden escribir", () => {
    expect(puedeEscribirCotizacion(Rol.ADMIN)).toBe(true);
    expect(puedeEscribirCotizacion(Rol.GESTION)).toBe(true);
  });

  it("tecnico y lectura nunca pueden escribir, aunque OT sí les dé permisos ahí", () => {
    expect(puedeEscribirCotizacion(Rol.TECNICO)).toBe(false);
    expect(puedeEscribirCotizacion(Rol.LECTURA)).toBe(false);
  });

  it("exigirEscrituraCotizacion lanza AppError 403 PERMISO_DENEGADO", () => {
    expect(() => exigirEscrituraCotizacion(Rol.ADMIN)).not.toThrow();
    try {
      exigirEscrituraCotizacion(Rol.TECNICO);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ status: 403, code: "PERMISO_DENEGADO" });
    }
  });
});
