import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginResponse } from "@nexo/contracts";
import { Alert, Button, Field, Input } from "@nexo/ui";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useAuthStore } from "../../shared/auth/authStore";
import { useSelectionStore } from "../../shared/auth/selectionStore";
import { AuthShell } from "../../shared/ui/AuthShell";
import { PasswordInput } from "../../shared/ui/PasswordInput";

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("validation.required")).email(t("validation.email")),
        password: z.string().min(1, t("validation.required")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: Values) =>
      api<LoginResponse>("/auth/login", { method: "POST", body: values, scope: "none" }),
    onSuccess: (res) => {
      if (res.kind === "session") {
        useAuthStore.getState().setTenant(res);
        void navigate({ to: "/" });
      } else {
        useSelectionStore.getState().set(res.selectionToken, res.tenants);
        void navigate({ to: "/select-tenant" });
      }
    },
  });

  return (
    <AuthShell
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link
            to="/signup"
            className="text-action-primary font-medium underline-offset-2 hover:underline"
          >
            {t("login.signupCta")}
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => login.mutate(v))}
        className="flex flex-col gap-4"
      >
        {login.isError ? <Alert tone="error">{errorMessage(tc, login.error)}</Alert> : null}
        <Field label={t("login.email")} error={form.formState.errors.email?.message} required>
          {(p) => (
            <Input
              type="email"
              autoComplete="username"
              autoFocus
              {...p}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field label={t("login.password")} error={form.formState.errors.password?.message} required>
          {(p) => (
            <PasswordInput autoComplete="current-password" {...p} {...form.register("password")} />
          )}
        </Field>
        <Button type="submit" loading={login.isPending} className="w-full">
          {t("login.submit")}
        </Button>
        <Link
          to="/forgot-password"
          className="text-secondary text-center text-sm underline-offset-2 hover:underline"
        >
          {t("login.forgot")}
        </Link>
      </form>
    </AuthShell>
  );
}
