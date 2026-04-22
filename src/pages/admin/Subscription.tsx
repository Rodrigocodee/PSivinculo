import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ADMIN_SUBSCRIPTION_ROUTE, buildAdminSubscriptionRoute } from "@/config/billing";
import { findProductPlanByIdOrName } from "@/config/productPlans";
import { adminPlansQueryKey, fetchAdminPlansData } from "@/services/adminPlans";

function resolveFlowLabel(value: string | null) {
  if (value === "payment-method") return "Alterar pagamento";
  if (value === "change-plan") return "Alterar plano";
  return "Assinatura";
}

function SubscriptionLoadingState() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/70" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="mt-2 h-4 w-11/12 animate-pulse rounded bg-muted/50" />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg bg-muted/50 p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
              <div className="mt-2 h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminSubscription() {
  const [searchParams] = useSearchParams();
  const { data, isLoading, error } = useQuery({
    queryKey: adminPlansQueryKey,
    queryFn: fetchAdminPlansData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const adminName = data?.adminName || "Administrador(a)";
  const selectedPlan = findProductPlanByIdOrName(
    data?.availablePlans ?? [],
    searchParams.get("plano"),
  );
  const flow = searchParams.get("flow");
  const subtitle = selectedPlan
    ? `Fluxo preparado para o plano ${selectedPlan.name}.`
    : "Esta rota ja esta preparada para receber o fluxo futuro de assinatura do Psivinculo.";

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <SubscriptionLoadingState />
      </AppLayout>
    );
  }

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Assinatura e Pagamento</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar o contexto real da assinatura agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Vincule uma clinica ao usuario administrativo para habilitar o contexto real de assinatura.
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-heading text-xl font-semibold text-foreground">{resolveFlowLabel(flow)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O fluxo real de troca de plano e pagamento acontece na tela `/admin/planos`. Esta rota foi mantida apenas
            como apoio e espelho do contexto atual da assinatura, sem criar um segundo fluxo concorrente.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Clinica</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{data?.clinicName || "--"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Plano atual</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{data?.currentPlan.name || "--"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Plano selecionado</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedPlan?.name || "--"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Profissionais ativos</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{data?.activePsychologistsLabel || "--"}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <Link
              to="/admin/planos"
              className="rounded-xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Voltar para Planos
            </Link>
            <Link
              to={buildAdminSubscriptionRoute()}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Abrir rota limpa
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Rota padronizada: <span className="font-semibold text-foreground">{ADMIN_SUBSCRIPTION_ROUTE}</span>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
