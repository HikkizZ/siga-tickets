import { describe, expect, it } from "vitest";
import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import {
  exigir,
  puedeCambiarEstado,
  puedeComentar,
  puedeDerivar,
  puedeEditarEtapas,
  puedeEditarOt,
  puedeGestionarColaboradores,
  puedeGestionarHoras,
  puedeSubirAdjunto,
  type ContextoOt,
} from "./ot.policy.js";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";

const ctx = (rol: Rol, relacion: "responsable" | "colaborador" | "ninguna"): ContextoOt => ({
  usuario: { id: YO, rol },
  responsableActualId: relacion === "responsable" ? YO : OTRO,
  esColaborador: relacion === "colaborador",
});

describe("ot.policy (matriz de la sección 6)", () => {
  const RELACIONES = ["responsable", "colaborador", "ninguna"] as const;

  it.each(RELACIONES)("admin y gestion no tienen restricción (%s)", (rel) => {
    for (const rol of [Rol.ADMIN, Rol.GESTION]) {
      const c = ctx(rol, rel);
      expect([puedeEditarOt, puedeCambiarEstado, puedeComentar, puedeSubirAdjunto, puedeDerivar, puedeGestionarColaboradores, puedeEditarEtapas].every((f) => f(c))).toBe(true);
      expect(puedeGestionarHoras(c, OTRO)).toBe(true);
    }
  });

  it.each(RELACIONES)("lectura nunca puede escribir (%s)", (rel) => {
    const c = ctx(Rol.LECTURA, rel);
    expect([puedeEditarOt, puedeCambiarEstado, puedeComentar, puedeSubirAdjunto, puedeDerivar, puedeGestionarColaboradores, puedeEditarEtapas].some((f) => f(c))).toBe(false);
    expect(puedeGestionarHoras(c, YO)).toBe(false);
  });

  it.each([
    ["responsable", true, true, true],
    ["colaborador", true, false, false],
    ["ninguna", false, false, false],
  ] as const)("tecnico %s: editar=%s, derivar=%s, colaboradores/etapas=%s", (rel, editar, derivar, gestionar) => {
    const c = ctx(Rol.TECNICO, rel);
    expect(puedeEditarOt(c)).toBe(editar);
    expect(puedeCambiarEstado(c)).toBe(editar);
    expect(puedeComentar(c)).toBe(editar);
    expect(puedeSubirAdjunto(c)).toBe(editar);
    expect(puedeDerivar(c)).toBe(derivar);
    expect(puedeGestionarColaboradores(c)).toBe(gestionar);
    expect(puedeEditarEtapas(c)).toBe(gestionar);
  });

  it("horas: el tecnico solo las propias", () => {
    const c = ctx(Rol.TECNICO, "ninguna");
    expect(puedeGestionarHoras(c, YO)).toBe(true);
    expect(puedeGestionarHoras(c, OTRO)).toBe(false);
  });

  it("una OT sin responsable no convierte a nadie en responsable", () => {
    const c: ContextoOt = { usuario: { id: YO, rol: Rol.TECNICO }, responsableActualId: null, esColaborador: false };
    expect(puedeDerivar(c)).toBe(false);
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
});
