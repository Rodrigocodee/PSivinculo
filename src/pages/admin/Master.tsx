import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  DollarSign,
  FileSearch,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  adminMasterOverviewQueryKey,
  executeAdminMasterAction,
  fetchAdminMasterOverview,
  isAdminMasterAccessError,
  type AdminMasterActionName,
  type AdminMasterFilters,
  type AdminMasterPsychologist,
  type AdminMasterSubscription,
} from "@/services/adminMaster";

const PAGE_LIMIT = 25;

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatStatus(value: string | null | undefined) {
  return value?.trim() || "-";
}

function StatusPill({ active, label }: { active?: boolean; label: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function TableShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhum registro encontrado.
      </td>
    </tr>
  );
}

const ACTION_LABELS: Record<AdminMasterActionName, string> = {
  sync_subscription_asaas: "Sincronizar com Asaas",
  block_professional_access: "Bloquear acesso",
  release_professional_access: "Liberar acesso",
  mark_subscription_pending: "Marcar pendente",
  mark_subscription_cancelled: "Marcar cancelada",
  deactivate_psychologist: "Desativar psicologo",
  view_webhook_logs: "Ver logs de webhook",
  detect_duplicate_subscriptions: "Detectar duplicidade",
};

function stringifyActionResult(value: unknown) {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

function NeutralUnavailablePage({ message = "Pagina nao encontrada." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {message}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O recurso solicitado nao esta disponivel.
        </p>
      </div>
    </div>
  );
}

function AdminMasterConsole() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [planSlug, setPlanSlug] = useState("");
  const [ownerType, setOwnerType] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedPsychologist, setSelectedPsychologist] = useState<AdminMasterPsychologist | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<AdminMasterSubscription | null>(null);
  const [selectedAction, setSelectedAction] = useState<AdminMasterActionName | "">("");
  const [actionReason, setActionReason] = useState("");
  const [actionConfirmation, setActionConfirmation] = useState("");
  const [actionResult, setActionResult] = useState<unknown>(null);
  const filters = useMemo<AdminMasterFilters>(
    () => ({
      search,
      subscriptionStatus,
      planSlug,
      ownerType,
      offset,
      limit: PAGE_LIMIT,
    }),
    [ownerType, offset, planSlug, search, subscriptionStatus],
  );
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: [...adminMasterOverviewQueryKey, filters],
    queryFn: () => fetchAdminMasterOverview(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const actionMutation = useMutation({
    mutationFn: executeAdminMasterAction,
    onSuccess: async (result) => {
      setActionResult(result.result);
      setActionReason("");
      setActionConfirmation("");
      await queryClient.invalidateQueries({ queryKey: adminMasterOverviewQueryKey });
      void refetch();
    },
  });

  if (isFetching && !data) {
    return <NeutralUnavailablePage message="Carregando..." />;
  }

  if (isAdminMasterAccessError(error) && [401, 403].includes(error.status)) {
    return <NeutralUnavailablePage />;
  }

  const summary = data?.summary;
  const canGoBack = offset > 0;
  const hasMore =
    Boolean(data?.psychologists.hasMore) ||
    Boolean(data?.clinics.hasMore) ||
    Boolean(data?.subscriptions.hasMore);

  function resetOffset() {
    setOffset(0);
  }

  const actionTarget = selectedSubscription
    ? {
        targetTable: "assinaturas_asaas" as const,
        targetId: selectedSubscription.id,
        label: `assinatura ${selectedSubscription.id}`,
      }
    : selectedPsychologist
      ? {
          targetTable: "usuarios" as const,
          targetId: selectedPsychologist.id,
          label: selectedPsychologist.name,
        }
      : null;

  function runSelectedAction() {
    if (!selectedAction || !actionTarget) return;
    actionMutation.mutate({
      action: selectedAction,
      targetTable: actionTarget.targetTable,
      targetId: actionTarget.targetId,
      reason: actionReason,
      confirmation: actionConfirmation,
    });
  }

  function choosePsychologist(psychologist: AdminMasterPsychologist) {
    setSelectedPsychologist(psychologist);
    setSelectedSubscription(null);
    setSelectedAction("");
    setActionResult(null);
  }

  function chooseSubscription(subscription: AdminMasterSubscription) {
    setSelectedSubscription(subscription);
    setSelectedPsychologist(null);
    setSelectedAction("");
    setActionResult(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" />
              Admin Master
            </div>
            <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
              Visao global do Psivinculo
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <label className="relative">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetOffset();
              }}
              placeholder="Buscar por nome, e-mail, plano ou identificador"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
          </label>
          <input
            value={subscriptionStatus}
            onChange={(event) => {
              setSubscriptionStatus(event.target.value);
              resetOffset();
            }}
            placeholder="Status assinatura"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
          />
          <input
            value={planSlug}
            onChange={(event) => {
              setPlanSlug(event.target.value);
              resetOffset();
            }}
            placeholder="Plano"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
          />
          <select
            value={ownerType}
            onChange={(event) => {
              setOwnerType(event.target.value);
              resetOffset();
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
          >
            <option value="">Owner type</option>
            <option value="user">user</option>
            <option value="clinic">clinic</option>
            <option value="unresolved">unresolved</option>
          </select>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error instanceof Error ? error.message : "Nao foi possivel carregar o Admin Master."}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Psicologos" value={`${summary?.psychologistsTotal ?? 0}`} icon={Users} />
          <StatCard label="Pacientes" value={`${summary?.patientsTotal ?? 0}`} icon={Users} />
          <StatCard label="Clinicas" value={`${summary?.clinicsTotal ?? 0}`} icon={Building2} />
          <StatCard label="Consultas" value={`${summary?.consultationsTotal ?? 0}`} icon={CalendarDays} />
          <StatCard label="Assinaturas ativas" value={`${summary?.subscriptionsActive ?? 0}`} icon={ShieldCheck} />
          <StatCard label="Assinaturas pendentes" value={`${summary?.subscriptionsPending ?? 0}`} icon={ShieldCheck} />
          <StatCard label="Assinaturas canceladas" value={`${summary?.subscriptionsCancelled ?? 0}`} icon={ShieldCheck} />
          <StatCard label="Receita estimada" value={formatCurrency(summary?.monthlyEstimatedRevenue)} icon={DollarSign} />
        </div>

        <TableShell title="Psicologos">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.psychologists.items.length ? data.psychologists.items.map((psychologist) => (
                <tr key={psychologist.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{psychologist.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{psychologist.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{psychologist.phone || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{psychologist.planSlug || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusPill active={psychologist.subscriptionActive} label={formatStatus(psychologist.subscriptionStatus)} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(psychologist.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => choosePsychologist(psychologist)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Ver detalhes
                    </button>
                  </td>
                </tr>
              )) : <EmptyRow colSpan={7} />}
            </tbody>
          </table>
        </TableShell>

        {selectedPsychologist ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">{selectedPsychologist.name}</h2>
                <p className="mt-1 text-muted-foreground">{selectedPsychologist.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPsychologist(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Auth ID</dt>
                <dd className="mt-1 break-all text-foreground">{selectedPsychologist.authUserId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Telefone</dt>
                <dd className="mt-1 text-foreground">{selectedPsychologist.phone || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Plano</dt>
                <dd className="mt-1 text-foreground">{selectedPsychologist.planSlug || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assinatura</dt>
                <dd className="mt-1 text-foreground">{formatStatus(selectedPsychologist.subscriptionStatus)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAction("block_professional_access")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <Lock className="h-3.5 w-3.5" />
                Bloquear acesso
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("release_professional_access")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <Unlock className="h-3.5 w-3.5" />
                Liberar acesso
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("deactivate_psychologist")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Desativar psicologo
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("view_webhook_logs")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Logs webhook
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("detect_duplicate_subscriptions")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Duplicidade
              </button>
            </div>
          </div>
        ) : null}

        {selectedSubscription ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Assinatura {selectedSubscription.id}
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {selectedSubscription.ownerType || "-"} · {selectedSubscription.planSlug || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubscription(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Auth user</dt>
                <dd className="mt-1 break-all text-foreground">{selectedSubscription.authUserId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Clinica</dt>
                <dd className="mt-1 break-all text-foreground">{selectedSubscription.clinicId || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="mt-1 text-foreground">{formatStatus(selectedSubscription.subscriptionStatus)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Pagamento</dt>
                <dd className="mt-1 text-foreground">{formatStatus(selectedSubscription.paymentStatus)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAction("sync_subscription_asaas")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronizar Asaas
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("mark_subscription_pending")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Marcar pendente
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("mark_subscription_cancelled")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Marcar cancelada
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("view_webhook_logs")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Logs webhook
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction("detect_duplicate_subscriptions")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Duplicidade
              </button>
            </div>
          </div>
        ) : null}

        {selectedAction && actionTarget ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold">
                  {ACTION_LABELS[selectedAction]}
                </h2>
                <p className="text-amber-800">
                  Alvo: {actionTarget.label}. Esta acao e registrada em auditoria.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedAction("");
                  setActionResult(null);
                }}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
              >
                Cancelar
              </button>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="Motivo obrigatorio"
                className="h-10 rounded-lg border border-amber-300 bg-white px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
              <input
                value={actionConfirmation}
                onChange={(event) => setActionConfirmation(event.target.value)}
                placeholder="Digite CONFIRMAR"
                className="h-10 rounded-lg border border-amber-300 bg-white px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
              <button
                type="button"
                onClick={runSelectedAction}
                disabled={actionMutation.isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionMutation.isPending ? "Executando..." : "Executar"}
              </button>
            </div>
            {actionMutation.error ? (
              <p className="mt-3 text-sm text-destructive">
                {actionMutation.error instanceof Error ? actionMutation.error.message : "Nao foi possivel executar a acao."}
              </p>
            ) : null}
            {actionResult ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-800">
                {stringifyActionResult(actionResult)}
              </pre>
            ) : null}
          </section>
        ) : null}

        <TableShell title="Clinicas">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Psicologos</th>
                <th className="px-4 py-3">Assinatura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.clinics.items.length ? data.clinics.items.map((clinic) => (
                <tr key={clinic.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{clinic.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{clinic.email || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatStatus(clinic.status)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{clinic.psychologistCount}</td>
                  <td className="px-4 py-3">
                    <StatusPill active={clinic.subscriptionActive} label={clinic.planSlug || formatStatus(clinic.subscriptionStatus)} />
                  </td>
                </tr>
              )) : <EmptyRow colSpan={5} />}
            </tbody>
          </table>
        </TableShell>

        <TableShell title="Assinaturas">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Auth user</th>
                <th className="px-4 py-3">Clinica</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Asaas</th>
                <th className="px-4 py-3">Atualizado</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.subscriptions.items.length ? data.subscriptions.items.map((subscription) => (
                <tr key={subscription.id}>
                  <td className="px-4 py-3 text-muted-foreground">{subscription.ownerType || "-"}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-muted-foreground">{subscription.authUserId || "-"}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-muted-foreground">{subscription.clinicId || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{subscription.planSlug || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusPill active={subscription.subscriptionActive} label={formatStatus(subscription.subscriptionStatus)} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{subscription.paymentStatus || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatCurrency(subscription.planValue)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(subscription.nextDueDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{subscription.asaasSubscriptionIdMasked || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(subscription.updatedAt || subscription.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => chooseSubscription(subscription)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Acoes
                    </button>
                  </td>
                </tr>
              )) : <EmptyRow colSpan={11} />}
            </tbody>
          </table>
        </TableShell>

        <TableShell title="Consultas e financeiro">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Status pagamento</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.consultationFinance.map((item) => (
                <tr key={item.status}>
                  <td className="px-4 py-3 text-muted-foreground">{item.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <p className="text-sm text-muted-foreground">
            Exibindo {offset + 1}-{offset + PAGE_LIMIT}
          </p>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => setOffset(offset + PAGE_LIMIT)}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Proxima
          </button>
        </div>
      </main>
    </div>
  );
}

export default function AdminMaster() {
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">("checking");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSessionState(data.session?.access_token ? "ready" : "missing");
      } catch {
        if (!isMounted) return;
        setSessionState("missing");
      }
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  if (sessionState === "checking") {
    return <NeutralUnavailablePage message="Carregando..." />;
  }

  if (sessionState === "missing") {
    return <NeutralUnavailablePage />;
  }

  return <AdminMasterConsole />;
}
