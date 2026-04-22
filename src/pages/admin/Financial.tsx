import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, DollarSign, Filter, TrendingUp, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DeferredRecharts } from "@/components/charts/DeferredRecharts";
import {
  adminFinancialQueryKey,
  fetchAdminFinancialData,
} from "@/services/adminFinancial";

const paymentMethodColors = [
  "hsl(175, 35%, 55%)",
  "hsl(220, 65%, 60%)",
  "hsl(260, 45%, 70%)",
  "hsl(38, 90%, 55%)",
  "hsl(155, 50%, 45%)",
];

function formatCurrency(value: number | null) {
  if (value == null) return "—";

  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPaymentDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("pt-BR");
}

function FinancialLoadingState() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/70" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted/70" />
                <div className="h-7 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/70" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-5">
            <div className="h-5 w-44 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-[220px] animate-pulse rounded-xl bg-muted/50" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="h-6 w-44 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminFinancial() {
  const { data, isLoading, error } = useQuery({
    queryKey: adminFinancialQueryKey,
    queryFn: fetchAdminFinancialData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [selectedMonth, setSelectedMonth] = useState("");

  useEffect(() => {
    if (!data?.monthOptions.length) return;

    setSelectedMonth((current) => {
      if (current && data.monthOptions.some((option) => option.value === current)) {
        return current;
      }

      return data.monthOptions[0]?.value || "";
    });
  }, [data?.monthOptions]);

  const adminName = data?.adminName || "Administrador(a)";

  const filteredPayments = useMemo(() => {
    if (!data?.payments) return [];
    if (!selectedMonth) return data.payments;

    return data.payments.filter((payment) => payment.monthKey === selectedMonth);
  }, [data?.payments, selectedMonth]);

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <FinancialLoadingState />
      </AppLayout>
    );
  }

  const subtitle = data?.hasClinicScope
    ? `Visao financeira consolidada da ${data.clinicName || "clinica"}.`
    : "Clinica nao vinculada.";

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Financeiro Geral</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os dados financeiros reais da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Vincule uma clinica ao usuario administrativo para visualizar o financeiro real.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total Recebido",
              value: formatCurrency(data?.totalReceived ?? 0),
              icon: TrendingUp,
              color: "text-success",
              bg: "bg-success/10",
            },
            {
              label: "Total Pendente",
              value: formatCurrency(data?.totalPending ?? 0),
              icon: AlertCircle,
              color: "text-warning",
              bg: "bg-warning/10",
            },
            {
              label: "Profissionais",
              value: String(data?.psychologistsCount ?? 0),
              icon: Users,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              label: "Repasses",
              value: formatCurrency(data?.transfersValue ?? null),
              icon: DollarSign,
              color: "text-accent",
              bg: "bg-accent/10",
            },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={`mt-1 text-xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Receita por Profissional</h2>
            {data?.hasProfessionalRevenueData ? (
              <DeferredRecharts fallback={<div className="mt-4 h-[220px] animate-pulse rounded-xl bg-muted/50" />}>
                {({ Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.professionalRevenueChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }}
                        width={130}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), "Receita"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }}
                      />
                      <Bar dataKey="value" fill="hsl(220, 65%, 60%)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </DeferredRecharts>
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-xl bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                Ainda nao ha pagamentos reais suficientes para consolidar receita por profissional.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Forma de Pagamento</h2>
            {data?.hasPaymentMethodData ? (
              <>
                <DeferredRecharts fallback={<div className="h-[180px] animate-pulse rounded-xl bg-muted/50" />}>
                  {({ Cell, Pie, PieChart, ResponsiveContainer, Tooltip }) => (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={data.paymentMethodChart}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          dataKey="value"
                          paddingAngle={4}
                        >
                          {data.paymentMethodChart.map((entry, index) => (
                            <Cell key={`${entry.name}-${index}`} fill={paymentMethodColors[index % paymentMethodColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </DeferredRecharts>
                <div className="mt-2 flex flex-wrap justify-center gap-4">
                  {data.paymentMethodChart.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ background: paymentMethodColors[index % paymentMethodColors.length] }}
                      />
                      <span className="text-muted-foreground">{entry.name} ({entry.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded-xl bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                A distribuicao por forma de pagamento aparecera aqui assim que houver valores reais nesse campo.
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-transparent text-sm text-muted-foreground outline-none"
            >
              {data?.monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Paciente</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Data</th>
                  <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Forma</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Valor</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length > 0 ? (
                  filteredPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{payment.patientName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatPaymentDate(payment.date)}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{payment.method || "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            payment.statusTone === "success"
                              ? "bg-success/10 text-success"
                              : payment.statusTone === "warning"
                                ? "bg-warning/10 text-warning"
                                : payment.statusTone === "destructive"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {payment.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhum pagamento real foi encontrado para o periodo selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
