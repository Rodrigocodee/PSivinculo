import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  fetchPatientDashboardData,
  type PatientDashboardAppointment,
  type PatientDashboardPayment,
} from "@/services/patientDashboard";

const historyStatusClasses: Record<string, string> = {
  solicitada: "bg-primary/10 text-primary",
  realizada: "bg-success/10 text-success",
  confirmada: "bg-primary/10 text-primary",
  pendente: "bg-warning/10 text-warning",
  contraproposta: "bg-info/10 text-info",
  faltou: "bg-destructive/10 text-destructive",
  recusada: "bg-destructive/10 text-destructive",
  reagendada: "bg-muted text-muted-foreground",
};

const historyStatusLabels: Record<string, string> = {
  solicitada: "Solicitada",
  realizada: "Realizada",
  confirmada: "Confirmada",
  pendente: "Pendente",
  contraproposta: "Contraproposta",
  faltou: "Nao compareceu",
  recusada: "Recusada",
  reagendada: "Reagendada",
};

function getFirstName(name: string) {
  return name.trim().split(/\s+/).filter(Boolean)[0] || "Paciente";
}

function formatDate(value: string | null) {
  if (!value) return "Data indisponivel";

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Data indisponivel";

  return parsedDate.toLocaleDateString("pt-BR");
}

function formatTime(value: string | null) {
  if (!value) return "Horario indisponivel";

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Horario indisponivel";

  return parsedDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getPaymentStatusLabel(_status: string) {
  return "Aguardando pagamento";
}

function buildAppointmentMeta(appointment: PatientDashboardAppointment) {
  const details = [appointment.psychologistName];
  if (appointment.sessionType) {
    details.push(appointment.sessionType);
  }

  return details.filter(Boolean).join(" · ");
}

function buildPendingPaymentDateTime(payment: PatientDashboardPayment) {
  return `${formatDate(payment.dateTime)} as ${formatTime(payment.dateTime)}`;
}

function LoadingCard({ muted = false }: { muted?: boolean }) {
  return (
    <div className={`${muted ? "bg-card" : "bg-primary/5 border-primary/20"} rounded-xl border border-border p-6`}>
      <div className="animate-pulse space-y-4">
        <div className="h-5 w-40 rounded-full bg-muted" />
        <div className="h-8 w-52 rounded-full bg-muted" />
        <div className="h-4 w-44 rounded-full bg-muted" />
        <div className="h-10 w-32 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function LoadingHistory() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-lg bg-muted/50 p-3">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-36 rounded-full bg-muted" />
            <div className="h-3 w-48 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PatientDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient-dashboard"],
    queryFn: fetchPatientDashboardData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const patientName = data?.patient.fullName || "Paciente";
  const firstName = getFirstName(patientName);
  const nextAppointment = data?.nextAppointment ?? null;
  const pendingPayments = data?.pendingPayments ?? [];
  const recentHistory = data?.recentHistory ?? [];

  return (
    <AppLayout role="patient" userName={patientName}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Ola, {firstName}</h1>
          <p className="mt-1 text-muted-foreground">
            {data?.hasLinkedPatientRecord === false
              ? "Assim que sua conta estiver vinculada aos atendimentos, suas informacoes aparecerao aqui."
              : "Bem-vindo ao seu painel."}
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar sua dashboard agora."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {isLoading ? (
            <LoadingCard />
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">Proxima Consulta</h2>
              </div>

              {nextAppointment ? (
                <>
                  <p className="text-2xl font-bold text-primary">
                    {formatDate(nextAppointment.dateTime)} · {formatTime(nextAppointment.dateTime)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {buildAppointmentMeta(nextAppointment)}
                  </p>
                  <div className="mt-4">
                    <Link
                      to="/paciente/agendamentos"
                      className="inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground gradient-primary"
                    >
                      Ver agenda
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-foreground">Nenhuma consulta futura agendada</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Quando um novo horario for confirmado, ele aparecera aqui.
                  </p>
                  <div className="mt-4">
                    <Link
                      to="/paciente/agendamentos"
                      className="inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                    >
                      Ver agenda
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}

          {isLoading ? (
            <LoadingCard muted />
          ) : (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-warning" />
                <h2 className="font-heading font-semibold text-foreground">Pagamento Pendente</h2>
              </div>

              {pendingPayments.length > 0 ? (
                <div className="space-y-3">
                  {pendingPayments.map((payment) => (
                    <div key={payment.id} className="rounded-xl border border-warning/20 bg-warning/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {payment.psychologistName}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {buildPendingPaymentDateTime(payment)}
                          </p>
                          <p className="mt-2 text-base font-semibold text-warning">
                            {typeof payment.amount === "number"
                              ? formatCurrency(payment.amount)
                              : "Valor nao informado"}
                          </p>
                        </div>
                        <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                          {getPaymentStatusLabel(payment.status)}
                        </span>
                      </div>

                      {payment.paymentUrl ? (
                        <a
                          href={payment.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground gradient-primary"
                        >
                          Pagar consulta
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-lg font-semibold text-foreground">Nenhum pagamento pendente</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seus recebimentos pendentes aparecerao aqui quando houver algo em aberto.
                  </p>
                  <Link
                    to="/paciente/recibos"
                    className="mt-4 inline-flex rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Ver recibos
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-heading font-semibold text-foreground">Historico Recente</h2>

          {isLoading ? (
            <LoadingHistory />
          ) : recentHistory.length > 0 ? (
            <div className="space-y-3">
              {recentHistory.map((appointment) => {
                const normalizedStatus = appointment.status.trim().toLowerCase();
                const statusClassName =
                  historyStatusClasses[normalizedStatus] || "bg-muted text-muted-foreground";
                const statusLabel = historyStatusLabels[normalizedStatus] || appointment.status || "Atualizada";

                return (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {appointment.sessionType || "Consulta"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(appointment.dateTime)} · {appointment.psychologistName}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName}`}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
              Seu historico recente aparecera aqui conforme suas consultas forem acontecendo.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
