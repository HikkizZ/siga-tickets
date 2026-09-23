import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Herramienta interna de ~8 personas: sin necesidad de reintentos agresivos ni refetch
  // constante (eso es para apps públicas de alto tráfico). Nada de negocio se conecta todavía
  // (Fase 0); esto solo deja el proveedor listo para los hooks de las fases siguientes.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
