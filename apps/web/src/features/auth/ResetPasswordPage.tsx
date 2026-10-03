import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_MIN_LENGTH } from "@nexo/contracts";
import { Alert, Button, Field } from "@nexo/ui";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { AuthShell } from "../../shared/ui/AuthShell";
import { PasswordInput } from "../../shared/ui/PasswordInput";

/** Sirve para recuperar la contraseña y para el primer acceso de un propietario dado de alta a mano (`welcome`). */
export function ResetPasswordPage({
  token,
  welcome,
}: {
  token: string | undefined;
  welcome: boolean;
}) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const schema = useMemo(
    () =>
      z.object({ password: z.string().min(PASSWORD_MIN_LENGTH, t("validation.passwordShort")) }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const reset = useMutation({
    mutationFn: (v: Values) =>
      api<void>("/auth/reset-password", {
        method: "POST",
        scope: "none",
        body: { token, password: v.password },
      }),
  });

  const toLogin = (
    <Link
      to="/login"
      className="text-action-primary font-medium underline-offset-2 hover:underline"
    >
      {t("login.submit")}
    </Link>
  );

  if (!token) {
    return (
      <AuthShell title={t("reset.title")} footer={toLogin}>
        <Alert tone="error">{t("reset.missingToken")}</Alert>
      </AuthShell>
    );
  }
  if (reset.isSuccess) {
    return (
      <AuthShell title={t("reset.doneTitle")} footer={toLogin}>
        <Alert tone="success">{t("reset.done")}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={welcome ? t("reset.welcomeTitle") : t("reset.title")}
      subtitle={welcome ? t("reset.welcomeSubtitle") : undefined}
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => reset.mutate(v))}
        className="flex flex-col gap-4"
      >
        {reset.isError ? <Alert tone="error">{errorMessage(tc, reset.error)}</Alert> : null}
        <Field
          label={t("reset.password")}
          hint={t("signup.passwordHint")}
          error={form.formState.errors.password?.message}
          required
        >
          {(p) => (
            <PasswordInput
              autoComplete="new-password"
              autoFocus
              {...p}
              {...form.register("password")}
            />
          )}
        </Field>
        <Button type="submit" loading={reset.isPending} className="w-full">
          {t("reset.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
