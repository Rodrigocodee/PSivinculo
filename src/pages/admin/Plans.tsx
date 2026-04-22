import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  adminPlansQueryKey,
  cancelAdminPlan,
  changeAdminPlan,
  createAdminSubscriptionPaymentLink,
  fetchAdminPlansData,
} from "@/services/adminPlans";

function formatCurrency(value: number | null) {
  if (value == null) return "--";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPlanCardPrice(value: number | null) {
  if (value == null) return "--";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStatusLabel(value: string | null | undefined) {
  const normalizedValue = (value || "").trim().toUpperCase();

  if (!normalizedValue) return "--";
  if (normalizedValue === "ACTIVE") return "ACTIVE";
  if (normalizedValue === "PENDING") return "PENDING";
  if (normalizedValue === "OVERDUE") return "OVERDUE";
  if (normalizedValue === "CANCELLED") return "CANCELLED";
  if (normalizedValue === "INACTIVE") return "INACTIVE";
  if (normalizedValue === "DELETED") return "DELETED";

  return normalizedValue;
}

function isTerminalStatus(value: string | null | undefined) {
  return ["CANCELLED", "INACTIVE", "DELETED", "EXPIRED"].includes((value || "").trim().toUpperCase());
}

function formatApiDate(value: string | null | undefined) {
  if (!value) return null;

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate.toLocaleDateString("pt-BR");
}

function PlansLoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/70" />
      </div>

      <div className="overflow-hidden rounded-[1.7rem] border border-primary/20 bg-card p-5 premium-shadow">
        <div className="h-7 w-32 animate-pulse rounded-full bg-muted/70" />
        <div className="mt-4 h-9 w-52 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-80 animate-pulse rounded bg-muted/70" />
        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[1.2rem] border border-border/60 bg-muted/40 p-3.5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
              <div className="mt-3 h-5 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[1.5rem] border border-border/70 bg-card p-5 premium-shadow">
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-9 w-32 animate-pulse rounded bg-muted/70" />
            <div className="mt-5 space-y-2.5">
              {Array.from({ length: 4 }).map((__, featureIndex) => (
                <div key={featureIndex} className="h-10 animate-pulse rounded-[1rem] bg-muted/40" />
              ))}
            </div>
            <div className="mt-5 h-11 animate-pulse rounded-xl bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function openExternalUrl(url: string) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");

  if (!popup) {
    toast("O link foi gerado, mas o navegador bloqueou a nova aba.");
  }
}

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const { refreshAuth } = useAuth();
  const plansSectionRef = useRef<HTMLDivElement | null>(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const plansQuery = useQuery({
    queryKey: adminPlansQueryKey,
    queryFn: fetchAdminPlansData,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const { data, isLoading, error, refetch } = plansQuery;

  useEffect(() => {
    if (!data?.currentPlan.subscriptionId || data.currentPlan.subscriptionActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refetch();
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [data?.currentPlan.subscriptionActive, data?.currentPlan.subscriptionId, refetch]);

  async function syncAfterMutation() {
    await Promise.all([
      refreshAuth(),
      queryClient.invalidateQueries({ queryKey: adminPlansQueryKey }),
    ]);
  }

  const changePlanMutation = useMutation({
    mutationFn: changeAdminPlan,
    onSuccess: async (result) => {
      if (result.paymentUrl) {
        openExternalUrl(result.paymentUrl);
      }

      await syncAfterMutation();

      if (result.warning) {
        toast(result.warning);
      }

      if (result.action === "updated_existing_subscription") {
        toast.success("Plano atualizado com sucesso.");
        return;
      }

      if (result.paymentUrl) {
        toast.success("Nova assinatura criada. Conclua o pagamento na aba aberta.");
        return;
      }

      toast.success("Nova assinatura criada. Aguarde a confirmacao pelo Asaas.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Nao foi possivel alterar o plano agora.",
      );
    },
  });

  const paymentLinkMutation = useMutation({
    mutationFn: createAdminSubscriptionPaymentLink,
    onSuccess: async (result) => {
      openExternalUrl(result.paymentUrl);
      await syncAfterMutation();
      toast.success("Link de pagamento aberto em nova aba.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Nao foi possivel gerar o link de pagamento agora.",
      );
    },
  });

  const cancelPlanMutation = useMutation({
    mutationFn: cancelAdminPlan,
    onSuccess: async (result) => {
      setIsCancelDialogOpen(false);
      await syncAfterMutation();

      if (result.warning) {
        toast(result.warning);
      }

      if (result.cancellationMode === "end_of_cycle") {
        toast.success(
          `Renovacao cancelada. O acesso segue liberado ate ${formatApiDate(result.accessUntil) || "o fim do ciclo atual"}.`,
        );
        return;
      }

      toast.success("Assinatura cancelada com sucesso.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Nao foi possivel cancelar o plano agora.",
      );
    },
  });

  const adminName = data?.adminName || "Administrador(a)";
  const availablePlans = data?.availablePlans ?? [];
  const subtitle = data?.hasClinicScope
    ? `Gerencie o plano e a assinatura da ${data.clinicName || "clinica"}.`
    : "Os cards abaixo mostram os planos disponiveis para toda a plataforma.";
  const hasCurrentPlan = Boolean(data?.currentPlan.id);
  const currentPlanSummary = data?.currentPlan.graceAccess
    ? `A renovacao automatica foi cancelada. O acesso atual segue liberado ate ${data.currentPlan.dueDate || "o fim do ciclo atual"}.`
    : data?.currentPlan.summary || (
        data?.currentPlanError
          ? "Os dados atuais da assinatura nao puderam ser carregados agora."
          : data?.hasClinicScope
            ? "Nenhum dado de assinatura foi encontrado para esta clinica ainda."
            : "Os dados de assinatura aparecerao aqui quando a conta estiver vinculada."
      );
  const currentPlanName = data?.currentPlan.name || (
    data?.currentPlanError
      ? "Contexto temporariamente indisponivel"
      : data?.hasClinicScope
        ? "Sem plano vinculado"
        : "Conta nao vinculada"
  );
  const currentPlanEyebrow = data?.currentPlan.graceAccess
    ? "Cancelamento agendado"
    : data?.currentPlan.subscriptionActive
      ? "Assinatura ativa"
      : data?.currentPlan.status
        ? `Status ${formatStatusLabel(data.currentPlan.status)}`
        : data?.hasClinicScope
          ? "Configuracao pendente"
          : "Aguardando vinculacao";
  const currentPlanStats = [
    {
      label: "Valor mensal",
      value: formatCurrency(data?.currentPlan.monthlyPrice ?? null),
      valueClassName: data?.currentPlan.monthlyPrice != null ? "text-primary" : "text-foreground",
      surfaceClassName:
        "bg-[linear-gradient(135deg,hsla(var(--primary),0.12),hsla(var(--primary),0.04))]",
    },
    {
      label: "Profissionais ativos",
      value: data?.activePsychologistsLabel || "--",
      valueClassName: "text-foreground",
      surfaceClassName:
        "bg-[linear-gradient(135deg,hsla(var(--secondary),0.16),hsla(var(--secondary),0.04))]",
    },
    {
      label: "Vencimento",
      value: data?.currentPlan.dueDate || "--",
      valueClassName: "text-foreground",
      surfaceClassName:
        "bg-[linear-gradient(135deg,hsla(var(--accent),0.14),hsla(var(--accent),0.04))]",
    },
    {
      label: "Forma de pagamento",
      value: data?.currentPlan.paymentMethod || "--",
      valueClassName: "text-foreground",
      surfaceClassName:
        "bg-[linear-gradient(135deg,hsla(var(--foreground),0.05),hsla(var(--foreground),0.02))]",
    },
  ];
  const pendingPlanId = changePlanMutation.variables?.plan.id ?? null;
  const currentPlanStatus = data?.currentPlan.status || null;
  const currentPlanIsTerminal = isTerminalStatus(currentPlanStatus);
  const canCancelCurrentPlan = Boolean(data?.currentPlan.subscriptionId) && !currentPlanIsTerminal;
  const canChangePayment = Boolean(data?.currentPlan.subscriptionId) && !currentPlanIsTerminal;
  const cancelDialogDescription =
    data?.currentPlan.subscriptionActive && data.currentPlan.dueDate
      ? `A recorrencia sera cancelada no Asaas agora, sem renovar o proximo ciclo. Como o periodo atual ja esta liberado, o acesso permanece ate ${data.currentPlan.dueDate}. Depois disso, a conta volta para preview/bloqueio.`
      : "A recorrencia sera cancelada no Asaas e a conta deixara de ter assinatura ativa assim que o cancelamento for concluido.";

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <PlansLoadingState />
      </AppLayout>
    );
  }

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="mx-auto w-full max-w-[1180px] space-y-6">
        <div className="max-w-3xl">
          <h1 className="font-heading text-2xl font-bold text-foreground">Planos e Assinatura</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        {error ? (
          <div className="rounded-[1.35rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-[var(--shadow-sm)]">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os dados reais do plano agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
            Os planos continuam disponiveis abaixo. Vincule uma clinica ao usuario administrativo para preencher a area de Plano Atual com dados reais.
          </div>
        ) : null}

        {data?.currentPlanError ? (
          <div className="rounded-[1.35rem] border border-border/70 bg-card/95 px-4 py-3 text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
            Nao foi possivel carregar completamente o contexto atual da assinatura agora. Os planos disponiveis continuam sendo exibidos normalmente.
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-[1.8rem] border border-primary/20 bg-card/95 p-5 premium-shadow lg:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.14),transparent_34%),radial-gradient(circle_at_82%_16%,hsla(var(--accent),0.12),transparent_24%)] opacity-90" />

          <div className="relative">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-[40rem]">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary shadow-[var(--shadow-sm)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Plano Atual</span>
                </div>

                <div className="mt-4 inline-flex items-center rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-[var(--shadow-sm)]">
                  {currentPlanEyebrow}
                </div>

                <h2
                  className={`mt-4 font-heading font-extrabold leading-none tracking-[-0.04em] text-foreground ${
                    hasCurrentPlan ? "text-[1.9rem] md:text-[2.2rem]" : "text-[1.75rem] md:text-[2rem]"
                  }`}
                >
                  {currentPlanName}
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {currentPlanSummary}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 shadow-[var(--shadow-sm)]">
                    Status: {formatStatusLabel(data?.currentPlan.status)}
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 shadow-[var(--shadow-sm)]">
                    Assinatura ativa: {data?.currentPlan.subscriptionActive ? "Sim" : "Nao"}
                  </span>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border/70 bg-background/80 px-4 py-3.5 text-sm text-muted-foreground shadow-[var(--shadow-sm)] backdrop-blur-sm xl:min-w-[245px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                  Assinatura
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {data?.hasClinicScope ? data?.clinicName || "Clinica" : "Aguardando vinculacao"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Origem atual: {data?.currentPlan.sourceTable || "--"} | Owner: {data?.currentPlan.ownerType || "--"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {currentPlanStats.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-[1.25rem] border border-border/70 p-3.5 shadow-[var(--shadow-sm)] backdrop-blur-sm ${item.surfaceClassName}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className={`mt-2.5 text-[1rem] font-bold tracking-[-0.02em] md:text-[1.06rem] ${item.valueClassName}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl gradient-primary px-5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 premium-shadow"
              >
                Alterar Plano
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => paymentLinkMutation.mutate()}
                disabled={paymentLinkMutation.isPending || !canChangePayment}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border/80 bg-background/85 px-5 text-sm font-semibold text-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentLinkMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando link...
                  </>
                ) : (
                  "Alterar Pagamento"
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsCancelDialogOpen(true)}
                disabled={!canCancelCurrentPlan || cancelPlanMutation.isPending}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-5 text-sm font-semibold text-destructive shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelPlanMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : currentPlanIsTerminal ? (
                  "Plano cancelado"
                ) : (
                  "Cancelar Plano"
                )}
              </button>
            </div>
          </div>
        </div>

        <div ref={plansSectionRef} className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {availablePlans.length > 0 ? (
            availablePlans.map((plan) => {
              const isCurrent = Boolean(data?.currentPlan.id && data.currentPlan.id === plan.id);
              const isProcessingThisPlan =
                changePlanMutation.isPending && pendingPlanId != null && pendingPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-[1.55rem] border p-5 transition-all duration-300 ${
                    isCurrent
                      ? "border-primary/25 bg-primary/[0.06] premium-shadow"
                      : "border-border/70 bg-card premium-shadow hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg"
                  }`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.12),transparent_38%),linear-gradient(180deg,hsla(var(--background),0.03),transparent_34%)] opacity-80" />
                  <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="max-w-[17rem]">
                        <h3 className="font-heading text-[1.2rem] font-bold tracking-[-0.03em] text-foreground">
                          {plan.name}
                        </h3>
                        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                          {plan.subtitle || plan.summary || "Plano disponivel para contratacao."}
                        </p>
                      </div>

                      {isCurrent ? (
                        <span className="inline-flex rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary shadow-[var(--shadow-sm)]">
                          Plano atual
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 rounded-[1.2rem] border border-border/70 bg-background/85 p-4 shadow-[var(--shadow-sm)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Investimento mensal
                      </p>

                      <div className="mt-2.5 flex items-end gap-1.5">
                        <span className="text-[2.35rem] font-extrabold leading-none tracking-[-0.05em] text-foreground">
                          {formatPlanCardPrice(plan.monthlyPrice)}
                        </span>
                        <span className="pb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          /mes
                        </span>
                      </div>

                      {plan.pricingNote ? (
                        <p className="mt-2.5 text-[12px] leading-5 text-muted-foreground">
                          {plan.pricingNote}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-5 flex-1 rounded-[1.2rem] border border-border/70 bg-background/65 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Recursos inclusos
                        </p>
                        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {plan.features.length > 0 ? `${plan.features.length} itens` : "--"}
                        </span>
                      </div>

                      <ul className="mt-3.5 space-y-2.5">
                        {plan.features.length > 0 ? (
                          plan.features.map((feature) => (
                            <li
                              key={feature}
                              className="flex items-start gap-2.5 border-b border-border/55 pb-2.5 text-[13px] leading-6 text-foreground/80 last:border-b-0 last:pb-0"
                            >
                              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success/10 shadow-[inset_0_1px_0_hsla(var(--background),0.7)]">
                                <Check className="h-3.5 w-3.5 text-success" />
                              </span>
                              <span>{feature}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-[13px] text-muted-foreground">Beneficios nao informados.</li>
                        )}
                      </ul>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || changePlanMutation.isPending}
                      onClick={() => changePlanMutation.mutate({ plan })}
                      className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-[var(--shadow-sm)] transition-all duration-200 ${
                        isCurrent
                          ? "cursor-not-allowed border border-primary/15 bg-primary/10 text-primary"
                          : "border border-primary/15 bg-[linear-gradient(135deg,hsla(var(--primary),0.12),hsla(var(--accent),0.08))] text-foreground hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      }`}
                    >
                      {isCurrent ? (
                        "Plano atual"
                      ) : isProcessingThisPlan ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          Selecionar
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-card p-5 premium-shadow md:col-span-2 xl:col-span-3">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.08),transparent_34%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Planos</span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Nenhum plano ativo foi encontrado em `public.planos` para exibicao nesta tela.
                </p>
              </div>
            </div>
          )}
        </div>

        <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar renovacao do plano?</AlertDialogTitle>
              <AlertDialogDescription>{cancelDialogDescription}</AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelPlanMutation.isPending}>
                Manter plano
              </AlertDialogCancel>
              <button
                type="button"
                onClick={() => cancelPlanMutation.mutate()}
                disabled={cancelPlanMutation.isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {cancelPlanMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  "Confirmar cancelamento"
                )}
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
