import {
  Check,
  ChevronDown,
  LoaderCircle,
  type LucideIcon,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { SVGProps } from "react";

/**
 * Registro de iconos. Set provisional (Lucide) hasta tener el definitivo (DESIGN_SYSTEM §9):
 * cambiar de set = cambiar este mapa; ninguna pantalla importa `lucide-react` directamente.
 * Reglas del manual: rejilla 20/24 px, trazo 1,75, extremos redondeados, relleno solo en selección.
 */
const ICONS = {
  check: Check,
  "chevron-down": ChevronDown,
  loader: LoaderCircle,
  moon: Moon,
  plus: Plus,
  search: Search,
  sun: Sun,
  close: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  name: IconName;
  /** Tamaño en px; 16-18 en botones, 20/24 en navegación. */
  size?: number;
  /** Texto accesible. Sin `label` el icono es decorativo (`aria-hidden`). */
  label?: string;
}

export function Icon({ name, size = 18, label, ...rest }: IconProps) {
  const Component = ICONS[name];
  return (
    <Component
      width={size}
      height={size}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      {...rest}
    />
  );
}
