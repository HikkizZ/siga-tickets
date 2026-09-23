// GET /usuarios (docs/api.md, sección "Usuarios (admin)"). Solo lectura por ahora: el CRUD de
// usuarios no es parte de la Fase 0.
import { apiClient } from "./client";
import type { Usuario } from "@/lib/auth/AuthProvider";

export async function obtenerUsuarios(): Promise<Usuario[]> {
  const { data } = await apiClient.get<Usuario[]>("/usuarios");
  return data;
}
