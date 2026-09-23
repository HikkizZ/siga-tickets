import { Link } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";

export function PortalLayout({
  children,
  accion,
}: {
  children: ReactNode;
  accion?: { to: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary">
            <Wrench className="size-4 text-primary-foreground" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Taller OT</p>
            <p className="text-[11px] text-muted-foreground">Mesa de ayuda</p>
          </div>
          {accion && (
            <Link
              to={accion.to}
              className="ml-auto text-xs font-medium text-primary transition-colors hover:underline sm:text-sm"
            >
              {accion.label}
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border bg-card px-4 py-4 text-center text-[11px] text-muted-foreground">
        Taller OT · Soporte de lunes a viernes, 9:00 a 18:00 · soporte@sigaltda.cl
      </footer>
    </div>
  );
}
