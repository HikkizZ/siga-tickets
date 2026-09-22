import { describe, expect, it } from "vitest";
import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import {
  exigir,
  exigirConversion,
  puedeCambiarEstado,
  puedeConvertirOVincular,
  puedeDerivar,
  puedeEditarTicket,
  puedePublicarMensaje,
  puedeSubirAdjunto,
  puedeTomar,
  type ContextoTicket,
} from "./ticket.policy.js";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";

const ctx = (rol: Rol, relacion: "responsable" | "sin_responsable" | "ajeno"): ContextoTicket => ({
  usuario: { id: YO, rol },
  responsableActualId: relacion === "responsable" ? YO : relacion === "ajeno" ? OTRO : null,
});

describe("ticket.policy (matriz de la sección 6, sin colaborador)", () => {
  const RELACIONES = ["responsable", "sin_responsable", "ajeno"] as const;

  it.each(RELACIONES)("admin y gestion no tienen restricción (%s)", (rel) => {
    for (const rol of [Rol.ADMIN, Rol.GESTION]) {
      const c = ctx(rol, rel);
      expect([puedeEditarTicket, puedeCambiarEstado, puedePublicarMensaje, puedeSubirAdjunto, puedeDerivar, puedeTomar].every((f) => f(c))).toBe(
        true,
      );
      expect(puedeConvertirOVincular(rol)).toBe(true);
    }
  });

  it.each(RELACIONES)("lectura nunca puede escribir (%s)", (rel) => {
    const c = ctx(Rol.LECTURA, rel);
    expect([puedeEditarTicket, puedeCambiarEstado, puedePublicarMensaje, puedeSubirAdjunto, puedeDerivar, puedeTomar].some((f) => f(c))).toBe(
      false,
    );
    expect(puedeConvertirOVincular(Rol.LECTURA)).toBe(false);
  });

  it("tecnico responsable: puede editar, cambiar estado, publicar mensajes, adjuntar y derivar; nunca convertir/vincular", () => {
    const c = ctx(Rol.TECNICO, "responsable");
    expect(puedeEditarTicket(c)).toBe(true);
    expect(puedeCambiarEstado(c)).toBe(true);
    expect(puedePublicarMensaje(c)).toBe(true);
    expect(puedeSubirAdjunto(c)).toBe(true);
    expect(puedeDerivar(c)).toBe(true);
    expect(puedeConvertirOVincular(Rol.TECNICO)).toBe(false);
  });

  it("tecnico ajeno (no es el responsable): no puede editar, cambiar estado, publicar ni derivar, pero sí tomar", () => {
    const c = ctx(Rol.TECNICO, "ajeno");
    expect(puedeEditarTicket(c)).toBe(false);
    expect(puedeCambiarEstado(c)).toBe(false);
    expect(puedePublicarMensaje(c)).toBe(false);
    expect(puedeSubirAdjunto(c)).toBe(false);
    expect(puedeDerivar(c)).toBe(false);
    expect(puedeTomar(c)).toBe(true);
  });

  it("un ticket sin responsable no convierte a nadie en responsable: tecnico no puede editar ni derivar, pero sí tomar", () => {
    const c = ctx(Rol.TECNICO, "sin_responsable");
    expect(puedeEditarTicket(c)).toBe(false);
    expect(puedeDerivar(c)).toBe(false);
    expect(puedeTomar(c)).toBe(true);
  });

  it("lectura nunca puede tomar", () => {
    expect(puedeTomar(ctx(Rol.LECTURA, "sin_responsable"))).toBe(false);
  });

  it("exigir lanza AppError 403 PERMISO_DENEGADO", () => {
    expect(() => exigir(true)).not.toThrow();
    try {
      exigir(false, "no");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ status: 403, code: "PERMISO_DENEGADO", message: "no" });
    }
  });

  it("exigirConversion lanza 403 salvo admin/gestion", () => {
    expect(() => exigirConversion(Rol.ADMIN)).not.toThrow();
    expect(() => exigirConversion(Rol.GESTION)).not.toThrow();
    for (const rol of [Rol.TECNICO, Rol.LECTURA]) {
      expect(() => exigirConversion(rol)).toThrow(AppError);
    }
  });
});
