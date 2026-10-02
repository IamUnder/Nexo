import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Una sola acción primaria por panel (DESIGN_SYSTEM §7.1). */
  variant?: ButtonVariant;
  /** Conserva ancho y etiqueta accesible mientras carga; ignora clics. */
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary text-action-primary-fg hover:bg-action-primary-hover active:bg-action-primary-active disabled:bg-action-primary-disabled disabled:text-muted",
  secondary:
    "border border-line bg-surface text-primary hover:bg-surface-hover disabled:text-muted",
  ghost: "bg-transparent text-primary hover:bg-surface-hover disabled:text-muted",
};

/**
 * Botón estándar: altura 40 px, radio 10 px, foco visible 2 px + offset 2 px (DESIGN_SYSTEM §4, §7.1).
 * Solo consume tokens semánticos; nunca HEX.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={inactive || undefined}
      disabled={disabled}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn(
        "relative inline-flex h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium",
        "transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed motion-reduce:transition-none",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {/* La etiqueta se mantiene (invisible) para no cambiar el ancho del botón al cargar. */}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Icon name="loader" className="animate-spin motion-reduce:animate-none" />
        </span>
      ) : null}
    </button>
  );
}
