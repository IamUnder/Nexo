import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, type AlertTone } from "./Surfaces";

interface ToastItem {
  id: number;
  tone: AlertTone;
  message: string;
}

interface ToastApi {
  show(message: string, tone?: AlertTone): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Notificaciones breves de confirmación. Se anuncian a lectores de pantalla (`role=status`/`alert` del
 * Alert) y desaparecen solas a los 5 s; los errores persisten algo más (8 s).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: AlertTone = "success") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(
      () => setItems((prev) => prev.filter((t) => t.id !== id)),
      tone === "error" ? 8000 : 5000,
    );
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96">
        {items.map((t) => (
          <Alert key={t.id} tone={t.tone} className="pointer-events-auto w-full shadow-elevation-2">
            {t.message}
          </Alert>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
