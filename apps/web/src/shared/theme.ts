import { create } from "zustand";

export type ThemeChoice = "light" | "dark";
const STORAGE_KEY = "nexo.theme";

/** `localStorage` puede lanzar (modo privado, datos bloqueados): la app debe funcionar sin él. */
function readStored(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): ThemeChoice {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: ThemeChoice): void {
  document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  theme: ThemeChoice;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: readStored() ?? systemTheme(),
  toggle: () => {
    const next: ThemeChoice = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin persistencia: el tema sigue aplicado en esta sesión */
    }
    set({ theme: next });
  },
}));
