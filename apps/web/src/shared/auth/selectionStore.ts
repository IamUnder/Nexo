import type { TenantSummary } from "@nexo/contracts";
import { create } from "zustand";

/**
 * Elección de empresa tras un login con varias membresías (ARCHITECTURE §6, modo `session`).
 * El token de selección vive solo en memoria y caduca a los 5 minutos en el servidor.
 */
interface SelectionState {
  selectionToken: string | null;
  tenants: TenantSummary[];
  set(selectionToken: string, tenants: TenantSummary[]): void;
  clear(): void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectionToken: null,
  tenants: [],
  set: (selectionToken, tenants) => set({ selectionToken, tenants }),
  clear: () => set({ selectionToken: null, tenants: [] }),
}));
