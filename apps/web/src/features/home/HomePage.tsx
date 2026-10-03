import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Skeleton,
} from "@nexo/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAudit, useMe, useMembers } from "../../shared/api/queries";

const STATUS_TONE: Record<string, BadgeTone> = {
  trial: "info",
  active: "success",
  past_due: "warning",
  suspended: "error",
  cancelled: "error",
  trial_expired: "error",
};

/** Inicio del hito 1: estado de la cuenta, primeros pasos y actividad reciente. */
export function HomePage() {
  const { t } = useTranslation("home");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("audit");
  const { data: me, isLoading } = useMe();
  const members = useMembers();
  const canAudit = me?.permissions.includes("audit:log:read") ?? false;
  const audit = useAudit(undefined, canAudit);

  if (isLoading || !me) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const trialEnds = me.tenant.trialEndsAt ? new Date(me.tenant.trialEndsAt) : null;
  const effective =
    me.tenant.status === "trial" && trialEnds && trialEnds.getTime() <= Date.now()
      ? "trial_expired"
      : me.tenant.status;
  const invitedAnyone = (members.data?.length ?? 1) > 1;
  const canInvite = me.permissions.includes("identity:member:manage");

  const steps = [
    {
      key: "verify",
      label: t("checklist.verify"),
      done: me.user.emailVerified,
      to: null as null | "/team" | "/settings",
    },
    {
      key: "invite",
      label: t("checklist.invite"),
      done: invitedAnyone,
      to: canInvite ? ("/team" as const) : null,
    },
    {
      key: "settings",
      label: t("checklist.settings"),
      done: false,
      to: me.permissions.includes("tenancy:settings:read") ? ("/settings" as const) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-10 font-bold">
          {t("title", { name: me.user.fullName.split(" ")[0] })}
        </h1>
        <p className="text-secondary mt-1 text-base">{t("subtitle", { tenant: me.tenant.name })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("welcome.title")} description={t("welcome.description")} />
          <h3 className="font-display mb-2 text-base font-semibold">{t("checklist.title")}</h3>
          <ul className="flex flex-col gap-2">
            {steps.map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between gap-3 rounded-control border border-divider p-3"
              >
                <span className="flex items-center gap-3 text-sm">
                  <Icon
                    name={s.done ? "check-circle" : "clock"}
                    className={s.done ? "text-success" : "text-secondary"}
                  />
                  <span className={s.done ? "text-secondary line-through" : undefined}>
                    {s.label}
                  </span>
                </span>
                {!s.done && s.to ? (
                  <Link to={s.to}>
                    <Button variant="secondary">{t("checklist.go")}</Button>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={t("account.title")} />
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-secondary">{t("account.company")}</dt>
              <dd className="font-medium">{me.tenant.name}</dd>
            </div>
            <div>
              <dt className="text-secondary">{t("account.role")}</dt>
              <dd className="font-medium">{tc(`role.${me.membership.role}`)}</dd>
            </div>
            <div>
              <dt className="text-secondary">{t("account.plan")}</dt>
              <dd>
                <Badge tone={STATUS_TONE[effective] ?? "neutral"}>
                  {tc(`status.${effective}`)}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {canAudit ? (
        <Card>
          <CardHeader
            title={t("activity.title")}
            actions={
              <Link
                to="/audit"
                className="text-action-primary text-sm font-medium underline-offset-2 hover:underline"
              >
                {t("activity.viewAll")}
              </Link>
            }
          />
          {audit.isLoading ? (
            <Skeleton className="h-24" />
          ) : audit.data && audit.data.items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-divider">
              {audit.data.items.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{ta(`actions.${e.action}`, { defaultValue: e.action })}</span>
                  <time className="text-secondary tabular text-xs" dateTime={e.occurredAt}>
                    {new Date(e.occurredAt).toLocaleString(me.tenant.locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="activity" title={t("activity.empty")} />
          )}
        </Card>
      ) : null}
    </div>
  );
}
