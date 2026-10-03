import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Tabla de datos (DESIGN_SYSTEM §7.4): sin líneas verticales, cifras a la derecha, cabecera fija en
 * scroll. En móvil el contenedor hace scroll horizontal; las pantallas con muchos datos ofrecen además
 * una vista de tarjetas (`md:hidden` / `hidden md:block`).
 */
export function Table({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table
        aria-label={label}
        className={cn("w-full border-collapse text-left text-sm", className)}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface text-secondary sticky top-0 text-xs uppercase tracking-wide">
      {children}
    </thead>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("border-b border-line px-4 py-2.5 font-medium", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-divider last:border-b-0 hover:bg-surface-hover", className)}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("px-4 py-3 align-middle", numeric && "tabular text-right", className)}
      {...props}
    />
  );
}
