import { Alert, Spinner } from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { qk } from "../../shared/api/queries";
import { AuthShell } from "../../shared/ui/AuthShell";

/** Confirma el email al abrir el enlace. El `ref` evita el doble envío del modo estricto de React. */
export function VerifyEmailPage({ token }: { token: string | undefined }) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const queryClient = useQueryClient();
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: () =>
      api<void>("/auth/verify-email", { method: "POST", scope: "none", body: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.me }),
  });

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate();
    }
  }, [token, verify.mutate]);

  const goHome = (
    <Link to="/" className="text-action-primary font-medium underline-offset-2 hover:underline">
      {t("verify.goHome")}
    </Link>
  );

  if (!token || verify.isError) {
    return (
      <AuthShell title={t("verify.failTitle")} footer={goHome}>
        <Alert tone="error">
          {token ? errorMessage(tc, verify.error) : t("reset.missingToken")}
        </Alert>
      </AuthShell>
    );
  }
  if (verify.isSuccess) {
    return (
      <AuthShell title={t("verify.okTitle")} footer={goHome}>
        <Alert tone="success">{t("verify.ok")}</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("verify.verifying")}>
      <Spinner label={tc("state.loading")} />
    </AuthShell>
  );
}
