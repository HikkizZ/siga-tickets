// Datos de ejemplo (mock). Reemplazar por llamadas reales a la API más adelante.

export const ESTADOS_OT = [
  "Ingresado",
  "En cotización",
  "Aprobado",
  "En ejecución",
  "Terminado",
  "Facturado",
] as const;
export type EstadoOT = (typeof ESTADOS_OT)[number];

export type Prioridad = "Alta" | "Media" | "Baja";

export type Usuario = {
  id: string;
  nombre: string;
  rol: string;
  iniciales: string;
};

export type RegistroHora = {
  id: string;
  usuarioId: string;
  fecha: string;
  horas: number;
  descripcion: string;
};

export type Adjunto = {
  id: string;
  nombre: string;
  tipo: "imagen" | "pdf" | "correo";
  peso: string;
};

export type EventoActividad = {
  id: string;
  tipo: "creacion" | "estado" | "comentario" | "adjunto";
  texto: string;
  fecha: string;
  usuarioId: string;
};

export type CorreoVinculado = {
  id: string;
  asunto: string;
  remitente: string;
  fecha: string;
};

export const ORIGENES_TICKET = [
  "Mesa de ayuda",
  "Correo",
  "Llamada telefónica",
  "Presencial",
  "Solicitud interna",
] as const;
export type OrigenTicket = (typeof ORIGENES_TICKET)[number];

export const CATEGORIAS_TRABAJO = [
  "Mantención",
  "Instalación",
  "Reparación",
  "Cotización",
  "Soporte",
  "Otro",
] as const;
export type CategoriaTrabajo = (typeof CATEGORIAS_TRABAJO)[number];

export const areas = ["Bodega", "Administración", "TI", "Operaciones", "Prevención de riesgos"];

export type Etapa = {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
};

/** Registro de una derivación de responsable (ticket u OT). */
export type Derivacion = {
  id: string;
  deId: string;
  aId: string;
  motivo: string;
  fecha: string;
};


export type OT = {
  id: string;
  titulo: string;
  cliente: string;
  descripcion: string;
  estado: EstadoOT;
  prioridad: Prioridad;
  responsableId: string;
  colaboradores?: string[];
  fechaIngreso: string;
  fechaEstimada: string;
  horas: RegistroHora[];
  adjuntos: Adjunto[];
  cotizacionId?: string;
  actividad: EventoActividad[];
  correos: CorreoVinculado[];
  origen?: OrigenTicket;
  esSolicitudInterna?: boolean;
  area?: string;
  solicitanteNombre?: string;
  solicitanteContacto?: string;
  categoria?: CategoriaTrabajo;
  ubicacion?: string;
  etapas?: Etapa[];
  recepcionadoPorId?: string;
  derivaciones?: Derivacion[];
};

export const ESTADOS_COTIZACION = ["Borrador", "Enviada", "Aprobada", "Rechazada"] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export type Cotizacion = {
  id: string;
  cliente: string;
  monto: number;
  estado: EstadoCotizacion;
  otId?: string;
  fecha: string;
};

// ---- Mesa de ayuda: tickets ----

export const ESTADOS_TICKET = [
  "Nuevo",
  "Abierto",
  "Esperando cliente",
  "Resuelto",
  "Cerrado",
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const CANALES_TICKET = ["Portal", "Correo", "Teléfono", "Presencial", "Interno"] as const;
export type CanalTicket = (typeof CANALES_TICKET)[number];

export type MensajeTicket = {
  id: string;
  autor: "cliente" | "equipo";
  nombre: string;
  texto: string;
  fecha: string;
  interna?: boolean;
  usuarioId?: string;
  adjuntos?: string[];
};

export type Ticket = {
  id: string;
  asunto: string;
  descripcion: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitanteTelefono?: string;
  empresa?: string;
  actividad?: EventoActividad[];
  fecha: string;
  canal: CanalTicket;
  prioridad: Prioridad;
  estado: EstadoTicket;
  responsableId?: string;
  otIds: string[];
  adjuntos: string[];
  mensajes: MensajeTicket[];
  recepcionadoPorId?: string;
  derivaciones?: Derivacion[];
};

export type Notificacion = {
  id: string;
  tipo: "nueva-ot" | "estado" | "comentario" | "ticket" | "respuesta-cliente";
  texto: string;
  fecha: string;
  leida: boolean;
};

export const usuarios: Usuario[] = [
  { id: "u1", nombre: "Felipe Miranda", rol: "Jefe de proyectos", iniciales: "FM" },
  { id: "u2", nombre: "Carla Soto", rol: "Ingeniera de servicio", iniciales: "CS" },
  { id: "u3", nombre: "Diego Rojas", rol: "Técnico senior", iniciales: "DR" },
  { id: "u4", nombre: "Valentina Pérez", rol: "Administración", iniciales: "VP" },
  { id: "u5", nombre: "Mauricio Leiva", rol: "Técnico", iniciales: "ML" },
];

export const usuarioActual = usuarios[0]!;

export const getUsuario = (id: string) => usuarios.find((u) => u.id === id) ?? usuarios[0]!;

export const clientes = [
  "Minera Los Andes",
  "Constructora Vertiz",
  "Clínica Santa Elena",
  "Transportes Aconcagua",
  "Retail Nova",
];

export const cotizaciones: Cotizacion[] = [
  { id: "COT-2041", cliente: "Minera Los Andes", monto: 4850000, estado: "Aprobada", otId: "OT-1042", fecha: "2026-08-24" },
  { id: "COT-2042", cliente: "Constructora Vertiz", monto: 1290000, estado: "Enviada", otId: "OT-1043", fecha: "2026-08-28" },
  { id: "COT-2043", cliente: "Clínica Santa Elena", monto: 760000, estado: "Borrador", otId: "OT-1045", fecha: "2026-09-01" },
  { id: "COT-2044", cliente: "Retail Nova", monto: 3120000, estado: "Rechazada", fecha: "2026-08-12" },
  { id: "COT-2045", cliente: "Transportes Aconcagua", monto: 2040000, estado: "Aprobada", otId: "OT-1041", fecha: "2026-08-05" },
  { id: "COT-2046", cliente: "Minera Los Andes", monto: 980000, estado: "Enviada", fecha: "2026-09-08" },
];

export const otsIniciales: OT[] = [
  {
    id: "OT-1041",
    titulo: "Mantención preventiva de UPS sala de servidores",
    cliente: "Transportes Aconcagua",
    descripcion:
      "Revisión de banco de baterías, cambio de módulos con alerta y prueba de autonomía en sala principal.",
    estado: "Facturado",
    prioridad: "Media",
    responsableId: "u3",
    colaboradores: ["u5"],
    fechaIngreso: "2026-07-28",
    fechaEstimada: "2026-08-14",
    cotizacionId: "COT-2045",
    horas: [
      { id: "h1", usuarioId: "u3", fecha: "2026-08-05", horas: 6, descripcion: "Diagnóstico y cambio de módulos" },
      { id: "h2", usuarioId: "u5", fecha: "2026-08-06", horas: 3.5, descripcion: "Prueba de autonomía" },
    ],
    adjuntos: [
      { id: "a1", nombre: "informe-final.pdf", tipo: "pdf", peso: "820 KB" },
      { id: "a2", nombre: "sala-servidores.jpg", tipo: "imagen", peso: "1.2 MB" },
    ],
    actividad: [
      { id: "e1", tipo: "creacion", texto: "creó la OT desde un correo entrante", fecha: "2026-07-28 09:12", usuarioId: "u4" },
      { id: "e2", tipo: "estado", texto: "cambió el estado a En ejecución", fecha: "2026-08-05 08:40", usuarioId: "u3" },
      { id: "e3", tipo: "estado", texto: "cambió el estado a Facturado", fecha: "2026-08-18 17:05", usuarioId: "u4" },
    ],
    correos: [
      { id: "c1", asunto: "Solicitud mantención UPS", remitente: "Paula Ibáñez", fecha: "2026-07-28" },
    ],
  },
  {
    id: "OT-1042",
    titulo: "Instalación de red de fibra en planta 2",
    cliente: "Minera Los Andes",
    descripcion: "Tendido de 400 m de fibra, certificación de enlaces y puesta en marcha de switches de borde.",
    estado: "En ejecución",
    prioridad: "Alta",
    responsableId: "u2",
    colaboradores: ["u5", "u3", "u1"],
    fechaIngreso: "2026-08-20",
    fechaEstimada: "2026-09-05",
    cotizacionId: "COT-2041",
    horas: [
      { id: "h3", usuarioId: "u2", fecha: "2026-08-31", horas: 8, descripcion: "Tendido tramo norte" },
      { id: "h4", usuarioId: "u5", fecha: "2026-09-02", horas: 7, descripcion: "Fusión y certificación" },
    ],
    adjuntos: [
      { id: "a3", nombre: "plano-planta2.pdf", tipo: "pdf", peso: "2.4 MB" },
      { id: "a4", nombre: "avance-tendido.jpg", tipo: "imagen", peso: "980 KB" },
      { id: "a5", nombre: "correo-cliente.eml", tipo: "correo", peso: "34 KB" },
    ],
    actividad: [
      { id: "e4", tipo: "creacion", texto: "creó la OT", fecha: "2026-08-20 11:02", usuarioId: "u1" },
      { id: "e5", tipo: "comentario", texto: "comentó: falta confirmar acceso a planta el fin de semana", fecha: "2026-08-29 15:20", usuarioId: "u2" },
      { id: "e6", tipo: "estado", texto: "cambió el estado a En ejecución", fecha: "2026-08-31 07:55", usuarioId: "u2" },
    ],
    correos: [
      { id: "c2", asunto: "RE: Coordinación acceso planta 2", remitente: "Jorge Cáceres", fecha: "2026-08-29" },
      { id: "c3", asunto: "Aprobación cotización COT-2041", remitente: "Jorge Cáceres", fecha: "2026-08-25" },
    ],
    origen: "Correo",
    categoria: "Instalación",
    solicitanteNombre: "Jorge Cáceres",
    solicitanteContacto: "jcaceres@mineralosandes.cl",
    ubicacion: "Planta 2 · sector norte",
    etapas: [
      { id: "et1", nombre: "Tendido tramo norte", inicio: "2026-08-24", fin: "2026-09-01" },
      { id: "et2", nombre: "Fusión y certificación", inicio: "2026-09-02", fin: "2026-09-08" },
      { id: "et3", nombre: "Puesta en marcha switches", inicio: "2026-09-09", fin: "2026-09-15" },
    ],
  },
  {
    id: "OT-1043",
    titulo: "Reparación de tablero eléctrico obra Vertiz",
    cliente: "Constructora Vertiz",
    descripcion: "Reemplazo de protecciones y normalización de canalización en tablero general de obra.",
    estado: "Aprobado",
    prioridad: "Alta",
    responsableId: "u3",
    fechaIngreso: "2026-08-26",
    fechaEstimada: "2026-09-12",
    cotizacionId: "COT-2042",
    horas: [{ id: "h5", usuarioId: "u3", fecha: "2026-09-02", horas: 4, descripcion: "Levantamiento en terreno" }],
    adjuntos: [{ id: "a6", nombre: "tablero-actual.jpg", tipo: "imagen", peso: "1.5 MB" }],
    actividad: [
      { id: "e7", tipo: "creacion", texto: "creó la OT", fecha: "2026-08-26 10:15", usuarioId: "u4" },
      { id: "e8", tipo: "adjunto", texto: "agregó 1 adjunto", fecha: "2026-09-02 18:00", usuarioId: "u3" },
    ],
    correos: [{ id: "c4", asunto: "Fotos tablero obra", remitente: "Marcela Vertiz", fecha: "2026-08-26" }],
  },
  {
    id: "OT-1044",
    titulo: "Soporte a sistema de control de acceso",
    cliente: "Clínica Santa Elena",
    descripcion: "Lectoras del ala B no registran tarjetas; revisar controladora y firmware.",
    estado: "En ejecución",
    prioridad: "Alta",
    responsableId: "u5",
    colaboradores: ["u2"],
    fechaIngreso: "2026-08-18",
    fechaEstimada: "2026-09-04",
    horas: [{ id: "h6", usuarioId: "u5", fecha: "2026-09-01", horas: 5, descripcion: "Revisión controladora ala B" }],
    adjuntos: [],
    actividad: [
      { id: "e9", tipo: "creacion", texto: "creó la OT", fecha: "2026-08-18 08:30", usuarioId: "u1" },
      { id: "e10", tipo: "comentario", texto: "comentó: se solicitó repuesto al proveedor", fecha: "2026-09-03 12:10", usuarioId: "u5" },
    ],
    correos: [{ id: "c5", asunto: "Urgente: accesos ala B", remitente: "Dr. Andrés Lillo", fecha: "2026-08-18" }],
  },
  {
    id: "OT-1045",
    titulo: "Cotizar renovación de cámaras perimetrales",
    cliente: "Clínica Santa Elena",
    descripcion: "Levantamiento de 18 cámaras y propuesta de reemplazo por equipos IP.",
    estado: "En cotización",
    prioridad: "Media",
    responsableId: "u2",
    fechaIngreso: "2026-09-01",
    fechaEstimada: "2026-09-18",
    cotizacionId: "COT-2043",
    horas: [],
    adjuntos: [{ id: "a7", nombre: "listado-camaras.pdf", tipo: "pdf", peso: "410 KB" }],
    actividad: [{ id: "e11", tipo: "creacion", texto: "creó la OT", fecha: "2026-09-01 09:40", usuarioId: "u2" }],
    correos: [],
  },
  {
    id: "OT-1046",
    titulo: "Revisión de climatización sala rack",
    cliente: "Retail Nova",
    descripcion: "Temperatura sobre 28°C en horario punta; evaluar capacidad del equipo actual.",
    estado: "Ingresado",
    prioridad: "Media",
    responsableId: "u3",
    recepcionadoPorId: "u4",
    derivaciones: [
      {
        id: "d1",
        deId: "u4",
        aId: "u2",
        motivo: "requiere evaluación técnica de capacidad del equipo",
        fecha: "2026-09-08 18:30",
      },
      {
        id: "d2",
        deId: "u2",
        aId: "u3",
        motivo: "necesita visita en terreno y medición de carga térmica",
        fecha: "2026-09-09 10:45",
      },
    ],
    fechaIngreso: "2026-09-08",
    fechaEstimada: "2026-09-22",
    horas: [],
    adjuntos: [{ id: "a8", nombre: "alerta-temperatura.jpg", tipo: "imagen", peso: "640 KB" }],
    actividad: [{ id: "e12", tipo: "creacion", texto: "creó la OT desde un correo entrante", fecha: "2026-09-08 16:22", usuarioId: "u4" }],
    correos: [{ id: "c6", asunto: "Alerta temperatura sala rack", remitente: "Soporte Retail Nova", fecha: "2026-09-08" }],
  },
  {
    id: "OT-1047",
    titulo: "Cambio de luminarias bodega central",
    cliente: "Transportes Aconcagua",
    descripcion: "Recambio de 60 luminarias a LED, incluye retiro de equipos antiguos.",
    estado: "Terminado",
    prioridad: "Baja",
    responsableId: "u5",
    colaboradores: ["u3", "u1", "u4", "u2"],
    fechaIngreso: "2026-08-04",
    fechaEstimada: "2026-08-29",
    horas: [
      { id: "h7", usuarioId: "u5", fecha: "2026-08-20", horas: 8, descripcion: "Recambio sector A y B" },
      { id: "h8", usuarioId: "u3", fecha: "2026-08-21", horas: 6, descripcion: "Recambio sector C" },
    ],
    adjuntos: [{ id: "a9", nombre: "acta-recepcion.pdf", tipo: "pdf", peso: "300 KB" }],
    actividad: [
      { id: "e13", tipo: "creacion", texto: "creó la OT", fecha: "2026-08-04 14:00", usuarioId: "u1" },
      { id: "e14", tipo: "estado", texto: "cambió el estado a Terminado", fecha: "2026-08-28 19:30", usuarioId: "u5" },
    ],
    correos: [],
  },
  {
    id: "OT-1048",
    titulo: "Migración de correo corporativo (piloto)",
    cliente: "Constructora Vertiz",
    descripcion: "Piloto con 10 buzones, respaldo y validación de reglas de reenvío.",
    estado: "Ingresado",
    prioridad: "Baja",
    responsableId: "u2",
    fechaIngreso: "2026-09-09",
    fechaEstimada: "2026-09-30",
    horas: [],
    adjuntos: [],
    actividad: [{ id: "e15", tipo: "creacion", texto: "creó la OT", fecha: "2026-09-09 10:05", usuarioId: "u1" }],
    correos: [],
  },
  {
    id: "OT-1049",
    titulo: "Falla intermitente en enlace principal",
    cliente: "Minera Los Andes",
    descripcion: "Cortes de 2 a 5 minutos durante la tarde; revisar equipo de borde y enlace del proveedor.",
    estado: "En ejecución",
    prioridad: "Alta",
    responsableId: "u3",
    colaboradores: ["u2", "u5"],
    fechaIngreso: "2026-08-12",
    fechaEstimada: "2026-08-30",
    horas: [{ id: "h9", usuarioId: "u3", fecha: "2026-08-27", horas: 4.5, descripcion: "Monitoreo y captura de tráfico" }],
    adjuntos: [{ id: "a10", nombre: "log-enlace.pdf", tipo: "pdf", peso: "150 KB" }],
    actividad: [
      { id: "e16", tipo: "creacion", texto: "creó la OT", fecha: "2026-08-12 11:45", usuarioId: "u2" },
      { id: "e17", tipo: "comentario", texto: "comentó: proveedor escaló el caso a nivel 2", fecha: "2026-09-04 09:15", usuarioId: "u3" },
    ],
    correos: [{ id: "c7", asunto: "Caso escalado enlace MPLS", remitente: "NOC Proveedor", fecha: "2026-09-04" }],
  },
  {
    id: "OT-1050",
    titulo: "Habilitación de puntos de red oficina nueva",
    cliente: "Retail Nova",
    descripcion: "24 puntos de red categoría 6A, certificación y rotulado.",
    estado: "En cotización",
    prioridad: "Media",
    responsableId: "u5",
    fechaIngreso: "2026-09-05",
    fechaEstimada: "2026-09-25",
    horas: [],
    adjuntos: [],
    actividad: [{ id: "e18", tipo: "creacion", texto: "creó la OT", fecha: "2026-09-05 15:30", usuarioId: "u4" }],
    correos: [],
  },
];

export const ticketsIniciales: Ticket[] = [
  {
    id: "TK-0001",
    asunto: "Alerta temperatura sala rack",
    descripcion:
      "El monitoreo marcó 28.6 °C en la sala rack de casa central durante toda la tarde. Adjunto captura del panel.",
    solicitanteNombre: "Soporte Retail Nova",
    solicitanteEmail: "soporte@retailnova.cl",
    empresa: "Retail Nova",
    fecha: "2026-09-08 16:20",
    canal: "Correo",
    prioridad: "Media",
    estado: "Abierto",
    responsableId: "u3",
    otIds: ["OT-1046"],
    adjuntos: ["panel-monitoreo.png"],
    mensajes: [
      {
        id: "mt1",
        autor: "cliente",
        nombre: "Soporte Retail Nova",
        texto:
          "Buenas tardes, el monitoreo marcó 28.6 °C en la sala rack durante toda la tarde. Adjunto captura del panel.",
        fecha: "2026-09-08 16:20",
        adjuntos: ["panel-monitoreo.png"],
      },
      {
        id: "mt2",
        autor: "equipo",
        usuarioId: "u3",
        nombre: "Diego Rojas",
        texto:
          "Hola, recibimos su reporte y agendamos visita para revisar la capacidad del equipo de climatización. Creamos la OT-1046 para el seguimiento.",
        fecha: "2026-09-08 17:05",
      },
      {
        id: "mt3",
        autor: "equipo",
        usuarioId: "u3",
        nombre: "Diego Rojas",
        texto: "Ojo: el equipo actual ya está al límite, conviene proponer recambio en la visita.",
        fecha: "2026-09-08 17:06",
        interna: true,
      },
    ],
    actividad: [
      { id: "te1", tipo: "creacion", texto: "registró el ticket desde Correo", fecha: "2026-09-08 16:20", usuarioId: "u4" },
      { id: "te2", tipo: "comentario", texto: "respondió al cliente", fecha: "2026-09-08 17:05", usuarioId: "u3" },
      { id: "te3", tipo: "comentario", texto: "agregó una nota interna", fecha: "2026-09-08 17:06", usuarioId: "u3" },
      { id: "te4", tipo: "adjunto", texto: "vinculó la OT-1046", fecha: "2026-09-08 17:10", usuarioId: "u3" },
    ],
  },
  {
    id: "TK-0002",
    asunto: "Solicitud de cotización: 12 notebooks + docking",
    descripcion:
      "Necesitamos cotizar 12 notebooks para el equipo de terreno con sus docking y garantía extendida a 3 años.",
    solicitanteNombre: "Marcela Vertiz",
    solicitanteEmail: "mvertiz@vertiz.cl",
    empresa: "Constructora Vertiz",
    fecha: "2026-09-10 08:45",
    canal: "Portal",
    prioridad: "Media",
    estado: "Nuevo",
    otIds: [],
    adjuntos: ["requerimiento-equipos.pdf"],
    mensajes: [
      {
        id: "mt4",
        autor: "cliente",
        nombre: "Marcela Vertiz",
        texto:
          "Hola, necesitamos cotizar 12 notebooks para el equipo de terreno con sus docking y garantía extendida a 3 años.",
        fecha: "2026-09-10 08:45",
        adjuntos: ["requerimiento-equipos.pdf"],
      },
    ],
  },
  {
    id: "TK-0003",
    asunto: "Cortes de enlace continúan en turno tarde",
    descripcion:
      "Ayer volvimos a tener dos cortes cerca de las 17:00. ¿Pueden revisar si el proveedor ya cambió el equipo de borde?",
    solicitanteNombre: "Jorge Cáceres",
    solicitanteEmail: "jcaceres@mineralosandes.cl",
    empresa: "Minera Los Andes",
    fecha: "2026-08-12 09:20",
    canal: "Correo",
    prioridad: "Alta",
    estado: "Abierto",
    responsableId: "u3",
    recepcionadoPorId: "u4",
    derivaciones: [
      {
        id: "d3",
        deId: "u4",
        aId: "u2",
        motivo: "requiere cotización y cálculo de horas",
        fecha: "2026-08-12 09:45",
      },
      {
        id: "d4",
        deId: "u2",
        aId: "u3",
        motivo: "seguimiento técnico con el proveedor del enlace",
        fecha: "2026-09-04 08:50",
      },
    ],
    otIds: ["OT-1049"],
    adjuntos: [],
    mensajes: [
      {
        id: "mt5",
        autor: "cliente",
        nombre: "Jorge Cáceres",
        texto:
          "Ayer volvimos a tener dos cortes cerca de las 17:00. ¿Pueden revisar si el proveedor ya cambió el equipo de borde?",
        fecha: "2026-08-12 09:20",
      },
      {
        id: "mt6",
        autor: "equipo",
        usuarioId: "u2",
        nombre: "Carla Soto",
        texto:
          "Recibimos su reporte y abrimos la OT-1049 para revisar el equipo de borde junto al proveedor del enlace.",
        fecha: "2026-08-12 11:50",
      },
      {
        id: "mt12",
        autor: "equipo",
        usuarioId: "u3",
        nombre: "Diego Rojas",
        texto:
          "Estamos monitoreando el enlace y el proveedor escaló el caso a nivel 2. Le confirmamos hoy mismo el cambio de equipo.",
        fecha: "2026-09-04 09:20",
      },
    ],
    actividad: [
      { id: "te5", tipo: "creacion", texto: "registró el ticket desde Correo", fecha: "2026-08-12 09:20", usuarioId: "u4" },
      { id: "te6", tipo: "estado", texto: "derivó a Carla Soto — motivo: requiere cotización y cálculo de horas", fecha: "2026-08-12 09:45", usuarioId: "u4" },
      { id: "te7", tipo: "adjunto", texto: "vinculó la OT-1049", fecha: "2026-08-12 11:45", usuarioId: "u2" },
      { id: "te8", tipo: "comentario", texto: "respondió al cliente", fecha: "2026-08-12 11:50", usuarioId: "u2" },
      { id: "te9", tipo: "estado", texto: "derivó a Diego Rojas — motivo: seguimiento técnico con el proveedor del enlace", fecha: "2026-09-04 08:50", usuarioId: "u2" },
      { id: "te10", tipo: "comentario", texto: "respondió al cliente", fecha: "2026-09-04 09:20", usuarioId: "u3" },
    ],
  },
  {
    id: "TK-0004",
    asunto: "Fuga de agua cerca de tablero bodega",
    descripcion:
      "Hay filtración en el techo de la bodega, justo sobre el tablero eléctrico. Necesitamos visita hoy si es posible.",
    solicitanteNombre: "Paula Ibáñez",
    solicitanteEmail: "pibanez@aconcagua.cl",
    empresa: "Transportes Aconcagua",
    fecha: "2026-09-10 13:02",
    canal: "Portal",
    prioridad: "Alta",
    estado: "Nuevo",
    otIds: [],
    adjuntos: ["filtracion-1.jpg", "filtracion-2.jpg"],
    mensajes: [
      {
        id: "mt7",
        autor: "cliente",
        nombre: "Paula Ibáñez",
        texto:
          "Urgente: hay filtración en el techo de la bodega, justo sobre el tablero eléctrico. Necesitamos visita hoy si es posible.",
        fecha: "2026-09-10 13:02",
        adjuntos: ["filtracion-1.jpg", "filtracion-2.jpg"],
      },
    ],
  },
  {
    id: "TK-0005",
    asunto: "Consulta por mantención semestral 2027",
    descripcion:
      "Quisiéramos programar la mantención semestral del próximo año y saber si mantienen los valores.",
    solicitanteNombre: "Dr. Andrés Lillo",
    solicitanteEmail: "alillo@santaelena.cl",
    empresa: "Clínica Santa Elena",
    fecha: "2026-09-07 09:25",
    canal: "Teléfono",
    prioridad: "Baja",
    estado: "Esperando cliente",
    responsableId: "u4",
    otIds: [],
    adjuntos: [],
    mensajes: [
      {
        id: "mt8",
        autor: "cliente",
        nombre: "Dr. Andrés Lillo",
        texto:
          "Llamó para programar la mantención semestral del próximo año y consultar si se mantienen los valores.",
        fecha: "2026-09-07 09:25",
      },
      {
        id: "mt9",
        autor: "equipo",
        usuarioId: "u4",
        nombre: "Valentina Pérez",
        texto:
          "Le enviamos la propuesta con los valores 2027. Quedamos atentos a su confirmación para reservar las fechas.",
        fecha: "2026-09-07 11:40",
      },
    ],
  },
  {
    id: "TK-0006",
    asunto: "Solicitud de recambio de luminarias bodega central",
    descripcion:
      "Necesitamos cambiar las luminarias de la bodega central a LED, son unas 60 y varias ya están quemadas.",
    solicitanteNombre: "Paula Ibáñez",
    solicitanteEmail: "pibanez@aconcagua.cl",
    empresa: "Transportes Aconcagua",
    fecha: "2026-08-04 09:15",
    canal: "Correo",
    prioridad: "Baja",
    estado: "Resuelto",
    responsableId: "u5",
    otIds: ["OT-1047"],
    adjuntos: ["acta-firmada.pdf"],
    mensajes: [
      {
        id: "mt10",
        autor: "cliente",
        nombre: "Paula Ibáñez",
        texto:
          "Necesitamos cambiar las luminarias de la bodega central a LED, son unas 60 y varias ya están quemadas.",
        fecha: "2026-08-04 09:15",
      },
      {
        id: "mt11",
        autor: "equipo",
        usuarioId: "u5",
        nombre: "Mauricio Leiva",
        texto:
          "Trabajo terminado y acta de recepción firmada por bodega. Cerramos el ticket y dejamos la OT-1047 como terminada.",
        fecha: "2026-08-28 19:35",
        adjuntos: ["acta-firmada.pdf"],
      },
    ],
    actividad: [
      { id: "te11", tipo: "creacion", texto: "registró el ticket desde Correo", fecha: "2026-08-04 09:15", usuarioId: "u1" },
      { id: "te12", tipo: "adjunto", texto: "vinculó la OT-1047", fecha: "2026-08-04 14:00", usuarioId: "u1" },
      { id: "te13", tipo: "comentario", texto: "respondió al cliente", fecha: "2026-08-28 19:35", usuarioId: "u5" },
      { id: "te14", tipo: "estado", texto: "cambió el estado a Resuelto", fecha: "2026-08-28 19:40", usuarioId: "u5" },
    ],
  },
];

export const notificacionesIniciales: Notificacion[] = [
  { id: "n1", tipo: "ticket", texto: "Nuevo ticket TK-0004 de Paula Ibáñez: fuga de agua cerca de tablero bodega", fecha: "hace 12 min", leida: false },
  { id: "n2", tipo: "respuesta-cliente", texto: "Marcela Vertiz respondió en TK-0002: espera la cotización de los notebooks", fecha: "hace 40 min", leida: false },
  { id: "n3", tipo: "comentario", texto: "Diego Rojas comentó en OT-1049: proveedor escaló el caso a nivel 2", fecha: "hace 1 h", leida: false },
  { id: "n4", tipo: "nueva-ot", texto: "Valentina Pérez creó OT-1046 · Retail Nova", fecha: "hace 3 h", leida: false },
  { id: "n5", tipo: "estado", texto: "OT-1043 pasó a Aprobado", fecha: "ayer", leida: true },
  { id: "n6", tipo: "estado", texto: "OT-1047 pasó a Terminado", fecha: "hace 3 días", leida: true },
];

export const formatoMoneda = (monto: number) =>
  monto.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export const formatoFecha = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });

export const HOY = new Date("2026-09-10T12:00:00");

// ---- SLA configurable por prioridad (mock, solo en memoria) ----

export type SlaConfig = Record<Prioridad, number>;

export const slaPorDefecto: SlaConfig = { Alta: 24, Media: 72, Baja: 120 };

export type NivelSla = "En plazo" | "Por vencer" | "Vencida";

export const vencimientoSla = (ot: OT, sla: SlaConfig) =>
  new Date(new Date(ot.fechaIngreso + "T12:00:00").getTime() + (sla[ot.prioridad] ?? 0) * 3600000);

export const nivelSla = (ot: OT, sla: SlaConfig): NivelSla => {
  if (ot.estado === "Terminado" || ot.estado === "Facturado") return "En plazo";
  const horas = sla[ot.prioridad] ?? 0;
  const vence = vencimientoSla(ot, sla).getTime();
  if (HOY.getTime() >= vence) return "Vencida";
  const restante = vence - HOY.getTime();
  return restante <= horas * 3600000 * 0.2 ? "Por vencer" : "En plazo";
};

export const formatoFechaHora = (fecha: Date) =>
  fecha.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export type Comentario = {
  id: string;
  otId: string;
  usuarioId: string;
  texto: string;
  fecha: string;
  visibleCliente?: boolean;
};

// ---- SLA de primera respuesta de tickets ----

export type SlaRespuestaConfig = Record<Prioridad, number>;

export const slaRespuestaPorDefecto: SlaRespuestaConfig = { Alta: 2, Media: 8, Baja: 24 };

export type NivelRespuesta = "En plazo" | "Por vencer" | "Vencido";

export const aFecha = (valor: string) =>
  new Date(valor.length === 10 ? `${valor}T12:00:00` : valor.replace(" ", "T"));

export const primeraRespuesta = (t: Ticket) =>
  t.mensajes.find((m) => m.autor === "equipo" && !m.interna);

export const horasPrimeraRespuesta = (t: Ticket) => {
  const r = primeraRespuesta(t);
  if (!r) return null;
  return (aFecha(r.fecha).getTime() - aFecha(t.fecha).getTime()) / 3600000;
};

/** Devuelve null cuando el ticket ya recibió su primera respuesta al cliente. */
export const nivelPrimeraRespuesta = (t: Ticket, cfg: SlaRespuestaConfig): NivelRespuesta | null => {
  if (primeraRespuesta(t)) return null;
  const horas = cfg[t.prioridad] ?? 0;
  const vence = aFecha(t.fecha).getTime() + horas * 3600000;
  if (HOY.getTime() >= vence) return "Vencido";
  return vence - HOY.getTime() <= horas * 3600000 * 0.2 ? "Por vencer" : "En plazo";
};

export const vencimientoPrimeraRespuesta = (t: Ticket, cfg: SlaRespuestaConfig) =>
  new Date(aFecha(t.fecha).getTime() + (cfg[t.prioridad] ?? 0) * 3600000);

export const comentariosIniciales: Comentario[] = [
  {
    id: "cm1",
    otId: "OT-1042",
    usuarioId: "u2",
    texto: "Falta confirmar acceso a planta el fin de semana con prevención de riesgos.",
    fecha: "2026-08-29 15:20",
  },
  {
    id: "cm2",
    otId: "OT-1049",
    usuarioId: "u3",
    texto: "El proveedor escaló el caso a nivel 2, esperamos respuesta mañana.",
    fecha: "2026-09-04 09:15",
  },
  {
    id: "cm3",
    otId: "OT-1044",
    usuarioId: "u5",
    texto: "Se solicitó el repuesto de la controladora, llega el viernes.",
    fecha: "2026-09-03 12:10",
  },
];

// ---- Cadena de responsables (derivaciones) ----

export type TramoResponsable = {
  usuarioId: string;
  desde: string;
  hasta: string | null;
  motivoSalida?: string;
  actual: boolean;
};

/** Duración legible entre dos instantes: "2 h 15 min", "3 d 4 h". */
export const formatoDuracion = (desde: string, hasta: Date | string) => {
  const fin = typeof hasta === "string" ? aFecha(hasta) : hasta;
  const ms = Math.max(fin.getTime() - aFecha(desde).getTime(), 0);
  const min = Math.round(ms / 60000);
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const resto = min % 60;
  if (dias > 0) return `${dias} d${horas > 0 ? ` ${horas} h` : ""}`;
  if (horas > 0) return `${horas} h${resto > 0 ? ` ${resto} min` : ""}`;
  return `${resto} min`;
};

/**
 * Cadena cronológica de responsables de un ticket u OT. El primer tramo
 * corresponde a quien lo recepcionó; el último es el responsable actual.
 */
export const cadenaResponsables = (item: {
  fecha?: string;
  fechaIngreso?: string;
  responsableId?: string;
  recepcionadoPorId?: string;
  derivaciones?: Derivacion[];
}): TramoResponsable[] => {
  const inicio = item.fecha ?? item.fechaIngreso ?? "";
  const derivaciones = item.derivaciones ?? [];
  const primero = item.recepcionadoPorId ?? derivaciones[0]?.deId ?? item.responsableId;
  if (!primero) return [];
  const tramos: TramoResponsable[] = [
    { usuarioId: primero, desde: inicio, hasta: null, actual: false },
  ];
  for (const d of derivaciones) {
    const previo = tramos[tramos.length - 1]!;
    previo.hasta = d.fecha;
    previo.motivoSalida = d.motivo;
    tramos.push({ usuarioId: d.aId, desde: d.fecha, hasta: null, actual: false });
  }
  const ultimo = tramos[tramos.length - 1]!;
  if (item.responsableId && ultimo.usuarioId !== item.responsableId) {
    ultimo.hasta = inicio;
    tramos.push({ usuarioId: item.responsableId, desde: inicio, hasta: null, actual: false });
  }
  tramos[tramos.length - 1]!.actual = true;
  return tramos;
};

export const recepcionadoPor = (item: {
  responsableId?: string;
  recepcionadoPorId?: string;
  derivaciones?: Derivacion[];
}) => item.recepcionadoPorId ?? item.derivaciones?.[0]?.deId ?? item.responsableId;
