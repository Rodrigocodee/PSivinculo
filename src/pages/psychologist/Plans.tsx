import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Check, CreditCard, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatCPF, formatCNPJ } from "@/lib/formatters";
import {
  createPsychologistPlanSubscription,
  createPsychologistSubscriptionPaymentLink,
  listPsychologistIndividualPlans,
  psychologistPlanSelectionQueryKey,
} from "@/services/psychologistPlanSelection";
import {
  fetchPsychologistSubscription,
  psychologistSubscriptionQueryKey,
} from "@/services/psychologistSubscription";

function normalizeDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function formatCpfCnpj(value: string) {
  const digits = normalizeDigits(value).slice(0, 14);
  if (!digits) return "";
  return digits.length <= 11 ? formatCPF(digits) : formatCNPJ(digits);
}

function isTerminalSubscriptionStatus(value: string | null | undefined) {
  return ["CANCELLED", "INACTIVE", "DELETED", "EXPIRED"].includes((value || "").trim().toUpperCase());
}

function formatStatusLabel(value: string | null | undefined, active: boolean) {
  if (active) return "Ativa";

  const normalizedValue = (value || "").trim().toUpperCase();
  if (!normalizedValue) return "Nao informado";

  const labels: Record<string, string> = {
    ACTIVE: "Aguardando pagamento",
    PENDING: "Aguardando pagamento",
    OVERDUE: "Vencida",
    CANCELLED: "Cancelada",
    INACTIVE: "Inativa",
    DELETED: "Cancelada",
    EXPIRED: "Expirada",
  };

  return labels[normalizedValue] || normalizedValue;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao informado";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Nao informado";

  return date.toLocaleDateString("pt-BR");
}

function openExternalUrl(url: string) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
}

const PSYCHOLOGIST_PAYMENT_RETURN_ROUTE = "/psi/pagamento/retorno";

export default function PsychologistPlans() {
  const queryClient = useQueryClient();
  const { appUser, refreshAuth } = useAuth();
  const [documentValue, setDocumentValue] = useState("");
  const plans = useMemo(() => listPsychologistIndividualPlans(), []);
  const subscriptionQuery = useQuery({
    queryKey: psychologistPlanSelectionQueryKey,
    queryFn: fetchPsychologistSubscription,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const currentPlan = subscriptionQuery.data?.currentPlan || null;
  const refetchSubscription = subscriptionQuery.refetch;
  const hasActiveSubscription = currentPlan?.subscriptionActive === true;
  const hasPendingSubscription = Boolean(
    currentPlan?.subscriptionId &&
      !currentPlan.subscriptionActive &&
      !isTerminalSubscriptionStatus(currentPlan.status),
  );
  const isChoosingBlocked = hasActiveSubscription || hasPendingSubscription;
  const userName = appUser?.fullName || "Profissional";
  const userEmail = appUser?.email || "";

  useEffect(() => {
    if (!hasPendingSubscription) return;

    const intervalId = window.setInterval(() => {
      void refetchSubscription();
      void refreshAuth();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [hasPendingSubscription, refreshAuth, refetchSubscription]);

  async function syncSubscriptionState() {
    await Promise.all([
      refreshAuth(),
      queryClient.invalidateQueries({ queryKey: psychologistPlanSelectionQueryKey }),
      queryClient.invalidateQueries({ queryKey: psychologistSubscriptionQueryKey }),
    ]);
  }

  const paymentLinkMutation = useMutation({
    mutationFn: () => createPsychologistSubscriptionPaymentLink(currentPlan?.subscriptionId),
    onSuccess: async (result) => {
      openExternalUrl(result.paymentUrl);
      await syncSubscriptionState();
      toast.success("Cobranca pendente aberta.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel abrir a cobranca pendente agora.");
    },
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: (planKey: (typeof plans)[number]["routeKey"]) => {
      const normalizedDocument = normalizeDigits(documentValue);
      if (![11, 14].includes(normalizedDocument.length)) {
        throw new Error("Informe um CPF ou CNPJ valido para gerar a cobranca.");
      }

      if (!userName.trim() || !userEmail.trim()) {
        throw new Error("Nao foi possivel identificar nome e e-mail do psicologo autenticado.");
      }

      return createPsychologistPlanSubscription({
        planKey,
        customer: {
          name: userName,
          email: userEmail,
          cpfCnpj: normalizedDocument,
        },
      });
    },
    onSuccess: async (result) => {
      await syncSubscriptionState();

      if (result.paymentUrl) {
        openExternalUrl(result.paymentUrl);
        toast.success("Assinatura criada. Conclua o pagamento para liberar o acesso.");
        return;
      }

      toast.success("Assinatura criada. Aguarde a confirmacao do pagamento pelo Asaas.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar a assinatura agora.");
    },
  });

  return (
    <AppLayout role="psychologist" userName={userName}>
      <div className="mx-auto w-full max-w-[1120px] space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-heading text-2xl font-bold text-foreground">Escolha seu plano</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              O acesso completo sera liberado apos a confirmacao do pagamento da assinatura pelo Asaas.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            <ShieldCheck className="h-4 w-4" />
            Checkout server-side
          </div>
        </div>

        {subscriptionQuery.isLoading ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Carregando sua assinatura.
          </div>
        ) : subscriptionQuery.error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {subscriptionQuery.error instanceof Error
              ? subscriptionQuery.error.message
              : "Nao foi possivel carregar sua assinatura agora."}
          </div>
        ) : currentPlan && hasActiveSubscription ? (
          <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-foreground">
            <p className="font-semibold">Sua assinatura ja esta ativa.</p>
            <p className="mt-1 text-muted-foreground">
              Plano {currentPlan.name || currentPlan.slug || "atual"} liberado. Proxima cobranca:{" "}
              {formatDate(currentPlan.nextDueDate)}.
            </p>
          </div>
        ) : currentPlan && hasPendingSubscription ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Voce ja possui uma cobranca pendente</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plano {currentPlan.name || currentPlan.slug || "selecionado"} com status{" "}
                  {formatStatusLabel(currentPlan.status, currentPlan.subscriptionActive)}. Abra a cobranca existente
                  para concluir o pagamento.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                <Button
                  type="button"
                  onClick={() => paymentLinkMutation.mutate()}
                  disabled={paymentLinkMutation.isPending}
                  className="rounded-xl gradient-primary text-primary-foreground"
                >
                  {paymentLinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Abrir cobranca existente
                </Button>
                <Button type="button" variant="outline" asChild className="rounded-xl">
                  <Link to={PSYCHOLOGIST_PAYMENT_RETURN_ROUTE}>
                    Ja paguei / Verificar pagamento
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {!hasActiveSubscription ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              CPF ou CNPJ para cobranca
            </label>
            <input
              value={documentValue}
              onChange={(event) => setDocumentValue(formatCpfCnpj(event.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              disabled={isChoosingBlocked || createSubscriptionMutation.isPending}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20 sm:max-w-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Usado apenas para criar ou localizar o cliente no Asaas. A assinatura continua sendo criada no servidor.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {plans.map((plan) => {
            const isPendingThisPlan = createSubscriptionMutation.variables === plan.routeKey;

            return (
              <article
                key={plan.slug}
                className={`relative flex h-full flex-col rounded-xl border bg-card p-5 shadow-[var(--shadow-sm)] ${
                  plan.recommended ? "border-primary/30 ring-2 ring-primary/10" : "border-border"
                }`}
              >
                {plan.recommended ? (
                  <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    <Sparkles className="h-3 w-3" />
                    Recomendado
                  </div>
                ) : null}

                <div className="pr-28">
                  <h2 className="font-heading text-xl font-bold text-foreground">{plan.name}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor mensal</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                    {plan.priceLabel}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">/mes</span>
                  </p>
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground/80">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10">
                        <Check className="h-3.5 w-3.5 text-success" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  type="button"
                  onClick={() => createSubscriptionMutation.mutate(plan.routeKey)}
                  disabled={isChoosingBlocked || createSubscriptionMutation.isPending}
                  className={`mt-5 rounded-xl ${plan.recommended ? "gradient-primary text-primary-foreground" : ""}`}
                  variant={plan.recommended ? "default" : "outline"}
                >
                  {isPendingThisPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Criando cobranca...
                    </>
                  ) : isChoosingBlocked ? (
                    "Indisponivel agora"
                  ) : (
                    <>
                      Escolher plano
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </article>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
