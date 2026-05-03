import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Filter, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentPsychologistPaymentSettings } from "@/hooks/use-current-psychologist-payment-settings";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import {
  getPsychologistReceivables,
  PSYCHOLOGIST_PAYMENT_STATUS_LABELS,
  type PsychologistConsultationRecord,
} from "@/services/psychologistFinancialData";

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPaymentDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR");
}

function formatCurrentMonthLabel(date: Date) {
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getPaymentStatusBadgeClassName(
  status: PsychologistConsultationRecord["paymentStatus"],
) {
  if (status === "pago") return "bg-success/10 text-success";
  if (status === "aguardando_pagamento") return "bg-warning/10 text-warning";
  if (status === "vencido" || status === "erro") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

export default function PsychologistReceivables() {
  const { data: currentProfile } = useCurrentPsychologistProfile();
  const { data: paymentSettings } = useCurrentPsychologistPaymentSettings();
  const [receivables, setReceivables] = useState<PsychologistConsultationRecord[]>([]);
  const [monthOptions, setMonthOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [totalReceivedAmount, setTotalReceivedAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReceivables() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getPsychologistReceivables({
          monthKey: selectedMonth || null,
        });
        if (!active) return;

        setReceivables(data.receivables);
        setMonthOptions(data.monthOptions);
        setSelectedMonth(data.selectedMonth);
        setTotalReceivedAmount(data.totalReceivedAmount);
      } catch (error) {
        console.error("[Psivinculo][receivables][load_error]", error);
        if (!active) return;
        setReceivables([]);
        setMonthOptions([]);
        setTotalReceivedAmount(0);
        setErrorMessage("Nao foi possivel carregar os recebimentos agora.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadReceivables();

    return () => {
      active = false;
    };
  }, [selectedMonth]);

  const selectedMonthLabel = useMemo(() => {
    return monthOptions.find((option) => option.value === selectedMonth)?.label ||
      formatCurrentMonthLabel(new Date());
  }, [monthOptions, selectedMonth]);

  return (
    <AppLayout
      role="psychologist"
      userName={currentProfile?.fullName?.trim() || "Profissional"}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Recebimentos
            </h1>
            <p className="mt-1 text-muted-foreground">
              Acompanhe cobrancas Asaas Split e o total real recebido nas consultas.
            </p>
          </div>

          <Link
            to="/psi/configuracoes/financeiro"
            className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
          >
            Ajustar configuracoes
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Recebido em {selectedMonthLabel}</p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              {formatCurrency(totalReceivedAmount)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Split configurado</p>
            <p className="mt-2 text-3xl font-bold text-foreground">
              95%
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Wallet: {paymentSettings?.asaasWalletId || "Nao informado"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="bg-transparent text-sm text-muted-foreground outline-none"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center gap-3 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando recebimentos...
            </div>
          ) : errorMessage ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">{errorMessage}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Paciente
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Data
                    </th>
                    <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">
                      Forma
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                      Cobranca
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.length > 0 ? (
                    receivables.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b border-border transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {payment.patientName}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatPaymentDate(payment.consultationDateTime)}
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          {payment.billingTypeLabel}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {formatCurrency(payment.consultationValue ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${getPaymentStatusBadgeClassName(payment.paymentStatus)}`}
                          >
                            {PSYCHOLOGIST_PAYMENT_STATUS_LABELS[payment.paymentStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {payment.paymentLink ? (
                            <a
                              href={payment.paymentLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              Abrir
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhuma cobranca encontrada para este psicologo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
