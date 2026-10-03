import { Badge, Button, EmptyState, Icon, Input, Table, Td, THead, Th, Tr } from "@nexo/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCan } from "../../shared/api/queries";
import { useAccounts } from "./api";
import { AccountDialog, ListSkeleton, STATUS_TONE } from "./components";
import { useDebounced } from "./useDebounced";

export function AccountsPage() {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const canCreate = useCan("crm:account:create");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const accounts = useAccounts(debounced);
  const items = accounts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("accounts.title")}</h1>
          <p className="text-secondary text-sm">{t("accounts.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            {t("accounts.new")}
          </Button>
        ) : null}
      </header>

      <div className="relative sm:max-w-sm">
        <Icon
          name="search"
          size={16}
          className="text-secondary pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <Input
          type="search"
          aria-label={t("accounts.search")}
          placeholder={t("accounts.search")}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {accounts.isLoading ? <ListSkeleton /> : null}
      {accounts.data && items.length === 0 ? (
        <EmptyState
          icon="building"
          title={debounced ? t("accounts.empty.noResults") : t("accounts.empty.title")}
          description={debounced ? undefined : t("accounts.empty.description")}
          action={
            !debounced && canCreate ? (
              <Button onClick={() => setCreating(true)}>{t("accounts.new")}</Button>
            ) : undefined
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Table label={t("accounts.table")}>
          <THead>
            <Tr>
              <Th>{t("accounts.col.name")}</Th>
              <Th>{t("accounts.col.status")}</Th>
              <Th>{t("accounts.col.contacts")}</Th>
              <Th>{t("accounts.col.openDeals")}</Th>
              <Th>{t("accounts.col.owner")}</Th>
            </Tr>
          </THead>
          <tbody>
            {items.map((a) => (
              <Tr key={a.id}>
                <Td>
                  <button
                    type="button"
                    className="text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                    onClick={() =>
                      void navigate({ to: "/crm/accounts/$accountId", params: { accountId: a.id } })
                    }
                  >
                    {a.name}
                  </button>
                  {a.domain ? <p className="text-secondary text-xs">{a.domain}</p> : null}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                    {t(`accounts.status.${a.status}`, { defaultValue: a.status })}
                  </Badge>
                </Td>
                <Td>{a.contactsCount}</Td>
                <Td>{a.openDealsCount}</Td>
                <Td>{a.ownerName ?? t("common.none")}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {accounts.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            loading={accounts.isFetchingNextPage}
            onClick={() => void accounts.fetchNextPage()}
          >
            {t("common.loadMore")}
          </Button>
        </div>
      ) : null}

      <AccountDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(a) =>
          void navigate({ to: "/crm/accounts/$accountId", params: { accountId: a.id } })
        }
      />
    </div>
  );
}
