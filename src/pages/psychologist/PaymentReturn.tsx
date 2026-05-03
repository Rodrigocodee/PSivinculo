import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCurrentPsychologistProfessionalProfileCompletion,
  psychologistPaymentProfileRoute,
} from "@/services/psychologistProfessionalProfile";
import {
  fetchPsychologistSubscription,
  psychologistSubscriptionQueryKey,
} from "@/services/psychologistSubscription";

function openExternalUrl(url: string) {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
}

export default function PsychologistPaymentReturn() {
  const navigate = useNavigate();
  const { appUser, refreshAuth } = useAuth();
  const subscriptionQuery = useQuery({
    queryKey: psychologistSubscriptionQueryKey,
    queryFn: fetchPsychologistSubscription,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const currentPlan = subscriptionQuery.data?.currentPlan || null;
  const isSubscriptionActive = currentPlan?.subscriptionActive === true;
  const profileCompletionQuery = useQuery({
    queryKey: ["psychologist-post-payment-profile-completion"],
    queryFn: getCurrentPsychologistProfessionalProfileCompletion,
    enabled: isSubscriptionActive,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!isSubscriptionActive || !profileCompletionQuery.data) return;

    void refreshAuth();
    navigate(
      profileCompletionQuery.data.isComplete ? "/psi/dashboard" : psychologistPaymentProfileRoute,
      { replace: true },
    );
  }, [isSubscriptionActive, navigate, profileCompletionQuery.data, refreshAuth]);

  const isChecking =
    subscriptionQuery.isLoading ||
    (subscriptionQuery.isFetching && !subscriptionQuery.data) ||
    (isSubscriptionActive && profileCompletionQuery.isLoading);

  return (
    <AppLayout role="psychologist" userName={appUser?.fullName || "Profissional"}>
      <div className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center">
        <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
          {isChecking ? (
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
              <div>
                <h1 className="font-heading text-xl font-bold text-foreground">Verificando seu pagamento...</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Estamos consultando a confirmacao no servidor antes de liberar o proximo passo.
                </p>
              </div>
            </div>
          ) : subscriptionQuery.error ? (
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">Nao foi possivel verificar agora</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {subscriptionQuery.error instanceof Error
                  ? subscriptionQuery.error.message
                  : "Tente verificar novamente em alguns instantes."}
              </p>
              <Button
                type="button"
                onClick={() => void subscriptionQuery.refetch()}
                className="mt-5 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" />
                Verificar novamente
              </Button>
            </div>
          ) : profileCompletionQuery.error ? (
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">Pagamento confirmado</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Nao foi possivel verificar seu perfil profissional agora. Tente novamente para continuar.
              </p>
              <Button
                type="button"
                onClick={() => void profileCompletionQuery.refetch()}
                className="mt-5 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" />
                Verificar novamente
              </Button>
            </div>
          ) : (
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">
                Ainda nao identificamos a confirmacao do pagamento.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Assim que o Asaas confirmar o pagamento, vamos direcionar voce para finalizar o perfil ou abrir o Dashboard.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => void subscriptionQuery.refetch()}
                  disabled={subscriptionQuery.isFetching}
                  className="rounded-xl"
                >
                  {subscriptionQuery.isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Verificar novamente
                </Button>

                {currentPlan?.paymentUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openExternalUrl(currentPlan.paymentUrl)}
                    className="rounded-xl"
                  >
                    <CreditCard className="h-4 w-4" />
                    Abrir cobranca
                  </Button>
                ) : null}

                <Button type="button" variant="ghost" asChild className="rounded-xl">
                  <Link to="/psi/planos">
                    Ver planos
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
