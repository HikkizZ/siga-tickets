// Traduce los valores reales del backend (minúsculas, snake_case — ver
// backend/src/entities/enums.ts) a las etiquetas en español que ya usa el diseño visual
// (mayúsculas, ver src/lib/mock-data.ts). Solo para lo que se muestra en pantalla: el estado y
// la red siguen usando el valor real del backend, nunca la etiqueta.
//
// Fase 0: solo se define la base. Las fases 1+ importan estas funciones tal cual — no repetir
// esta tabla en un componente.

type Mapa<T extends string> = Record<T, string>;

function crearTraductor<T extends string>(mapa: Mapa<T>, nombreEnum: string): (valor: T) => string {
  return (valor: T): string => {
    const etiqueta = mapa[valor];
    if (etiqueta === undefined) {
      // No debería pasar si el backend respeta su propio enum, pero no se rompe la UI por esto.
      console.warn(`labels.ts: valor sin mapeo para ${nombreEnum}: "${valor}"`);
      return valor;
    }
    return etiqueta;
  };
}

// ---- OT ----

export type EstadoOt = "ingresado" | "en_cotizacion" | "aprobado" | "en_ejecucion" | "terminado" | "facturado";
export const etiquetaEstadoOt = crearTraductor<EstadoOt>(
  {
    ingresado: "Ingresado",
    en_cotizacion: "En cotización",
    aprobado: "Aprobado",
    en_ejecucion: "En ejecución",
    terminado: "Terminado",
    facturado: "Facturado",
  },
  "EstadoOt",
);
// Orden fijo de columnas del kanban (mismo orden que devuelve GET /ots/kanban).
export const ESTADOS_OT: readonly EstadoOt[] = [
  "ingresado",
  "en_cotizacion",
  "aprobado",
  "en_ejecucion",
  "terminado",
  "facturado",
];

export type CategoriaOt = "mantencion" | "instalacion" | "reparacion" | "cotizacion" | "soporte" | "otro";
export const etiquetaCategoriaOt = crearTraductor<CategoriaOt>(
  {
    mantencion: "Mantención",
    instalacion: "Instalación",
    reparacion: "Reparación",
    cotizacion: "Cotización",
    soporte: "Soporte",
    otro: "Otro",
  },
  "CategoriaOt",
);
export const CATEGORIAS_OT: readonly CategoriaOt[] = [
  "mantencion",
  "instalacion",
  "reparacion",
  "cotizacion",
  "soporte",
  "otro",
];

export type OrigenOt = "mesa_ayuda" | "correo" | "telefono" | "presencial" | "interna";
export const etiquetaOrigenOt = crearTraductor<OrigenOt>(
  {
    mesa_ayuda: "Mesa de ayuda",
    correo: "Correo",
    telefono: "Llamada telefónica",
    presencial: "Presencial",
    interna: "Solicitud interna",
  },
  "OrigenOt",
);
export const ORIGENES_OT: readonly OrigenOt[] = ["mesa_ayuda", "correo", "telefono", "presencial", "interna"];

// ---- Compartidos entre OT y tickets ----

// Fase C: Prioridad/EstadoTicket/CanalTicket dejaron de ser enums fijos con traductor propio —
// ahora son catálogos administrables (`{id, nombre}`, ver src/lib/api/prioridades.ts,
// estadosTicket.ts, fuentesTicket.ts) y el backend ya devuelve el nombre legible directamente, así
// que los componentes renderizan `algo.nombre` sin pasar por ningún traductor.

export type SlaEstado = "en_plazo" | "por_vencer" | "vencida";
export const etiquetaSlaEstado = crearTraductor<SlaEstado>(
  { en_plazo: "En plazo", por_vencer: "Por vencer", vencida: "Vencida" },
  "SlaEstado",
);

// ---- Cotizaciones ----

export type EstadoCotizacion = "borrador" | "enviada" | "aprobada" | "rechazada";
export const etiquetaEstadoCotizacion = crearTraductor<EstadoCotizacion>(
  { borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada", rechazada: "Rechazada" },
  "EstadoCotizacion",
);
export const ESTADOS_COTIZACION: readonly EstadoCotizacion[] = ["borrador", "enviada", "aprobada", "rechazada"];

// Transiciones válidas de estado de una cotización (docs/api.md, POST /cotizaciones/:id/estado):
// cualquier otra combinación (incluida la misma → la misma) devuelve 409 TRANSICION_INVALIDA.
const TRANSICIONES_COTIZACION: Record<EstadoCotizacion, readonly EstadoCotizacion[]> = {
  borrador: ["enviada"],
  enviada: ["aprobada", "rechazada", "borrador"],
  aprobada: [],
  rechazada: ["enviada"],
};
export function transicionesValidasCotizacion(estado: EstadoCotizacion): readonly EstadoCotizacion[] {
  return TRANSICIONES_COTIZACION[estado];
}

// ---- Usuarios ----

export type Rol = "admin" | "gestion" | "tecnico" | "lectura";
export const etiquetaRol = crearTraductor<Rol>(
  { admin: "Administrador", gestion: "Gestión", tecnico: "Técnico", lectura: "Lectura" },
  "Rol",
);

// Cotizaciones (Fase 2): a diferencia de OT, escribir (crear, editar, cambiar estado, vincular)
// es exclusivo de gestion/admin, sin excepción por fila (docs/api.md, sección "Cotizaciones").
export function puedeEscribirCotizaciones(rol: Rol): boolean {
  return rol === "admin" || rol === "gestion";
}

// Tickets (Fase 3): convertir a OT, vincular y desvincular una OT existente son exclusivos de
// gestion/admin, "sin excepción por fila" (docs/api.md, sección "Permisos por fila") — mismo
// criterio que puedeEscribirCotizaciones, pero se deja como función propia porque protege una
// superficie distinta (no cotizaciones).
export function puedeConvertirTickets(rol: Rol): boolean {
  return rol === "admin" || rol === "gestion";
}

// SLA (Fase 4): a diferencia de cotizaciones/tickets, PUT /sla/config y POST/DELETE
// /sla/feriados son admin-only, sin excepción para gestion (docs/api.md, sección "SLA y
// notificaciones (Fase 4)").
export function puedeEscribirSla(rol: Rol): boolean {
  return rol === "admin";
}

// Correo (Fase A): PUT /correo/config es admin-only, igual que SLA (docs/api.md, sección
// "Configuración de correo (Fase A)"); GET es lectura para cualquier rol autenticado.
export function puedeEscribirCorreoConfig(rol: Rol): boolean {
  return rol === "admin";
}

// Departamentos (Fase B1): POST/PATCH /departamentos son admin-only, GET es lectura para
// cualquier rol autenticado (docs/api.md, sección "Departamentos (Fase B1)").
export function puedeEscribirDepartamentos(rol: Rol): boolean {
  return rol === "admin";
}

// Temas de ayuda (Fase B1): POST/PATCH /temas-ayuda son admin-only, mismo criterio que
// Departamentos (docs/api.md, sección "Temas de ayuda (Fase B1)").
export function puedeEscribirTemasAyuda(rol: Rol): boolean {
  return rol === "admin";
}

// Planes SLA (Fase B2): POST/PATCH/DELETE /sla/planes son admin-only, igual que sla_config
// (docs/api.md, sección "Planes SLA (Fase B2)").
export function puedeEscribirPlanesSla(rol: Rol): boolean {
  return rol === "admin";
}

// Plantillas de correo (Fase B2): PUT /correo/plantillas/:nombre es admin-only, GET es lectura
// para cualquier rol autenticado (docs/api.md, sección "Plantillas de correo (Fase B2)").
export function puedeEscribirPlantillasCorreo(rol: Rol): boolean {
  return rol === "admin";
}

// Clientes (Fase E2, directorio de clientes): POST/PATCH /clientes son admin-only, GET es lectura
// para cualquier rol autenticado (docs/api.md, sección "Clientes"), mismo criterio que
// Departamentos.
export function puedeEscribirClientes(rol: Rol): boolean {
  return rol === "admin";
}

// Catálogos de Ticket (Fase C): POST/PATCH /prioridades, /estados-ticket y /fuentes-ticket son
// admin-only, GET es lectura para cualquier rol autenticado (docs/api.md, sección "Catálogos
// administrables (Fase C)"), mismo criterio que Departamentos/Temas de ayuda/Planes SLA.
export function puedeEscribirPrioridades(rol: Rol): boolean {
  return rol === "admin";
}

export function puedeEscribirEstadosTicket(rol: Rol): boolean {
  return rol === "admin";
}

export function puedeEscribirFuentesTicket(rol: Rol): boolean {
  return rol === "admin";
}
