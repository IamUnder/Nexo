import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AdminAuditPage } from "../features/admin/AdminAuditPage";
import { AdminLoginPage } from "../features/admin/AdminLoginPage";
import { AdminTenantsPage } from "../features/admin/AdminTenantsPage";
import { AuditPage } from "../features/audit/AuditPage";
import { AcceptInvitationPage } from "../features/auth/AcceptInvitationPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { LoginPage } from "../features/auth/LoginPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { SelectTenantPage } from "../features/auth/SelectTenantPage";
import { SignupPage } from "../features/auth/SignupPage";
import { VerifyEmailPage } from "../features/auth/VerifyEmailPage";
import { AccountDetailPage } from "../features/crm/AccountDetailPage";
import { AccountsPage } from "../features/crm/AccountsPage";
import { ContactsPage } from "../features/crm/ContactsPage";
import { DealDetailPage } from "../features/crm/DealDetailPage";
import { DealsPage } from "../features/crm/DealsPage";
import { PipelineEditorPage } from "../features/crm/PipelineEditorPage";
import { TasksPage } from "../features/crm/TasksPage";
import { ProjectDetailPage } from "../features/delivery/ProjectDetailPage";
import { AccountProjects, ProjectsPage } from "../features/delivery/ProjectsPage";
import { HomePage } from "../features/home/HomePage";
import { ImportPage } from "../features/import/ImportPage";
import { SalesPanel } from "../features/insights/SalesPanel";
import { OnboardingChecklist } from "../features/onboarding/OnboardingChecklist";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TeamPage } from "../features/team/TeamPage";
import { useAuthStore } from "../shared/auth/authStore";
import { ensureBootstrapped } from "../shared/auth/bootstrap";
import { AdminLayout } from "./AdminLayout";
import { AppLayout } from "./AppLayout";
import { NotFoundPage } from "./NotFoundPage";

/**
 * Rutas de la app. Este es el ÚNICO sitio que conoce a todas las features (ARCHITECTURE §13.3).
 * Las rutas privadas esperan a que se restaure la sesión (cookie de refresh) y, si no hay, redirigen
 * al login. La navegación visible depende de permisos; la API sigue siendo quien impone.
 */
const rootRoute = createRootRoute({ component: () => <Outlet />, notFoundComponent: NotFoundPage });

// ── Rutas públicas (si ya hay sesión, se va al inicio) ─────────────────────────────────────────
async function publicOnly() {
  await ensureBootstrapped("tenant");
  if (useAuthStore.getState().tenant.status === "authenticated") throw redirect({ to: "/" });
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: publicOnly,
  component: LoginPage,
});
const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  beforeLoad: publicOnly,
  component: SignupPage,
});
const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  beforeLoad: publicOnly,
  component: ForgotPasswordPage,
});
const selectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/select-tenant",
  component: SelectTenantPage,
});

// Enlaces de correo: funcionan con o sin sesión.
const tokenSearch = (s: Record<string, unknown>) => ({
  token: typeof s.token === "string" ? s.token : undefined,
  welcome: s.welcome === "1" || s.welcome === 1 || s.welcome === true,
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  validateSearch: tokenSearch,
  component: function ResetRoute() {
    const { token, welcome } = resetRoute.useSearch();
    return <ResetPasswordPage token={token} welcome={welcome} />;
  },
});
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  validateSearch: tokenSearch,
  component: function VerifyRoute() {
    return <VerifyEmailPage token={verifyRoute.useSearch().token} />;
  },
});
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/accept-invitation",
  validateSearch: tokenSearch,
  component: function InviteRoute() {
    return <AcceptInvitationPage token={inviteRoute.useSearch().token} />;
  },
});

// ── Aplicación (requiere sesión de tenant) ───────────────────────────────────────────────────
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: async () => {
    await ensureBootstrapped("tenant");
    if (useAuthStore.getState().tenant.status !== "authenticated") throw redirect({ to: "/login" });
  },
});
const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: () => (
    <HomePage
      panel={
        <>
          <OnboardingChecklist />
          <SalesPanel />
        </>
      }
    />
  ),
});
const teamRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/team",
  component: TeamPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: SettingsPage,
});
const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/audit",
  component: AuditPage,
});

const crmDealsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/deals",
  component: DealsPage,
});
const crmDealRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/deals/$dealId",
  component: DealDetailPage,
});
const crmAccountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/accounts",
  component: AccountsPage,
});
const crmAccountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/accounts/$accountId",
  component: function AccountRoute() {
    return <AccountDetailPage projectsSlot={(id) => <AccountProjects accountId={id} />} />;
  },
});
const crmContactsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/contacts",
  component: ContactsPage,
});
const crmPipelineRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/pipeline",
  component: PipelineEditorPage,
});
const crmTasksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/crm/tasks",
  component: TasksPage,
});

const importRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import",
  component: ImportPage,
});

const deliveryProjectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/delivery/projects",
  component: ProjectsPage,
});
const deliveryProjectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/delivery/projects/$projectId",
  component: ProjectDetailPage,
});

// ── Administración de Nexo (sesión de superadmin, independiente) ─────────────────────────────
const adminLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/login",
  component: AdminLoginPage,
  beforeLoad: async () => {
    await ensureBootstrapped("admin");
    if (useAuthStore.getState().admin.status === "authenticated") throw redirect({ to: "/admin" });
  },
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminLayout,
  beforeLoad: async () => {
    await ensureBootstrapped("admin");
    if (useAuthStore.getState().admin.status !== "authenticated")
      throw redirect({ to: "/admin/login" });
  },
});
const adminTenantsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: AdminTenantsPage,
});
const adminAuditRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/audit",
  component: AdminAuditPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  forgotRoute,
  selectRoute,
  resetRoute,
  verifyRoute,
  inviteRoute,
  appRoute.addChildren([
    homeRoute,
    crmDealsRoute,
    crmDealRoute,
    crmAccountsRoute,
    crmAccountRoute,
    crmContactsRoute,
    crmTasksRoute,
    crmPipelineRoute,
    importRoute,
    deliveryProjectsRoute,
    deliveryProjectRoute,
    teamRoute,
    settingsRoute,
    auditRoute,
  ]),
  adminLoginRoute,
  adminRoute.addChildren([adminTenantsRoute, adminAuditRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
