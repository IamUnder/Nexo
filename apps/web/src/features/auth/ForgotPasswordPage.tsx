import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, Input } from "@nexo/ui";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { AuthShell } from "../../shared/ui/AuthShell";

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t("validation.required")).email(t("validation.email")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const forgot = useMutation({
    mutationFn: (v: Values) =>
      api<void>("/auth/forgot-password", { method: "POST", body: v, scope: "none" }),
  });

  const back = (
    <Link
      to="/login"
      className="text-action-primary font-medium underline-offset-2 hover:underline"
    >
      {t("forgot.back")}
    </Link>
  );

  if (forgot.isSuccess) {
    return (
      <AuthShell title={t("forgot.sentTitle")} footer={back}>
        <Alert tone="success">{t("forgot.sent")}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("forgot.title")} subtitle={t("forgot.subtitle")} footer={back}>
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => forgot.mutate(v))}
        className="flex flex-col gap-4"
      >
        {forgot.isError ? <Alert tone="error">{errorMessage(tc, forgot.error)}</Alert> : null}
        <Field label={t("forgot.email")} error={form.formState.errors.email?.message} required>
          {(p) => (
            <Input type="email" autoComplete="email" autoFocus {...p} {...form.register("email")} />
          )}
        </Field>
        <Button type="submit" loading={forgot.isPending} className="w-full">
          {t("forgot.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
