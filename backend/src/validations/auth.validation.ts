import { z } from "zod";

// 72: bcrypt ignora en silencio lo que pase de 72 bytes.
export const passwordNueva = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar 72 caracteres");

export const loginReq = {
  body: z.object({
    username: z.string().min(1, "Ingresa tu usuario"),
    password: z.string().min(1, "Ingresa tu contraseña"),
  }),
};

export const cambiarPasswordReq = {
  body: z.object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: passwordNueva,
  }),
};
