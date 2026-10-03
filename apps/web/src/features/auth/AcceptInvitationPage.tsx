import { zodResolver } from "@hookform/resolvers/zod";
import { type AcceptInvitationResponse, PASSWORD_MIN_LENGTH } from "@nexo/contracts";
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
import { AuthShell } from "../../shared/ui/AuthShell";
import { PasswordInput } from "../../shared/ui/PasswordInput";

/**
 * Aceptar invitación. Si el email no tenía cuenta se crea aquí y se entra directamente; si ya la tenía,
 * la invitación queda aceptada pero hay que iniciar sesión (no se concede sesión solo por el enlace).
 */
export function AcceptInvitationPage({ token }: { token: string | undefined }) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();

  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(2, t("validation.required")),
        password: z.string().min(PASSWORD_MIN_LENGTH, t("validation.passwordShort")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", password: "" },
  });

  const accept = useMutation({
    mutationFn: (v: Values | null) =>
      api<AcceptInvitationResponse>("/auth/accept-invitation", {
        method: "POST",
        scope: "none",
        body: { token, ...(v ?? {}) },
      }),
    onSuccess: (res) => {
      if (res.kind === "session") {
        useAuthStore.getState().setTenant(res);
        void navigate({ to: "/" });
      }
    },
  });

  const toLogin = (
    <Link
      to="/login"
      className="text-action-primary font-medium underline-offset-2 hover:underline"
    >
      {t("invite.login")}
    </Link>
  );

  if (!token) {
    return (
      <AuthShell title={t("invite.title")} footer={toLogin}>
        <Alert tone="error">{t("invite.missingToken")}</Alert>
      </AuthShell>
    );
  }
  if (accept.data?.kind === "accepted") {
    return (
      <AuthShell title={t("invite.acceptedTitle")} footer={toLogin}>
        <Alert tone="success">{t("invite.accepted")}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("invite.title")} subtitle={t("invite.subtitle")}>
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => accept.mutate(v))}
        className="flex flex-col gap-4"
      >
        {accept.isError ? <Alert tone="error">{errorMessage(tc, accept.error)}</Alert> : null}
        <Field
          label={t("invite.fullName")}
          error={form.formState.errors.fullName?.message}
          required
        >
          {(p) => <Input autoComplete="name" autoFocus {...p} {...form.register("fullName")} />}
        </Field>
        <Field
          label={t("invite.password")}
          hint={t("signup.passwordHint")}
          error={form.formState.errors.password?.message}
          required
        >
          {(p) => (
            <PasswordInput autoComplete="new-password" {...p} {...form.register("password")} />
          )}
        </Field>
        <Button type="submit" loading={accept.isPending} className="w-full">
          {t("invite.submit")}
        </Button>
        {/* Quien ya tiene cuenta no necesita rellenar nada: basta con aceptar. */}
        <Button type="button" variant="ghost" onClick={() => accept.mutate(null)}>
          {t("invite.existing")}
        </Button>
      </form>
    </AuthShell>
  );
}
