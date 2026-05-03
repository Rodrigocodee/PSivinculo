import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCurrentPsychologistPaymentSettings } from "@/hooks/use-current-psychologist-payment-settings";
import { isPsychologistReceivablesEnabled } from "@/services/psychologistPaymentSettings";

type RequirePsychologistReceivablesEnabledProps = {
  children: ReactNode;
};

function FullScreenState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function RequirePsychologistReceivablesEnabled({
  children,
}: RequirePsychologistReceivablesEnabledProps) {
  const location = useLocation();
  const { data, isLoading, isError } = useCurrentPsychologistPaymentSettings();

  if (isLoading) {
    return <FullScreenState message="Carregando configuracoes de recebimento..." />;
  }

  if (isError) {
    return <FullScreenState message="Nao foi possivel validar as configuracoes de recebimento." />;
  }

  if (!isPsychologistReceivablesEnabled(data)) {
    return (
      <Navigate
        to="/configuracoes"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  return <>{children}</>;
}
