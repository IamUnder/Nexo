import { Icon, Input } from "@nexo/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCrmSearch } from "./api";
import { useDebounced } from "./useDebounced";

/** Búsqueda global del CRM (empresas, contactos y oportunidades) para la barra superior. */
export function CrmSearch() {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const q = useDebounced(value.trim(), 250);
  const results = useCrmSearch(q);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (type: "account" | "contact" | "deal", id: string) => {
    setOpen(false);
    setValue("");
    if (type === "account")
      void navigate({ to: "/crm/accounts/$accountId", params: { accountId: id } });
    else if (type === "deal") void navigate({ to: "/crm/deals/$dealId", params: { dealId: id } });
    else void navigate({ to: "/crm/contacts" });
  };

  const show = open && q.length >= 2 && results.data !== undefined;
  return (
    <search ref={box} className="relative block w-full max-w-md">
      <Icon
        name="search"
        size={16}
        className="text-secondary pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={t("search.label")}
        placeholder={t("search.placeholder")}
        className="h-9 pl-9"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {show ? (
        <ul className="border-line bg-surface-raised shadow-elevation-2 absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-card border p-1">
          {results.data?.length === 0 ? (
            <li className="text-secondary px-3 py-2 text-sm">{t("search.empty")}</li>
          ) : null}
          {results.data?.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              <button
                type="button"
                className="hover:bg-surface-hover flex w-full flex-col rounded-control px-3 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => go(r.type, r.id)}
              >
                <span className="text-sm font-medium">{r.title}</span>
                <span className="text-secondary text-xs">
                  {t(`search.type.${r.type}`)}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </search>
  );
}
