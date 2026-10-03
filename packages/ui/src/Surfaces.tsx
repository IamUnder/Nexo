import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/** Card: agrupa información, no sustituye la estructura de página. Borde 1 px, radio 12 px (DESIGN_SYSTEM §7.3). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-line bg-surface p-5 text-primary", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg leading-[26px] font-semibold">{title}</h2>
        {description ? <p className="text-secondary mt-0.5 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

const BADGE: Record<BadgeTone, { cls: string; icon: IconName }> = {
  neutral: { cls: "bg-surface-hover text-secondary", icon: "info" },
  info: { cls: "bg-info-bg text-info", icon: "info" },
  success: { cls: "bg-success-bg text-success", icon: "check-circle" },
  warning: { cls: "bg-warning-bg text-warning", icon: "warning" },
  error: { cls: "bg-error-bg text-error", icon: "alert" },
};

/** Badge de estado: SIEMPRE icono + texto + color (el color nunca es el único portador de significado). */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const t = BADGE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium",
        t.cls,
      )}
    >
      <Icon name={t.icon} size={12} />
      {children}
    </span>
  );
}

export type AlertTone = "info" | "success" | "warning" | "error";

const ALERT: Record<AlertTone, { cls: string; icon: IconName }> = {
  info: { cls: "bg-info-bg text-info border-info", icon: "info" },
  success: { cls: "bg-success-bg text-success border-success", icon: "check-circle" },
  warning: { cls: "bg-warning-bg text-warning border-warning", icon: "warning" },
  error: { cls: "bg-error-bg text-error border-error", icon: "alert" },
};

export function Alert({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: AlertTone;
  title?: string | undefined;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string | undefined;
}) {
  const t = ALERT[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-card border p-3 text-sm", t.cls, className)}
    >
      <Icon name={t.icon} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="text-secondary inline-flex items-center gap-2 text-sm">
      <Icon name="loader" className="animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </span>
  );
}

/** Skeleton: se muestra a partir de 400 ms de espera (el consumidor decide cuándo). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-control bg-surface-hover motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Estado vacío: explicación + acción (nunca una tabla en blanco sin guía; DESIGN_SYSTEM §7.7). */
export function EmptyState({
  icon = "info",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="bg-selection text-action-primary flex size-12 items-center justify-center rounded-full">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        {description ? (
          <p className="text-secondary mx-auto mt-1 max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className="bg-selection text-action-primary inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
    >
      {initials || "?"}
    </span>
  );
}
