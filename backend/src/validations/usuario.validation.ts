import { z } from "zod";
import { Rol } from "../entities/enums.js";
import { passwordNueva } from "./auth.validation.js";

const username = z.string().trim().min(3, "El usuario debe tener al menos 3 caracteres").max(50);
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);
const cargo = z.string().trim().min(1).max(80);
// En minúsculas para que el UNIQUE de la columna varchar no distinga mayúsculas de facto.
const email = z.string().trim().toLowerCase().email("Email inválido").max(160);

const paramsId = z.object({ id: z.string().uuid("Id inválido") });

export const crearUsuarioReq = {
  body: z
    .object({
      username,
      nombre,
      cargo: cargo.nullish(),
      email,
      password: passwordNueva,
      rol: z.nativeEnum(Rol),
    })
    .strict(),
};

export const actualizarUsuarioReq = {
  params: paramsId,
  body: z
    .object({
      nombre: nombre.optional(),
      cargo: cargo.nullable().optional(),
      email: email.optional(),
      rol: z.nativeEnum(Rol).optional(),
      activo: z.boolean().optional(),
      // Reseteo por admin: el usuario deberá cambiarla en su próximo ingreso.
      password: passwordNueva.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
