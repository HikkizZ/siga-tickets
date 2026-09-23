import { Check, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/Prioridad";
import { cn } from "@/lib/utils";
import { inicialesDeNombre } from "@/lib/utils";

// Fase 1: ya no lee el arreglo mock `usuarios` — recibe la lista real (de useUsuarios()) por
// prop, porque solo se usa desde OTDetail.tsx y nueva-ot.tsx (ningún componente fuera de esta
// fase depende de él).
export function SelectorColaboradores({
  valor,
  onChange,
  opciones,
  excluir,
  className,
}: {
  valor: string[];
  onChange: (ids: string[]) => void;
  opciones: { id: string; nombre: string; cargo?: string | null }[];
  excluir?: string;
  className?: string;
}) {
  const disponibles = opciones.filter((u) => u.id !== excluir);
  const alternar = (id: string) =>
    onChange(valor.includes(id) ? valor.filter((v) => v !== id) : [...valor, id]);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        <Users className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", valor.length === 0 && "text-muted-foreground")}>
          {valor.length === 0
            ? "Sin colaboradores"
            : valor.length === 1
              ? (opciones.find((u) => u.id === valor[0])?.nombre ?? "1 colaborador")
              : `${valor.length} colaboradores`}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <ul>
          {disponibles.length === 0 && (
            <li className="px-2 py-2 text-xs text-muted-foreground">No hay usuarios disponibles.</li>
          )}
          {disponibles.map((u) => {
            const activo = valor.includes(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => alternar(u.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Avatar iniciales={inicialesDeNombre(u.nombre)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{u.nombre}</span>
                    {u.cargo && <span className="block truncate text-[11px] text-muted-foreground">{u.cargo}</span>}
                  </span>
                  {activo && <Check className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
