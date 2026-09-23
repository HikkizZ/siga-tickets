import { Check, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/Prioridad";
import { cn } from "@/lib/utils";
import { usuarios } from "@/lib/mock-data";

export function SelectorColaboradores({
  valor,
  onChange,
  excluir,
  className,
}: {
  valor: string[];
  onChange: (ids: string[]) => void;
  excluir?: string;
  className?: string;
}) {
  const opciones = usuarios.filter((u) => u.id !== excluir);
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
              ? usuarios.find((u) => u.id === valor[0])?.nombre
              : `${valor.length} colaboradores`}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <ul>
          {opciones.map((u) => {
            const activo = valor.includes(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => alternar(u.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Avatar iniciales={u.iniciales} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{u.nombre}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{u.rol}</span>
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
