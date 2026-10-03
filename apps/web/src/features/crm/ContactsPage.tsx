import { Button, EmptyState, Icon, Input, Table, Td, THead, Th, Tr } from "@nexo/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCan } from "../../shared/api/queries";
import { useContacts } from "./api";
import { ContactDialog, ListSkeleton } from "./components";
import { useDebounced } from "./useDebounced";

export function ContactsPage() {
  const { t } = useTranslation("crm");
  const canCreate = useCan("crm:contact:create");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const contacts = useContacts(debounced);
  const items = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("contacts.title")}</h1>
          <p className="text-secondary text-sm">{t("contacts.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            {t("contacts.new")}
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
          aria-label={t("contacts.search")}
          placeholder={t("contacts.search")}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {contacts.isLoading ? <ListSkeleton /> : null}
      {contacts.data && items.length === 0 ? (
        <EmptyState
          icon="users"
          title={debounced ? t("contacts.empty.noResults") : t("contacts.empty.title")}
          description={debounced ? undefined : t("contacts.empty.description")}
          action={
            !debounced && canCreate ? (
              <Button onClick={() => setCreating(true)}>{t("contacts.new")}</Button>
            ) : undefined
          }
        />
      ) : null}

      {items.length > 0 ? (
        <Table label={t("contacts.table")}>
          <THead>
            <Tr>
              <Th>{t("contacts.col.name")}</Th>
              <Th>{t("contacts.col.company")}</Th>
              <Th>{t("contacts.col.email")}</Th>
              <Th>{t("contacts.col.phone")}</Th>
              <Th>{t("contacts.col.jobTitle")}</Th>
            </Tr>
          </THead>
          <tbody>
            {items.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium">{c.fullName}</Td>
                <Td>
                  {c.accountId ? (
                    <Link
                      to="/crm/accounts/$accountId"
                      params={{ accountId: c.accountId }}
                      className="underline-offset-2 hover:underline"
                    >
                      {c.accountName}
                    </Link>
                  ) : (
                    t("common.noValue")
                  )}
                </Td>
                <Td>{c.email ?? t("common.noValue")}</Td>
                <Td>{c.phone ?? t("common.noValue")}</Td>
                <Td>{c.jobTitle ?? t("common.noValue")}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {contacts.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            loading={contacts.isFetchingNextPage}
            onClick={() => void contacts.fetchNextPage()}
          >
            {t("common.loadMore")}
          </Button>
        </div>
      ) : null}

      <ContactDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
