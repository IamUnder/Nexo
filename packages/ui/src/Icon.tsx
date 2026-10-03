import {
  Activity,
  Ban,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  House,
  Info,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Lock,
  LogOut,
  type LucideIcon,
  Mail,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import type { SVGProps } from "react";

/**
 * Registro de iconos. Set provisional (Lucide) hasta tener el definitivo (DESIGN_SYSTEM §9):
 * cambiar de set = cambiar este mapa; ninguna pantalla importa `lucide-react` directamente.
 * Reglas del manual: rejilla 20/24 px, trazo 1,75, extremos redondeados, relleno solo en selección.
 */
const ICONS = {
  activity: Activity,
  alert: CircleAlert,
  ban: Ban,
  briefcase: Briefcase,
  building: Building2,
  check: Check,
  "check-circle": CircleCheck,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  clock: Clock,
  close: X,
  copy: Copy,
  edit: Pencil,
  eye: Eye,
  "eye-off": EyeOff,
  file: FileText,
  home: House,
  info: Info,
  key: KeyRound,
  loader: LoaderCircle,
  tasks: ListChecks,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  menu: Menu,
  moon: Moon,
  more: Ellipsis,
  plus: Plus,
  refresh: RefreshCw,
  scroll: ScrollText,
  search: Search,
  settings: Settings,
  shield: Shield,
  "shield-check": ShieldCheck,
  sun: Sun,
  trash: Trash2,
  warning: TriangleAlert,
  upload: Upload,
  user: User,
  users: Users,
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
