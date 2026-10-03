import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * Campo de formulario (DESIGN_SYSTEM §7.2): etiqueta PERSISTENTE (el placeholder nunca la sustituye),
 * ayuda contextual y error EXPLÍCITO con icono + texto, asociados al control con `aria-describedby`.
 */
export interface FieldProps {
  label: string;
  /** Texto de ayuda bajo el campo. */
  hint?: string | undefined;
  /** Mensaje de error ya traducido. Si existe, el campo se marca como inválido. */
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
    "aria-required": true | undefined;
  }) => ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* El asterisco de «obligatorio» es solo visual (CSS): el lector de pantalla ya lo anuncia por `aria-required`. */}
      <label
        htmlFor={id}
        className={cn(
          "text-primary text-sm font-medium",
          required && "after:text-secondary after:ml-0.5 after:content-['*']",
        )}
      >
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [errorId, hintId].filter(Boolean).join(" ") || undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint && !error ? (
        <p id={hintId} className="text-secondary text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-error flex items-center gap-1.5 text-xs">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-primary " +
  "placeholder:text-muted outline-none transition-colors duration-[120ms] " +
  "hover:border-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-error";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(CONTROL, "h-auto min-h-24 py-2", className)} {...props} />
  );
});

/** `<select>` nativo estilizado: accesible por defecto y con buen soporte móvil. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL, "pr-8", className)} {...props}>
        {children}
      </select>
    );
  },
);
