import { zodResolver } from "@hookform/resolvers/zod";
import {
  type MemberDto,
  PERMISSIONS,
  type PermissionMatrix,
  ROLES,
  SEAT_TYPES,
} from "@nexo/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Menu,
  Select,
  Skeleton,
  Table,
  Tabs,
  Td,
  THead,
  Th,
  Tr,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import {
  qk,
  useCan,
  useInvitations,
  useMe,
  useMembers,
  usePermissionMatrix,
} from "../../shared/api/queries";

const INVITABLE_ROLES = ROLES.filter((r) => r !== "owner");
/** Los roles de gestión exigen asiento completo (la API también lo valida). */
const REQUIRES_FULL = new Set(["owner", "admin", "manager"]);

function useDate() {
  const { data: me } = useMe();
  return (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(me?.tenant.locale ?? "es-ES", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;
}

// ── Invitar ─────────────────────────────────────────────────────────────────────────────────────
function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("team");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, tc("errors:validation.failed"))
          .email(tc("errors:validation.failed")),
        role: z.enum(INVITABLE_ROLES as unknown as [string, ...string[]]),
        seatType: z.enum(SEAT_TYPES),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "sales", seatType: "full" },
  });
  const role = form.watch("role");

  const invite = useMutation({
    mutationFn: (v: Values) => api("/team/invitations", { method: "POST", body: v }),
    onSuccess: async () => {
      toast.show(t("invite.sent"));
      await queryClient.invalidateQueries({ queryKey: qk.invitations });
      form.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("invite.title")}
      description={t("invite.description")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form="invite-form" loading={invite.isPending}>
            {t("invite.submit")}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        noValidate
        onSubmit={form.handleSubmit((v) => invite.mutate(v))}
        className="flex flex-col gap-4"
      >
        {invite.isError ? <Alert tone="error">{errorMessage(tc, invite.error)}</Alert> : null}
        <Field label={t("invite.email")} error={form.formState.errors.email?.message} required>
          {(p) => (
            <Input type="email" autoComplete="off" autoFocus {...p} {...form.register("email")} />
          )}
        </Field>
        <Field label={t("invite.role")} required>
          {(p) => (
            <Select {...p} {...form.register("role")}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tc(`role.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("invite.seat")} hint={t("invite.seatHint")} required>
          {(p) => (
            <Select {...p} {...form.register("seatType")}>
              {SEAT_TYPES.map((s) => (
                <option key={s} value={s} disabled={s === "light" && REQUIRES_FULL.has(role)}>
                  {tc(`seat.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}

// ── Editar miembro ──────────────────────────────────────────────────────────────────────────────
function EditMemberDialog({ member, onClose }: { member: MemberDto | null; onClose: () => void }) {
  const { t } = useTranslation("team");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("");
  const [seat, setSeat] = useState<string>("");

  // Reinicia el formulario al cambiar de miembro.
  const key = member?.id ?? "none";
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setRole(member?.role ?? "");
    setSeat(member?.seatType ?? "");
  }

  const update = useMutation({
    mutationFn: () =>
      api(`/team/members/${member?.id}`, {
        method: "PATCH",
        body: {
          ...(role !== member?.role ? { role } : {}),
          ...(seat !== member?.seatType ? { seatType: seat } : {}),
        },
      }),
    onSuccess: async () => {
      toast.show(t("edit.saved"));
      await queryClient.invalidateQueries({ queryKey: qk.members });
      onClose();
    },
  });
  const unchanged = role === member?.role && seat === member?.seatType;

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("edit.title")}
      description={member ? `${member.fullName} · ${member.email}` : undefined}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button loading={update.isPending} disabled={unchanged} onClick={() => update.mutate()}>
            {t("edit.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {update.isError ? <Alert tone="error">{errorMessage(tc, update.error)}</Alert> : null}
        <Field label={t("edit.role")}>
          {(p) => (
            <Select {...p} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tc(`role.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("edit.seat")}>
          {(p) => (
            <Select {...p} value={seat} onChange={(e) => setSeat(e.target.value)}>
              {SEAT_TYPES.map((s) => (
                <option key={s} value={s} disabled={s === "light" && REQUIRES_FULL.has(role)}>
                  {tc(`seat.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Miembros ────────────────────────────────────────────────────────────────────────────────────
function MembersTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation("team");
  const { t: tc } = useTranslation();
  const { data: me } = useMe();
  const members = useMembers();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fmt = useDate();
  const [editing, setEditing] = useState<MemberDto | null>(null);

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "active" | "suspended" }) =>
      api(`/team/members/${v.id}`, { method: "PATCH", body: { status: v.status } }),
    onSuccess: async () => {
      toast.show(t("edit.saved"));
      await queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (err) => toast.show(errorMessage(tc, err), "error"),
  });

  if (members.isLoading) return <Skeleton className="h-48" />;
  if (members.isError) return <Alert tone="error">{errorMessage(tc, members.error)}</Alert>;
  const rows = members.data ?? [];
  if (rows.length === 0)
    return (
      <EmptyState icon="users" title={t("members.empty")} description={t("members.emptyHint")} />
    );

  return (
    <>
      <Table label={t("members.table")}>
        <THead>
          <Tr>
            <Th>{t("members.name")}</Th>
            <Th>{t("members.role")}</Th>
            <Th>{t("members.seat")}</Th>
            <Th>{t("members.status")}</Th>
            <Th className="hidden md:table-cell">{t("members.lastSeen")}</Th>
            {canManage ? <Th className="w-12" /> : null}
          </Tr>
        </THead>
        <tbody>
          {rows.map((m) => {
            const isMe = m.id === me?.membership.id;
            return (
              <Tr key={m.id}>
                <Td>
                  <div className="font-medium">
                    {m.fullName}{" "}
                    {isMe ? (
                      <span className="text-secondary text-xs font-normal">{t("members.you")}</span>
                    ) : null}
                  </div>
                  <div className="text-secondary text-xs">{m.email}</div>
                </Td>
                <Td>{tc(`role.${m.role}`)}</Td>
                <Td>{tc(`seat.${m.seatType}`)}</Td>
                <Td>
                  <Badge tone={m.status === "active" ? "success" : "error"}>
                    {m.status === "active" ? t("members.active") : t("members.suspended")}
                  </Badge>
                </Td>
                <Td className="text-secondary hidden md:table-cell">
                  {fmt(m.lastSeenAt) ?? t("members.never")}
                </Td>
                {canManage ? (
                  <Td>
                    <Menu
                      trigger={
                        <Button variant="ghost" aria-label={`${t("members.edit")}: ${m.fullName}`}>
                          <Icon name="more" />
                        </Button>
                      }
                      items={[
                        {
                          key: "edit",
                          label: t("members.edit"),
                          icon: "edit",
                          onSelect: () => setEditing(m),
                        },
                        ...(isMe
                          ? []
                          : [
                              m.status === "active"
                                ? {
                                    key: "suspend",
                                    label: t("members.suspend"),
                                    icon: "ban" as const,
                                    danger: true,
                                    onSelect: () =>
                                      setStatus.mutate({ id: m.id, status: "suspended" }),
                                  }
                                : {
                                    key: "reactivate",
                                    label: t("members.reactivate"),
                                    icon: "check-circle" as const,
                                    onSelect: () =>
                                      setStatus.mutate({ id: m.id, status: "active" }),
                                  },
                            ]),
                      ]}
                    />
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <EditMemberDialog member={editing} onClose={() => setEditing(null)} />
    </>
  );
}

// ── Invitaciones ────────────────────────────────────────────────────────────────────────────────
function InvitationsTab() {
  const { t } = useTranslation("team");
  const { t: tc } = useTranslation();
  const invitations = useInvitations(true);
  const queryClient = useQueryClient();
  const toast = useToast();
  const fmt = useDate();
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/team/invitations/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.show(t("invitations.revoked"));
      await queryClient.invalidateQueries({ queryKey: qk.invitations });
    },
    onError: (err) => toast.show(errorMessage(tc, err), "error"),
  });

  if (invitations.isLoading) return <Skeleton className="h-32" />;
  if (invitations.isError) return <Alert tone="error">{errorMessage(tc, invitations.error)}</Alert>;
  const rows = invitations.data ?? [];
  if (rows.length === 0)
    return (
      <EmptyState
        icon="mail"
        title={t("invitations.empty")}
        description={t("invitations.emptyHint")}
      />
    );

  const TONE = {
    pending: "info",
    expired: "warning",
    accepted: "success",
    revoked: "neutral",
  } as const;
  return (
    <Table label={t("invitations.table")}>
      <THead>
        <Tr>
          <Th>{t("invitations.email")}</Th>
          <Th>{t("members.role")}</Th>
          <Th className="hidden sm:table-cell">{t("invitations.expires")}</Th>
          <Th>{t("invitations.status")}</Th>
          <Th className="w-28" />
        </Tr>
      </THead>
      <tbody>
        {rows.map((i) => (
          <Tr key={i.id}>
            <Td className="font-medium">{i.email}</Td>
            <Td>{tc(`role.${i.role}`)}</Td>
            <Td className="text-secondary hidden sm:table-cell">{fmt(i.expiresAt)}</Td>
            <Td>
              <Badge tone={TONE[i.status]}>
                {t(`invitations.${i.status === "revoked" ? "revoked_status" : i.status}`)}
              </Badge>
            </Td>
            <Td>
              {i.status === "pending" ? (
                <Button
                  variant="ghost"
                  loading={revoke.isPending && revoke.variables === i.id}
                  onClick={() => revoke.mutate(i.id)}
                >
                  {t("invitations.revoke")}
                </Button>
              ) : null}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

// ── Permisos por rol ────────────────────────────────────────────────────────────────────────────
function PermissionsTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation("team");
  const { t: tc } = useTranslation();
  const matrix = usePermissionMatrix();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<string>("manager");
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [draftRole, setDraftRole] = useState<string | null>(null);

  const current: PermissionMatrix["roles"][number] | undefined = matrix.data?.roles.find(
    (r) => r.role === role,
  );

  // El borrador se reinicia al cambiar de rol o cuando llegan datos nuevos del servidor.
  if (current && draftRole !== role) {
    setDraftRole(role);
    setDraft(Object.fromEntries(current.permissions.map((p) => [p.permission, p.granted])));
  }

  const save = useMutation({
    mutationFn: () =>
      api<PermissionMatrix>(`/team/permissions/${role}`, {
        method: "PUT",
        body: { permissions: draft },
      }),
    onSuccess: async (data) => {
      toast.show(t("permissions.saved"));
      queryClient.setQueryData(qk.permissions, data);
      setDraftRole(null);
    },
  });

  if (matrix.isLoading || !current || !draft) return <Skeleton className="h-64" />;
  if (matrix.isError) return <Alert tone="error">{errorMessage(tc, matrix.error)}</Alert>;

  const editable = canEdit && current.editable;
  const dirty = current.permissions.some((p) => draft[p.permission] !== p.granted);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-display text-lg font-semibold">{t("permissions.title")}</h2>
          <p className="text-secondary mt-0.5 text-sm">{t("permissions.description")}</p>
        </div>
        <Field label={t("permissions.role")} className="w-48">
          {(p) => (
            <Select
              {...p}
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setDraftRole(null);
              }}
            >
              {matrix.data?.roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {tc(`role.${r.role}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {!current.editable ? (
        <Alert tone="info" className="mb-4">
          {t("permissions.locked")}
        </Alert>
      ) : null}
      {current.editable && !canEdit ? (
        <Alert tone="info" className="mb-4">
          {t("permissions.readOnly")}
        </Alert>
      ) : null}
      {save.isError ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(tc, save.error)}
        </Alert>
      ) : null}

      <ul className="divide-divider flex flex-col divide-y">
        {PERMISSIONS.map((permission) => {
          const row = current.permissions.find((p) => p.permission === permission);
          const id = `perm-${permission}`;
          return (
            <li key={permission} className="flex items-center justify-between gap-3 py-3">
              <label htmlFor={id} className="flex-1 cursor-pointer text-sm">
                {/* i18next usa `:` como separador de namespace: las claves de permiso van con `_` */}
                {t(`permission.${permission.replaceAll(":", "_")}`)}
                {row?.source === "override" ? (
                  <span className="text-action-primary ml-2 text-xs font-medium">
                    {t("permissions.custom")}
                  </span>
                ) : null}
              </label>
              <input
                id={id}
                type="checkbox"
                className="size-5 accent-[var(--nexo-color-action-primary-bg)]"
                checked={draft[permission] ?? false}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, [permission]: e.target.checked })}
              />
            </li>
          );
        })}
      </ul>

      {editable ? (
        <div className="mt-4 flex justify-end">
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            {t("permissions.save", { role: tc(`role.${role}`) })}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function TeamPage() {
  const { t } = useTranslation("team");
  const canManage = useCan("identity:member:manage");
  const canEditRoles = useCan("identity:role:manage");
  const [tab, setTab] = useState("members");
  const [inviting, setInviting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-10 font-bold">{t("title")}</h1>
          <p className="text-secondary mt-1 text-base">{t("subtitle")}</p>
        </div>
        {canManage ? (
          <Button onClick={() => setInviting(true)}>
            <Icon name="plus" />
            {t("invite.button")}
          </Button>
        ) : null}
      </div>

      <Tabs
        label={t("tabs.label")}
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: "members",
            label: t("tabs.members"),
            content: <MembersTab canManage={canManage} />,
          },
          ...(canManage
            ? [{ value: "invitations", label: t("tabs.invitations"), content: <InvitationsTab /> }]
            : []),
          {
            value: "permissions",
            label: t("tabs.permissions"),
            content: <PermissionsTab canEdit={canEditRoles} />,
          },
        ]}
      />
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}
