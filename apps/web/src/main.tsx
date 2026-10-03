import { ToastProvider } from "@nexo/ui";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import "./index.css";
import { i18n } from "./app/i18n";
import { router } from "./app/router";
import { ApiError } from "./shared/api/client";
import { useAuthStore } from "./shared/auth/authStore";
import { applyTheme, useTheme } from "./shared/theme";

applyTheme(useTheme.getState().theme);

/**
 * Sesión inválida en cualquier consulta (401 que el refresh no pudo resolver) → se limpia y se va al
 * login. El cliente ya intentó renovar el token caducado antes de llegar aquí.
 */
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!(error instanceof ApiError) || error.status !== 401) return;
      const isAdmin = query.queryKey[0] === "admin";
      if (isAdmin) {
        useAuthStore.getState().clearAdmin();
        void router.navigate({ to: "/admin/login" });
      } else {
        useAuthStore.getState().clearTenant();
        void router.navigate({ to: "/login" });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
