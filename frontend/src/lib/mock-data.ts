// Hasta Fase 5 este archivo era la fuente de datos mock completa del prototipo (OT/tickets/
// cotizaciones/usuarios/SLA de mentira). Fase 6 conectó las dos últimas pantallas que le quedaban
// (línea de tiempo, badge de SLA del sidebar) a datos reales, así que ya no queda ningún dato de
// negocio acá — solo lo genuinamente reutilizable: formateo de fecha/moneda y la lista de áreas
// internas (config real de la app, no un dato de demostración).

// Áreas/departamentos válidos para una solicitud interna (OT sin cliente, `esInterna: true`) —
// usado por nueva-ot.tsx y la conversión de ticket a OT en TicketDetail.tsx.
export const areas = ["Bodega", "Administración", "TI", "Operaciones", "Prevención de riesgos"];

export const formatoMoneda = (monto: number) =>
  monto.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export const formatoFecha = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });

export const formatoFechaHora = (fecha: Date) =>
  fecha.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
