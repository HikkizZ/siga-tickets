// Espejo TS de los CHECK de la migración inicial (los catálogos son varchar + CHECK,
// no enums nativos de PG). Si cambias uno, cambia el CHECK en una migración nueva.

export enum Rol {
  ADMIN = "admin",
  GESTION = "gestion",
  TECNICO = "tecnico",
  LECTURA = "lectura",
}

export enum Prioridad {
  ALTA = "alta",
  MEDIA = "media",
  BAJA = "baja",
}

export enum CanalTicket {
  PORTAL = "portal",
  CORREO = "correo",
  TELEFONO = "telefono",
  PRESENCIAL = "presencial",
  INTERNO = "interno",
}

export enum EstadoTicket {
  NUEVO = "nuevo",
  ABIERTO = "abierto",
  ESPERANDO_CLIENTE = "esperando_cliente",
  RESUELTO = "resuelto",
  CERRADO = "cerrado",
}

export enum SlaEstado {
  EN_PLAZO = "en_plazo",
  POR_VENCER = "por_vencer",
  VENCIDA = "vencida",
}

export enum CategoriaOt {
  MANTENCION = "mantencion",
  INSTALACION = "instalacion",
  REPARACION = "reparacion",
  COTIZACION = "cotizacion",
  SOPORTE = "soporte",
  OTRO = "otro",
}

export enum OrigenOt {
  MESA_AYUDA = "mesa_ayuda",
  CORREO = "correo",
  TELEFONO = "telefono",
  PRESENCIAL = "presencial",
  INTERNA = "interna",
}

export enum EstadoOt {
  INGRESADO = "ingresado",
  EN_COTIZACION = "en_cotizacion",
  APROBADO = "aprobado",
  EN_EJECUCION = "en_ejecucion",
  TERMINADO = "terminado",
  FACTURADO = "facturado",
}

// Entidades a las que apuntan asignacion / sla_pausa
export enum EntidadAsignable {
  TICKET = "ticket",
  OT = "ot",
}

export enum EntidadEvento {
  TICKET = "ticket",
  OT = "ot",
  COTIZACION = "cotizacion",
}

export enum EntidadAdjunto {
  TICKET = "ticket",
  OT = "ot",
  MENSAJE = "mensaje",
}

export enum TipoMensajeTicket {
  CLIENTE = "cliente",
  RESPUESTA_CLIENTE = "respuesta_cliente",
  NOTA_INTERNA = "nota_interna",
}

export enum EstadoCotizacion {
  BORRADOR = "borrador",
  ENVIADA = "enviada",
  APROBADA = "aprobada",
  RECHAZADA = "rechazada",
}

export enum EstadoAdjunto {
  ESCANEANDO = "escaneando",
  LIMPIO = "limpio",
  INFECTADO = "infectado",
}

export enum EstadoCorreoIngerido {
  PENDIENTE = "pendiente",
  PROCESADO = "procesado",
  IGNORADO = "ignorado",
  ERROR = "error",
}

export enum EstadoCorreoSaliente {
  PENDIENTE = "pendiente",
  ENVIANDO = "enviando",
  ENVIADO = "enviado",
  FALLIDO = "fallido",
}
