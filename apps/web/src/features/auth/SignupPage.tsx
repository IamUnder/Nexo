import { zodResolver } from "@hookform/resolvers/zod";
import { PASSWORD_MIN_LENGTH, type SessionResponse } from "@nexo/contracts";
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

export function SignupPage() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();

  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(2, t("validation.required")),
        companyName: z.string().trim().min(2, t("validation.required")),
        email: z.string().trim().min(1, t("validation.required")).email(t("validation.email")),
        password: z.string().min(PASSWORD_MIN_LENGTH, t("validation.passwordShort")),
        acceptTerms: z.boolean().refine((v) => v, t("validation.terms")),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", companyName: "", email: "", password: "", acceptTerms: false },
  });

  const signup = useMutation({
    mutationFn: (v: Values) =>
      api<SessionResponse>("/signup", {
        method: "POST",
        scope: "none",
        body: { ...v, countryCode: "ES", templateKey: "professional_services", acceptTerms: true },
      }),
    onSuccess: (res) => {
      useAuthStore.getState().setTenant(res);
      void navigate({ to: "/" });
    },
  });

  const errors = form.formState.errors;
  return (
    <AuthShell
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={
        <>
          {t("signup.hasAccount")}{" "}
          <Link
            to="/login"
            className="text-action-primary font-medium underline-offset-2 hover:underline"
          >
            {t("signup.loginCta")}
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => signup.mutate(v))}
        className="flex flex-col gap-4"
      >
        {signup.isError ? <Alert tone="error">{errorMessage(tc, signup.error)}</Alert> : null}
        <Field label={t("signup.fullName")} error={errors.fullName?.message} required>
          {(p) => <Input autoComplete="name" autoFocus {...p} {...form.register("fullName")} />}
        </Field>
        <Field label={t("signup.company")} error={errors.companyName?.message} required>
          {(p) => <Input autoComplete="organization" {...p} {...form.register("companyName")} />}
        </Field>
        <Field label={t("signup.email")} error={errors.email?.message} required>
          {(p) => <Input type="email" autoComplete="email" {...p} {...form.register("email")} />}
        </Field>
        <Field
          label={t("signup.password")}
          hint={t("signup.passwordHint")}
          error={errors.password?.message}
          required
        >
          {(p) => (
            <PasswordInput autoComplete="new-password" {...p} {...form.register("password")} />
          )}
        </Field>
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--nexo-color-action-primary-bg)]"
              aria-invalid={errors.acceptTerms ? true : undefined}
              {...form.register("acceptTerms")}
            />
            <span>{t("signup.terms")}</span>
          </label>
          {errors.acceptTerms ? (
            <p role="alert" className="text-error mt-1 text-xs">
              {errors.acceptTerms.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" loading={signup.isPending} className="w-full">
          {t("signup.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
