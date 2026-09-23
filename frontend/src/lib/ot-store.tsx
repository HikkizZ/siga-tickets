import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  getUsuario,
  type Derivacion,
  comentariosIniciales,
  cotizaciones as cotizacionesIniciales,
  notificacionesIniciales,
  otsIniciales,
  slaPorDefecto,
  slaRespuestaPorDefecto,
  ticketsIniciales,
  usuarioActual,
  type SlaConfig,
  type SlaRespuestaConfig,
  type CategoriaTrabajo,
  type Comentario,
  type Etapa,
  type OrigenTicket,
  type Cotizacion,
  type EstadoOT,
  type EstadoTicket,
  type CanalTicket,
  type MensajeTicket,
  type Notificacion,
  type OT,
  type Prioridad,
  type Ticket,
  type EventoActividad,
} from "./mock-data";

export type NuevaOTInput = {
  titulo: string;
  descripcion: string;
  cliente: string;
  prioridad: Prioridad;
  responsableId: string;
  colaboradores?: string[];
  fechaIngreso: string;
  fechaEstimada: string;
  origen?: OrigenTicket;
  esSolicitudInterna?: boolean;
  area?: string;
  solicitanteNombre?: string;
  solicitanteContacto?: string;
  categoria?: CategoriaTrabajo;
  ubicacion?: string;
  etapas?: Etapa[];
};

export type NuevoTicketInput = {
  asunto: string;
  descripcion: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitanteTelefono?: string;
  empresa?: string;
  prioridad: Prioridad;
  canal?: CanalTicket;
  adjuntos?: string[];
  responsableId?: string;
};

type Store = {
  ots: OT[];
  tickets: Ticket[];
  cotizaciones: Cotizacion[];
  comentarios: Comentario[];
  notificaciones: Notificacion[];
  sla: SlaConfig;
  slaRespuesta: SlaRespuestaConfig;
  guardarSla: (sla: SlaConfig) => void;
  guardarSlaRespuesta: (sla: SlaRespuestaConfig) => void;
  otSeleccionada: OT | null;
  abrirOT: (id: string | null) => void;
  ticketAbierto: string | null;
  abrirTicket: (id: string | null) => void;
  moverOT: (id: string, estado: EstadoOT) => void;
  cambiarPrioridad: (id: string, prioridad: Prioridad) => void;
  agregarHora: (id: string, horas: number, descripcion: string) => void;
  agregarComentario: (id: string, texto: string, visibleCliente?: boolean) => void;
  crearCotizacion: (otId: string) => void;
  vincularCotizacion: (otId: string, cotizacionId: string) => void;
  crearOT: (datos: NuevaOTInput) => string;
  actualizarEtapas: (otId: string, etapas: Etapa[]) => void;
  actualizarColaboradores: (otId: string, colaboradores: string[]) => void;
  derivarOT: (
    otId: string,
    datos: { destinoId: string; motivo: string; mantenerColaborador?: boolean },
  ) => void;
  derivarTicket: (ticketId: string, datos: { destinoId: string; motivo: string }) => void;
  marcarNotificacionesLeidas: () => void;
  // Mesa de ayuda
  crearTicket: (datos: NuevoTicketInput) => string;
  responderTicket: (ticketId: string, texto: string, interna?: boolean) => void;
  responderComoCliente: (ticketId: string, texto: string) => void;
  cambiarEstadoTicket: (ticketId: string, estado: EstadoTicket) => void;
  asignarTicket: (ticketId: string, usuarioId: string) => void;
  cambiarPrioridadTicket: (ticketId: string, prioridad: Prioridad) => void;
  vincularTicketAOT: (ticketId: string, otId: string) => void;
  crearOTDesdeTicket: (
    ticketId: string,
    datos: { cliente: string; titulo: string; descripcion: string; responsableId: string },
  ) => string;
};

// Se reutiliza la misma instancia entre recargas en caliente (HMR) para que el
// provider y los consumidores nunca queden apuntando a contextos distintos.
const globalRef = globalThis as { __otContext?: React.Context<Store | null> };
const OTContext = (globalRef.__otContext ??= createContext<Store | null>(null));

const hoyISO = "2026-09-10";
const ahora = `${hoyISO} 16:09`;
const idCorto = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

export function OTProvider({ children }: { children: ReactNode }) {
  const [ots, setOts] = useState<OT[]>(otsIniciales);
  const [tickets, setTickets] = useState<Ticket[]>(ticketsIniciales);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(cotizacionesIniciales);
  const [comentarios, setComentarios] = useState<Comentario[]>(comentariosIniciales);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>(notificacionesIniciales);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [ticketAbierto, setTicketAbierto] = useState<string | null>(null);
  const [sla, setSla] = useState<SlaConfig>(slaPorDefecto);
  const [slaRespuesta, setSlaRespuesta] = useState<SlaRespuestaConfig>(slaRespuestaPorDefecto);

  const value = useMemo<Store>(() => {
    const registrarActividad = (ot: OT, tipo: OT["actividad"][number]["tipo"], texto: string): OT => ({
      ...ot,
      actividad: [
        ...ot.actividad,
        {
          id: idCorto("e"),
          tipo,
          texto,
          fecha: ahora,
          usuarioId: usuarioActual.id,
        },
      ],
    });

    const notificar = (tipo: Notificacion["tipo"], texto: string) =>
      setNotificaciones((prev) => [
        { id: idCorto("n"), tipo, texto, fecha: "hace unos segundos", leida: false },
        ...prev,
      ]);

    const nuevoIdTicket = () => {
      const max = tickets.reduce((m, t) => Math.max(m, Number(t.id.slice(3)) || 0), 0);
      return `TK-${String(max + 1).padStart(4, "0")}`;
    };

    const conActividad = (
      t: Ticket,
      tipo: EventoActividad["tipo"],
      texto: string,
      usuarioId: string = usuarioActual.id,
    ): Ticket => ({
      ...t,
      actividad: [
        ...(t.actividad ?? []),
        { id: idCorto("te"), tipo, texto, fecha: ahora, usuarioId },
      ],
    });

    const actualizarTicket = (
      ticketId: string,
      cambios: Partial<Ticket>,
      evento?: { tipo: EventoActividad["tipo"]; texto: string; usuarioId?: string },
    ) =>
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const base = { ...t, ...cambios };
          return evento ? conActividad(base, evento.tipo, evento.texto, evento.usuarioId) : base;
        }),
      );

    const agregarMensaje = (
      ticketId: string,
      mensaje: MensajeTicket,
      estado?: EstadoTicket,
      evento?: { tipo: EventoActividad["tipo"]; texto: string; usuarioId?: string },
    ) =>
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const base: Ticket = {
            ...t,
            mensajes: [...t.mensajes, mensaje],
            ...(estado ? { estado } : {}),
          };
          return evento ? conActividad(base, evento.tipo, evento.texto, evento.usuarioId) : base;
        }),
      );

    return {
      ots,
      tickets,
      cotizaciones,
      comentarios,
      notificaciones,
      sla,
      slaRespuesta,
      guardarSla: setSla,
      guardarSlaRespuesta: setSlaRespuesta,
      otSeleccionada: ots.find((o) => o.id === seleccionada) ?? null,
      abrirOT: setSeleccionada,
      ticketAbierto,
      abrirTicket: setTicketAbierto,
      moverOT: (id, estado) =>
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === id && ot.estado !== estado
              ? registrarActividad({ ...ot, estado }, "estado", `cambió el estado a ${estado}`)
              : ot,
          ),
        ),
      cambiarPrioridad: (id, prioridad) =>
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === id && ot.prioridad !== prioridad
              ? registrarActividad({ ...ot, prioridad }, "estado", `cambió la prioridad a ${prioridad}`)
              : ot,
          ),
        ),
      agregarHora: (id, horas, descripcion) =>
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === id
              ? registrarActividad(
                  {
                    ...ot,
                    horas: [
                      ...ot.horas,
                      {
                        id: idCorto("h"),
                        usuarioId: usuarioActual.id,
                        fecha: hoyISO,
                        horas,
                        descripcion,
                      },
                    ],
                  },
                  "comentario",
                  `registró ${horas} h de trabajo`,
                )
              : ot,
          ),
        ),
      agregarComentario: (id, texto, visibleCliente = false) => {
        setComentarios((prev) => [
          ...prev,
          { id: idCorto("cm"), otId: id, usuarioId: usuarioActual.id, texto, fecha: ahora, visibleCliente },
        ]);
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === id ? registrarActividad(ot, "comentario", `comentó: ${texto}`) : ot,
          ),
        );
        notificar("comentario", `${usuarioActual.nombre} comentó en ${id}: ${texto}`);
      },
      crearCotizacion: (otId) => {
        const ot = ots.find((o) => o.id === otId);
        if (!ot) return;
        const nuevoId = `COT-${2047 + cotizaciones.length - cotizacionesIniciales.length}`;
        setCotizaciones((prev) => [
          ...prev,
          { id: nuevoId, cliente: ot.cliente, monto: 0, estado: "Borrador", otId, fecha: hoyISO },
        ]);
        setOts((prev) =>
          prev.map((o) =>
            o.id === otId
              ? registrarActividad({ ...o, cotizacionId: nuevoId }, "adjunto", `creó la cotización ${nuevoId}`)
              : o,
          ),
        );
        notificar("estado", `Se creó la cotización ${nuevoId} para ${otId}`);
      },
      vincularCotizacion: (otId, cotizacionId) => {
        setCotizaciones((prev) => prev.map((c) => (c.id === cotizacionId ? { ...c, otId } : c)));
        setOts((prev) =>
          prev.map((o) =>
            o.id === otId
              ? registrarActividad(
                  { ...o, cotizacionId },
                  "adjunto",
                  `vinculó la cotización ${cotizacionId}`,
                )
              : o,
          ),
        );
      },
      crearOT: (datos) => {
        const nuevoId = `OT-${1051 + ots.length - otsIniciales.length}`;
        const nueva: OT = {
          id: nuevoId,
          titulo: datos.titulo,
          cliente: datos.cliente,
          descripcion: datos.descripcion,
          estado: "Ingresado",
          prioridad: datos.prioridad,
          responsableId: datos.responsableId,
          recepcionadoPorId: usuarioActual.id,
          fechaIngreso: datos.fechaIngreso,
          fechaEstimada: datos.fechaEstimada,
          horas: [],
          adjuntos: [],
          actividad: [
            {
              id: idCorto("e"),
              tipo: "creacion",
              texto: "creó la OT manualmente",
              fecha: ahora,
              usuarioId: usuarioActual.id,
            },
          ],
          correos: [],
          ...(datos.origen ? { origen: datos.origen } : {}),
          ...(datos.esSolicitudInterna ? { esSolicitudInterna: true } : {}),
          ...(datos.area ? { area: datos.area } : {}),
          ...(datos.solicitanteNombre ? { solicitanteNombre: datos.solicitanteNombre } : {}),
          ...(datos.solicitanteContacto ? { solicitanteContacto: datos.solicitanteContacto } : {}),
          ...(datos.categoria ? { categoria: datos.categoria } : {}),
          ...(datos.ubicacion ? { ubicacion: datos.ubicacion } : {}),
          ...(datos.etapas && datos.etapas.length > 0 ? { etapas: datos.etapas } : {}),
          ...(datos.colaboradores && datos.colaboradores.length > 0
            ? { colaboradores: datos.colaboradores }
            : {}),
        };
        setOts((prev) => [...prev, nueva]);
        notificar("nueva-ot", `${usuarioActual.nombre} creó ${nuevoId} · ${datos.cliente}`);
        return nuevoId;
      },
      actualizarEtapas: (otId, etapas) =>
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === otId
              ? registrarActividad(
                  { ...ot, etapas },
                  "estado",
                  etapas.length === 0
                    ? "quitó la planificación"
                    : `actualizó la planificación (${etapas.length} etapa${etapas.length === 1 ? "" : "s"})`,
                )
              : ot,
          ),
        ),
      actualizarColaboradores: (otId, colaboradores) =>
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === otId
              ? registrarActividad(
                  { ...ot, colaboradores },
                  "estado",
                  colaboradores.length === 0
                    ? "quitó los colaboradores"
                    : `actualizó los colaboradores (${colaboradores.length})`,
                )
              : ot,
          ),
        ),
      derivarOT: (otId, { destinoId, motivo, mantenerColaborador }) => {
        const ot = ots.find((o) => o.id === otId);
        if (!ot || ot.responsableId === destinoId) return;
        const anterior = ot.responsableId;
        const derivacion: Derivacion = {
          id: idCorto("d"),
          deId: anterior,
          aId: destinoId,
          motivo,
          fecha: ahora,
        };
        const colaboradores = mantenerColaborador
          ? Array.from(new Set([...(ot.colaboradores ?? []), anterior])).filter(
              (id) => id !== destinoId,
            )
          : (ot.colaboradores ?? []).filter((id) => id !== destinoId);
        setOts((prev) =>
          prev.map((o) =>
            o.id === otId
              ? registrarActividad(
                  {
                    ...o,
                    responsableId: destinoId,
                    recepcionadoPorId: o.recepcionadoPorId ?? anterior,
                    derivaciones: [...(o.derivaciones ?? []), derivacion],
                    colaboradores,
                  },
                  "estado",
                  `derivó a ${getUsuario(destinoId).nombre} — motivo: ${motivo}`,
                )
              : o,
          ),
        );
        notificar(
          "estado",
          `${getUsuario(anterior).nombre} te derivó ${otId}: ${motivo}`,
        );
      },
      derivarTicket: (ticketId, { destinoId, motivo }) => {
        const ticket = tickets.find((t) => t.id === ticketId);
        if (!ticket || ticket.responsableId === destinoId) return;
        const anterior = ticket.responsableId ?? usuarioActual.id;
        const derivacion: Derivacion = {
          id: idCorto("d"),
          deId: anterior,
          aId: destinoId,
          motivo,
          fecha: ahora,
        };
        actualizarTicket(
          ticketId,
          {
            responsableId: destinoId,
            recepcionadoPorId: ticket.recepcionadoPorId ?? anterior,
            derivaciones: [...(ticket.derivaciones ?? []), derivacion],
          },
          {
            tipo: "estado",
            texto: `derivó a ${getUsuario(destinoId).nombre} — motivo: ${motivo}`,
          },
        );
        notificar("ticket", `${getUsuario(anterior).nombre} te derivó ${ticketId}: ${motivo}`);
      },
      marcarNotificacionesLeidas: () =>
        setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true }))),

      crearTicket: (datos) => {
        const nuevoId = nuevoIdTicket();
        const canal = datos.canal ?? "Portal";
        const nuevo: Ticket = {
          id: nuevoId,
          asunto: datos.asunto,
          descripcion: datos.descripcion,
          solicitanteNombre: datos.solicitanteNombre,
          solicitanteEmail: datos.solicitanteEmail,
          ...(datos.solicitanteTelefono ? { solicitanteTelefono: datos.solicitanteTelefono } : {}),
          ...(datos.empresa ? { empresa: datos.empresa } : {}),
          fecha: ahora,
          canal,
          ...(canal !== "Portal" ? { recepcionadoPorId: usuarioActual.id } : {}),
          ...(datos.responsableId ? { responsableId: datos.responsableId } : {}),
          prioridad: datos.prioridad,
          estado: "Nuevo",
          otIds: [],
          adjuntos: datos.adjuntos ?? [],
          mensajes: [
            {
              id: idCorto("mt"),
              autor: "cliente",
              nombre: datos.solicitanteNombre,
              texto: datos.descripcion,
              fecha: ahora,
              ...(datos.adjuntos && datos.adjuntos.length > 0 ? { adjuntos: datos.adjuntos } : {}),
            },
          ],
          actividad: [
            {
              id: idCorto("te"),
              tipo: "creacion",
              texto:
                canal === "Portal"
                  ? "ingresó el ticket desde el portal de la mesa de ayuda"
                  : `registró el ticket desde ${canal}`,
              fecha: ahora,
              usuarioId: canal === "Portal" ? (datos.responsableId ?? usuarioActual.id) : usuarioActual.id,
            },
          ],
        };
        setTickets((prev) => [nuevo, ...prev]);
        notificar("ticket", `Nuevo ticket ${nuevoId} de ${datos.solicitanteNombre}: ${datos.asunto}`);
        return nuevoId;
      },
      responderTicket: (ticketId, texto, interna = false) => {
        const ticket = tickets.find((t) => t.id === ticketId);
        const mensaje: MensajeTicket = {
          id: idCorto("mt"),
          autor: "equipo",
          usuarioId: usuarioActual.id,
          nombre: usuarioActual.nombre,
          texto,
          fecha: ahora,
          ...(interna ? { interna: true } : {}),
        };
        const nuevoEstado =
          !interna && ticket && (ticket.estado === "Nuevo" || ticket.estado === "Esperando cliente")
            ? "Abierto"
            : undefined;
        agregarMensaje(ticketId, mensaje, nuevoEstado, {
          tipo: "comentario",
          texto: interna
            ? "agregó una nota interna"
            : nuevoEstado
              ? "respondió al cliente y pasó el ticket a Abierto"
              : "respondió al cliente",
        });
      },
      responderComoCliente: (ticketId, texto) => {
        const ticket = tickets.find((t) => t.id === ticketId);
        if (!ticket) return;
        const mensaje: MensajeTicket = {
          id: idCorto("mt"),
          autor: "cliente",
          nombre: ticket.solicitanteNombre,
          texto,
          fecha: ahora,
        };
        agregarMensaje(
          ticketId,
          mensaje,
          ticket.estado === "Esperando cliente" ? "Abierto" : undefined,
          {
            tipo: "comentario",
            texto: `recibió una respuesta de ${ticket.solicitanteNombre}`,
            usuarioId: ticket.responsableId ?? usuarioActual.id,
          },
        );
        notificar("respuesta-cliente", `${ticket.solicitanteNombre} respondió en ${ticketId}: ${texto}`);
      },
      cambiarEstadoTicket: (ticketId, estado) =>
        actualizarTicket(ticketId, { estado }, { tipo: "estado", texto: `cambió el estado a ${estado}` }),
      asignarTicket: (ticketId, usuarioId) =>
        actualizarTicket(
          ticketId,
          { responsableId: usuarioId },
          { tipo: "estado", texto: `asignó el ticket a ${getUsuario(usuarioId).nombre}` },
        ),
      cambiarPrioridadTicket: (ticketId, prioridad) =>
        actualizarTicket(
          ticketId,
          { prioridad },
          { tipo: "estado", texto: `cambió la prioridad a ${prioridad}` },
        ),
      vincularTicketAOT: (ticketId, otId) => {
        const ticket = tickets.find((t) => t.id === ticketId);
        if (ticket && !ticket.otIds.includes(otId))
          actualizarTicket(
            ticketId,
            { otIds: [...ticket.otIds, otId] },
            { tipo: "adjunto", texto: `vinculó la ${otId}` },
          );
        if (!ticket) return;
        setOts((prev) =>
          prev.map((ot) =>
            ot.id === otId
              ? registrarActividad(
                  {
                    ...ot,
                    correos: [
                      ...ot.correos,
                      {
                        id: ticket.id,
                        asunto: `${ticket.id} · ${ticket.asunto}`,
                        remitente: ticket.solicitanteNombre,
                        fecha: ticket.fecha.slice(0, 10),
                      },
                    ],
                  },
                  "adjunto",
                  `vinculó el ticket ${ticket.id}`,
                )
              : ot,
          ),
        );
      },
      crearOTDesdeTicket: (ticketId, datos) => {
        const ticket = tickets.find((t) => t.id === ticketId);
        const nuevoId = `OT-${1051 + ots.length - otsIniciales.length}`;
        if (!ticket) return nuevoId;
        const nueva: OT = {
          id: nuevoId,
          titulo: datos.titulo,
          cliente: datos.cliente,
          descripcion: datos.descripcion,
          estado: "Ingresado",
          prioridad: ticket.prioridad,
          responsableId: datos.responsableId,
          recepcionadoPorId: ticket.recepcionadoPorId ?? ticket.responsableId ?? usuarioActual.id,
          ...(ticket.derivaciones && ticket.derivaciones.length > 0
            ? { derivaciones: ticket.derivaciones }
            : {}),
          fechaIngreso: ticket.fecha.slice(0, 10),
          fechaEstimada: "2026-09-30",
          horas: [],
          adjuntos: ticket.adjuntos.map((nombre, i) => ({
            id: `${ticketId}-a${i}`,
            nombre,
            tipo: nombre.endsWith(".pdf") ? ("pdf" as const) : ("imagen" as const),
            peso: "—",
          })),
          actividad: [
            {
              id: idCorto("e"),
              tipo: "creacion",
              texto: `registró la OT: creada desde ${ticket.id} por ${usuarioActual.nombre}`,
              fecha: ahora,
              usuarioId: usuarioActual.id,
            },
            ...(ticket.derivaciones ?? []).map((d) => ({
              id: idCorto("e"),
              tipo: "estado" as const,
              texto: `derivó a ${getUsuario(d.aId).nombre} — motivo: ${d.motivo}`,
              fecha: d.fecha,
              usuarioId: d.deId,
            })),
          ],
          correos: [
            {
              id: ticket.id,
              asunto: `${ticket.id} · ${ticket.asunto}`,
              remitente: ticket.solicitanteNombre,
              fecha: ticket.fecha.slice(0, 10),
            },
          ],
          origen: "Mesa de ayuda",
          solicitanteNombre: ticket.solicitanteNombre,
          solicitanteContacto: ticket.solicitanteEmail,
        };
        setOts((prev) => [...prev, nueva]);
        actualizarTicket(
          ticketId,
          {
            otIds: [...ticket.otIds, nuevoId],
            estado: ticket.estado === "Nuevo" ? "Abierto" : ticket.estado,
          },
          { tipo: "adjunto", texto: `convirtió el ticket en la ${nuevoId}` },
        );
        notificar("nueva-ot", `${usuarioActual.nombre} creó ${nuevoId} desde ${ticket.id}`);
        return nuevoId;
      },
    };
  }, [
    ots,
    tickets,
    cotizaciones,
    comentarios,
    notificaciones,
    seleccionada,
    ticketAbierto,
    sla,
    slaRespuesta,
  ]);

  return <OTContext.Provider value={value}>{children}</OTContext.Provider>;
}

export function useOTStore() {
  const ctx = useContext(OTContext);
  if (!ctx) throw new Error("useOTStore debe usarse dentro de OTProvider");
  return ctx;
}
