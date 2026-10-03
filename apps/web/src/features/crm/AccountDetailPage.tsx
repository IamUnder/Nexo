import { Alert, Badge, Button, Card, CardHeader, Skeleton, useToast } from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan } from "../../shared/api/queries";
import { crm, useAccount, useAccountDeals, useContacts } from "./api";
import {
  AccountDialog,
  ActivityTimeline,
  ContactDialog,
  DealDialog,
  STATUS_TONE,
  useFormatters,
} from "./components";

export function AccountDetailPage() {
  const { accountId } = useParams({ strict: false }) as { accountId: string };
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const fmt = useFormatters();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const canUpdate = useCan("crm:account:update");
  const canDelete = useCan("crm:account:delete");
  const canContact = useCan("crm:contact:create");
  const canDeal = useCan("crm:deal:create");
  const canActivity = useCan("crm:activity:create");
  const account = useAccount(accountId);
  const contacts = useContacts("", accountId);
  const deals = useAccountDeals(accountId);
  const [editing, setEditing] = useState(false);
  const [addContact, setAddContact] = useState(false);
  const [addDeal, setAddDeal] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/crm/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.show(t("accounts.deleted"));
      await qc.invalidateQueries({ queryKey: crm.all });
      void navigate({ to: "/crm/accounts" });
    },
  });

  if (account.isLoading) return <Skeleton className="h-64" />;
  if (account.isError || !account.data) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error">{t("accounts.detail.notFound")}</Alert>
        <Link to="/crm/accounts" className="text-action-primary underline">
          {t("accounts.detail.back")}
        </Link>
      </div>
    );
  }
  const a = account.data;
  const contactItems = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  const rows: Array<[string, string | null]> = [
    [t("accounts.form.legalName"), a.legalName],
    [t("accounts.form.taxId"), a.taxId],
    [t("accounts.form.domain"), a.domain],
    [t("accounts.form.industry"), a.industry],
    [t("accounts.form.phone"), a.phone],
    [t("accounts.col.owner"), a.ownerName],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/crm/accounts"
        className="text-secondary text-sm underline-offset-2 hover:underline"
      >
        ← {t("accounts.detail.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold">{a.name}</h1>
          <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
            {t(`accounts.status.${a.status}`, { defaultValue: a.status })}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDeal ? (
            <Button onClick={() => setAddDeal(true)}>{t("accounts.detail.newDeal")}</Button>
          ) : null}
          {canUpdate ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("accounts.detail.edit")}
            </Button>
          ) : null}
        </div>
      </header>

      {remove.isError ? <Alert tone="error">{errorMessage(tc, remove.error)}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t("accounts.detail.info")} />
            <dl className="grid grid-cols-2 gap-4">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-secondary text-xs uppercase tracking-wide">{label}</dt>
                  <dd className="mt-0.5 text-sm">{value || t("common.noValue")}</dd>
                </div>
              ))}
            </dl>
            {a.notes ? (
              <p className="text-secondary mt-4 whitespace-pre-wrap text-sm">{a.notes}</p>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title={t("accounts.detail.deals")}
              actions={
                a.openDealsCount > 0 ? (
                  <Badge tone="info">{fmt.money(a.openDealsAmountCents)}</Badge>
                ) : undefined
              }
            />
            {deals.data?.length === 0 ? (
              <p className="text-secondary text-sm">{t("accounts.detail.noDeals")}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {deals.data?.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    to="/crm/deals/$dealId"
                    params={{ dealId: d.id }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {d.name}
                  </Link>
                  <span className="text-secondary flex items-center gap-2">
                    {fmt.money(d.amountCents, d.currency)}
                    <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.stageName}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title={t("accounts.detail.contacts")}
              actions={
                canContact ? (
                  <Button variant="secondary" onClick={() => setAddContact(true)}>
                    {t("accounts.detail.addContact")}
                  </Button>
                ) : undefined
              }
            />
            {contacts.data && contactItems.length === 0 ? (
              <p className="text-secondary text-sm">{t("accounts.detail.noContacts")}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {contactItems.map((c) => (
                <li key={c.id} className="text-sm">
                  <p className="font-medium">{c.fullName}</p>
                  <p className="text-secondary text-xs">
                    {[c.jobTitle, c.email, c.phone].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {canDelete ? (
            <div>
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("accounts.detail.deleteConfirm"))) remove.mutate();
                }}
              >
                {t("accounts.detail.delete")}
              </Button>
            </div>
          ) : null}
        </div>

        <Card>
          <CardHeader title={t("accounts.detail.timeline")} />
          <ActivityTimeline filter={{ accountId: a.id }} canCreate={canActivity} />
        </Card>
      </div>

      <AccountDialog open={editing} onOpenChange={setEditing} account={a} />
      <ContactDialog open={addContact} onOpenChange={setAddContact} accountId={a.id} />
      <DealDialog open={addDeal} onOpenChange={setAddDeal} accountId={a.id} />
    </div>
  );
}
