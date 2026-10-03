import { useEffect, useState } from "react";

/** Valor que solo se actualiza tras `ms` sin cambios (evita una petición por pulsación). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
