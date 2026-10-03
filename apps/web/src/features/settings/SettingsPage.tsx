import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_MIN_LENGTH, type SessionResponse } from "@nexo/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { qk, useCan, useMe, useTenant } from "../../shared/api/queries";
import { useAuthStore } from "../../shared/auth/authStore";
import { PasswordInput } from "../../shared/ui/PasswordInput";

const CURRENCIES = ["EUR", "USD", "GBP"];
const TIMEZONES = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Mexico_City",
];
const LOCALES = ["es-ES", "en-GB"] as const;

function TenantForm() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation();
  const tenant = useTenant();
  const canManage = useCan("tenancy:settings:manage");
  const queryClient = useQueryClient();
  const toast = useToast();

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, tc("errors:validation.failed")).max(120),
        locale: z.enum(LOCALES),
        timezone: z.string().min(3),
        currency: z.string().length(3),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const data = tenant.data;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    ...(data
      ? {
          values: {
            name: data.name,
            locale: (data.locale as (typeof LOCALES)[number]) ?? "es-ES",
            timezone: data.timezone,
            currency: data.currency,
          },
        }
      : {}),
  });

  const save = useMutation({
    mutationFn: (v: Values) => api("/tenant", { method: "PATCH", body: v }),
    onSuccess: async () => {
      toast.show(t("tenant.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.tenant }),
        queryClient.invalidateQueries({ queryKey: qk.me }),
      ]);
    },
  });

  if (tenant.isLoading || !data) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader title={t("tenant.title")} description={t("tenant.description")} />
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex max-w-xl flex-col gap-4"
      >
        {!canManage ? <Alert tone="info">{t("tenant.readOnly")}</Alert> : null}
        {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
        <Field label={t("tenant.name")} error={form.formState.errors.name?.message} required>
          {(p) => <Input disabled={!canManage} {...p} {...form.register("name")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tenant.locale")}>
            {(p) => (
              <Select disabled={!canManage} {...p} {...form.register("locale")}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {t(`locales.${l}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("tenant.currency")}>
            {(p) => (
              <Select disabled={!canManage} {...p} {...form.register("currency")}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("tenant.timezone")}>
          {(p) => (
            <Select disabled={!canManage} {...p} {...form.register("timezone")}>
              {TIMEZONES.includes(data.timezone) ? null : (
                <option value={data.timezone}>{data.timezone}</option>
              )}
              {TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canManage ? (
          <div>
            <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
              {tc("actions.save")}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function PasswordForm() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const schema = useMemo(
    () =>
      z.object({
        currentPassword: z.string().min(1, tc("errors:validation.failed")),
        newPassword: z.string().min(PASSWORD_MIN_LENGTH, tc("errors:password.too_short")),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const change = useMutation({
    mutationFn: (v: Values) =>
      api<SessionResponse>("/auth/change-password", { method: "POST", body: v }),
    onSuccess: (session) => {
      useAuthStore.getState().setTenant(session);
      toast.show(t("password.saved"));
      form.reset();
    },
  });

  return (
    <Card>
      <CardHeader title={t("password.title")} description={t("password.description")} />
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => change.mutate(v))}
        className="flex max-w-xl flex-col gap-4"
      >
        {change.isError ? <Alert tone="error">{errorMessage(tc, change.error)}</Alert> : null}
        <Field
          label={t("password.current")}
          error={form.formState.errors.currentPassword?.message}
          required
        >
          {(p) => (
            <PasswordInput
              autoComplete="current-password"
              {...p}
              {...form.register("currentPassword")}
            />
          )}
        </Field>
        <Field
          label={t("password.next")}
          hint={t("password.hint")}
          error={form.formState.errors.newPassword?.message}
          required
        >
          {(p) => (
            <PasswordInput autoComplete="new-password" {...p} {...form.register("newPassword")} />
          )}
        </Field>
        <div>
          <Button type="submit" loading={change.isPending}>
            {t("password.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation();
  const { data: me } = useMe();
  const tenant = useTenant();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-10 font-bold">{t("title")}</h1>
        <p className="text-secondary mt-1 text-base">{t("subtitle")}</p>
      </div>

      <TenantForm />

      <Card>
        <CardHeader title={t("account.title")} description={t("account.description")} />
        <dl className="grid max-w-xl gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-secondary">{t("account.name")}</dt>
            <dd className="font-medium">{me?.user.fullName}</dd>
          </div>
          <div>
            <dt className="text-secondary">{t("account.email")}</dt>
            <dd className="font-medium break-all">{me?.user.email}</dd>
            <dd className="mt-1">
              <Badge tone={me?.user.emailVerified ? "success" : "warning"}>
                {me?.user.emailVerified ? t("account.verified") : t("account.unverified")}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <PasswordForm />

      <Card>
        <CardHeader title={t("plan.title")} description={t("plan.description")} />
        <dl className="mb-3 grid max-w-xl gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-secondary">{t("plan.status")}</dt>
            <dd className="font-medium">
              {tenant.data ? tc(`status.${tenant.data.effectiveStatus}`) : "…"}
            </dd>
          </div>
          {tenant.data?.trialEndsAt ? (
            <div>
              <dt className="text-secondary">{t("plan.trialEnds")}</dt>
              <dd className="font-medium">
                {new Date(tenant.data.trialEndsAt).toLocaleDateString(tenant.data.locale, {
                  dateStyle: "long",
                })}
              </dd>
            </div>
          ) : null}
        </dl>
        <Alert tone="info">{t("plan.comingSoon")}</Alert>
      </Card>
    </div>
  );
}
