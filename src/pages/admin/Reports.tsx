import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, DollarSign, Download, Users, XCircle } from "lucide-react";
import { DeferredRecharts } from "@/components/charts/DeferredRecharts";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  adminReportsQueryKey,
  fetchAdminReportsData,
} from "@/services/adminReports";

function formatCompactCurrency(value: number | null) {
  if (value == null) return "--";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number | null) {
  if (value == null) return "--";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function renderMetricValue(value: number | null, formatter?: (value: number | null) => string) {
  if (formatter) return formatter(value);
  if (value == null) return "--";
  return value.toString();
}

function ReportsLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-72 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="flex gap-3">
          <div className="h-11 w-36 animate-pulse rounded-xl bg-muted/70" />
          <div className="h-11 w-36 animate-pulse rounded-xl bg-muted/70" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="stat-card space-y-3 text-center">
            <div className="mx-auto h-5 w-5 animate-pulse rounded bg-muted/70" />
            <div className="mx-auto h-7 w-20 animate-pulse rounded bg-muted" />
            <div className="mx-auto h-4 w-24 animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-[250px] animate-pulse rounded-xl bg-muted/50" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-5 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const { data, isLoading, error } = useQuery({
    queryKey: adminReportsQueryKey,
    queryFn: fetchAdminReportsData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const adminName = data?.adminName || "Administrador(a)";

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <ReportsLoadingState />
      </AppLayout>
    );
  }

  const subtitle = data?.hasClinicScope
    ? `Indicadores gerais da ${data.clinicName || "clinica"} - ${data.currentMonthLabel}`
    : `Clinica nao vinculada - ${data?.currentMonthLabel || ""}`;

  const stats = [
    {
      label: "Consultas/Mes",
      value: renderMetricValue(data?.consultationsThisMonth ?? 0),
      icon: Calendar,
      color: "text-primary",
    },
    {
      label: "Pacientes Novos",
      value: renderMetricValue(data?.newPatientsThisMonth ?? null),
      icon: Users,
      color: "text-secondary",
    },
    {
      label: "Faturamento",
      value: renderMetricValue(data?.revenueThisMonth ?? null, formatCompactCurrency),
      icon: DollarSign,
      color: "text-success",
    },
    {
      label: "Cancelamentos",
      value: renderMetricValue(data?.cancellationsThisMonth ?? 0),
      icon: XCircle,
      color: "text-destructive",
    },
  ];

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Relatorios Administrativos</h1>
            <p className="mt-1 text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled
              title="Exportacao ainda nao disponivel nesta tela"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground opacity-60"
            >
              <Download className="h-4 w-4" /> Exportar PDF
            </button>
            <button
              type="button"
              disabled
              title="Exportacao ainda nao disponivel nesta tela"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground opacity-60"
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os relatorios reais da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Vincule uma clinica ao usuario administrativo para visualizar os relatorios reais.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card text-center">
              <stat.icon className={`mx-auto mb-2 h-5 w-5 ${stat.color}`} />
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Consultas por Mes</h2>
            {data?.hasAppointmentChartData ? (
              <DeferredRecharts fallback={<div className="mt-4 h-[250px] animate-pulse rounded-xl bg-muted/50" />}>
                {({ Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.appointmentChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                      <Bar dataKey="total" fill="hsl(220, 65%, 60%)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </DeferredRecharts>
            ) : (
              <div className="flex h-[250px] items-center justify-center rounded-xl bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                Nenhuma consulta real da clinica foi encontrada no periodo analisado.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Faturamento</h2>
            {data?.hasRevenueChartData ? (
              <DeferredRecharts fallback={<div className="mt-4 h-[250px] animate-pulse rounded-xl bg-muted/50" />}>
                {({ Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={data.revenueChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                      <YAxis
                        tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), "Receita"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(155, 50%, 45%)"
                        fill="hsl(155, 50%, 45%)"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </DeferredRecharts>
            ) : (
              <div className="flex h-[250px] items-center justify-center rounded-xl bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                {data?.hasRevenueMetric
                  ? "Os pagamentos reais da clinica ainda nao geraram faturamento consolidado para este grafico."
                  : "A base atual ainda nao permite consolidar faturamento real com seguranca nesta tela."}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-heading font-semibold text-foreground">Profissionais com mais Atendimentos</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left font-semibold text-muted-foreground">Profissional</th>
                <th className="py-2 text-center font-semibold text-muted-foreground">Atendimentos</th>
                <th className="py-2 text-center font-semibold text-muted-foreground">Faturamento</th>
                <th className="py-2 text-center font-semibold text-muted-foreground">Ocupacao</th>
              </tr>
            </thead>
            <tbody>
              {data?.hasProfessionalRankingData ? (
                data.professionalRanking.map((professional) => (
                  <tr key={professional.id} className="border-b border-border">
                    <td className="py-3 font-medium text-foreground">{professional.name}</td>
                    <td className="py-3 text-center text-muted-foreground">{professional.appointments}</td>
                    <td className="py-3 text-center text-muted-foreground">{formatCurrency(professional.revenue)}</td>
                    <td className="py-3 text-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          professional.occupancy == null
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {professional.occupancy == null ? "--" : `${professional.occupancy}%`}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Ainda nao ha atendimentos reais suficientes para montar o ranking de profissionais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
