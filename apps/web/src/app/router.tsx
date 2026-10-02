import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { HomePage } from "./HomePage";

/**
 * Rutas de la app. Las rutas de cada feature se registran desde `app/` (único sitio que conoce a todas
 * las features, ARCHITECTURE §13.3). La navegación visible depende de módulos contratados y permisos.
 */
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });

const routeTree = rootRoute.addChildren([homeRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
