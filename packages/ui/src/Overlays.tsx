import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * Diálogo modal accesible (Radix): foco atrapado, Esc cierra, devuelve el foco al disparador.
 * Radio 16 px (modal) y entrada de 240 ms; con `prefers-reduced-motion` no hay animación.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children?: ReactNode;
  /** Texto accesible del botón de cierre (traducido por el consumidor). */
  closeLabel: string;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 motion-safe:animate-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-modal border border-line bg-surface-raised p-6 text-primary shadow-elevation-2",
            "max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none",
          )}
        >
          <DialogPrimitive.Title className="font-display text-lg font-semibold">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-secondary mt-1 text-sm">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-4">{children}</div>
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="text-secondary absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-control outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Icon name="close" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: Parameters<typeof Icon>[0]["name"];
  onSelect: () => void;
  danger?: boolean;
}

/** Menú desplegable accesible (Radix): navegación por flechas, tipeo y Esc. */
export function Menu({
  trigger,
  items,
  align = "end",
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-card border border-line bg-surface-raised p-1 shadow-elevation-2"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.key}
              onSelect={item.onSelect}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm outline-none",
                "data-[highlighted]:bg-surface-hover",
                item.danger ? "text-error" : "text-primary",
              )}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : null}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

/** Pestañas accesibles (Radix). El estado activo combina tinte, indicador y peso (DESIGN_SYSTEM §7.5). */
export function Tabs({
  items,
  value,
  onValueChange,
  label,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  label: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List
        aria-label={label}
        className="mb-5 flex gap-1 overflow-x-auto border-b border-divider"
      >
        {items.map((i) => (
          <TabsPrimitive.Trigger
            key={i.value}
            value={i.value}
            className={cn(
              "relative -mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm text-secondary outline-none",
              "hover:text-primary focus-visible:outline-2 focus-visible:outline-focus",
              "data-[state=active]:border-action-primary data-[state=active]:font-semibold data-[state=active]:text-primary",
            )}
          >
            {i.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((i) => (
        <TabsPrimitive.Content key={i.value} value={i.value} className="outline-none">
          {i.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
