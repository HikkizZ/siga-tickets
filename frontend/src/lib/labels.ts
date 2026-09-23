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

export type Prioridad = "alta" | "media" | "baja";
export const etiquetaPrioridad = crearTraductor<Prioridad>({ alta: "Alta", media: "Media", baja: "Baja" }, "Prioridad");
export const PRIORIDADES: readonly Prioridad[] = ["alta", "media", "baja"];

export type SlaEstado = "en_plazo" | "por_vencer" | "vencida";
export const etiquetaSlaEstado = crearTraductor<SlaEstado>(
  { en_plazo: "En plazo", por_vencer: "Por vencer", vencida: "Vencida" },
  "SlaEstado",
);

// ---- Tickets ----

export type EstadoTicket = "nuevo" | "abierto" | "esperando_cliente" | "resuelto" | "cerrado";
export const etiquetaEstadoTicket = crearTraductor<EstadoTicket>(
  {
    nuevo: "Nuevo",
    abierto: "Abierto",
    esperando_cliente: "Esperando cliente",
    resuelto: "Resuelto",
    cerrado: "Cerrado",
  },
  "EstadoTicket",
);

export type CanalTicket = "portal" | "correo" | "telefono" | "presencial" | "interno";
export const etiquetaCanalTicket = crearTraductor<CanalTicket>(
  { portal: "Portal", correo: "Correo", telefono: "Teléfono", presencial: "Presencial", interno: "Interno" },
  "CanalTicket",
);

// ---- Cotizaciones ----

export type EstadoCotizacion = "borrador" | "enviada" | "aprobada" | "rechazada";
export const etiquetaEstadoCotizacion = crearTraductor<EstadoCotizacion>(
  { borrador: "Borrador", enviada: "Enviada", aprobada: "Aprobada", rechazada: "Rechazada" },
  "EstadoCotizacion",
);

// ---- Usuarios ----

export type Rol = "admin" | "gestion" | "tecnico" | "lectura";
export const etiquetaRol = crearTraductor<Rol>(
  { admin: "Administrador", gestion: "Gestión", tecnico: "Técnico", lectura: "Lectura" },
  "Rol",
);
