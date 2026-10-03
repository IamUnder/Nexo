import { zodResolver } from "@hookform/resolvers/zod";
import type { AdminSessionResponse } from "@nexo/contracts";
import { Alert, Button, Field, Input } from "@nexo/ui";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useAuthStore } from "../../shared/auth/authStore";
import { AuthShell } from "../../shared/ui/AuthShell";
import { PasswordInput } from "../../shared/ui/PasswordInput";

export function AdminLoginPage() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const navigate = useNavigate();
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, ta("validation.required")).email(ta("validation.email")),
        password: z.string().min(1, ta("validation.required")),
      }),
    [ta],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const login = useMutation({
    mutationFn: (v: Values) =>
      api<AdminSessionResponse>("/admin/auth/login", { method: "POST", body: v, scope: "none" }),
    onSuccess: (res) => {
      useAuthStore.getState().setAdmin(res);
      void navigate({ to: "/admin" });
    },
  });

  return (
    <AuthShell title={t("login.title")} subtitle={t("login.subtitle")}>
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
      </form>
    </AuthShell>
  );
}
