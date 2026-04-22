import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, DollarSign, Percent, UserPlus, Users } from "lucide-react";
import { DeferredRecharts } from "@/components/charts/DeferredRecharts";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  adminDashboardQueryKey,
  fetchAdminDashboardData,
} from "@/services/adminDashboard";

const colors = [
  "hsl(220, 65%, 60%)",
  "hsl(175, 35%, 55%)",
  "hsl(260, 45%, 70%)",
  "hsl(38, 90%, 55%)",
  "hsl(155, 50%, 45%)",
  "hsl(210, 50%, 55%)",
];

function formatCompactCurrency(value: number | null) {
  if (value == null) return "--";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function renderCardValue(value: number | null, formatter?: (value: number | null) => string) {
  if (formatter) return formatter(value);
  if (value == null) return "--";
  return value.toString();
}

function DashboardLoadingState() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/70" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="stat-card space-y-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/70" />
            <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-[250px] animate-pulse rounded-xl bg-muted/50" />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-[240px] animate-pulse rounded-xl bg-muted/50" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-[250px] animate-pulse rounded-xl bg-muted/50" />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: adminDashboardQueryKey,
    queryFn: fetchAdminDashboardData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const adminName = data?.adminName || "Administrador(a)";

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <DashboardLoadingState />
      </AppLayout>
    );
  }

  const subtitle = data?.hasClinicScope
    ? `Visao geral da ${data?.clinicName || "clinica"} - ${data?.currentMonthLabel || ""}`
    : `Clinica nao vinculada - ${data?.currentMonthLabel || ""}`;

  const stats = [
    {
      label: "Psicologos",
      value: renderCardValue(data?.psychologistCount ?? 0),
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Pacientes Ativos",
      value: renderCardValue(data?.activePatientsCount ?? 0),
      icon: Users,
      color: "text-secondary",
      bg: "bg-secondary/10",
    },
    {
      label: "Consultas/Mes",
      value: renderCardValue(data?.appointmentsThisMonth ?? 0),
      icon: Calendar,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Faturamento",
      value: renderCardValue(data?.revenueThisMonth ?? null, formatCompactCurrency),
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Faltas",
      value: renderCardValue(data?.missedAppointmentsCount ?? 0),
      icon: UserPlus,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Ocupacao",
      value: data?.occupancyRate != null ? `${data.occupancyRate}%` : "--",
      icon: Percent,
      color: "text-accent",
      bg: "bg-accent/10",
    },
  ];

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Dashboard Administrativo</h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar a visao administrativa da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Vincule uma clinica ao usuario administrativo para visualizar os indicadores consolidados.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
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
                Nenhuma consulta da clinica foi encontrada no periodo analisado.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Por Profissional</h2>
            {data?.hasProfessionalChartData ? (
              <>
                <DeferredRecharts fallback={<div className="h-[200px] animate-pulse rounded-xl bg-muted/50" />}>
                  {({ Cell, Pie, PieChart, ResponsiveContainer, Tooltip }) => (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={data.professionalChart}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="value"
                          paddingAngle={4}
                        >
                          {data.professionalChart.map((_, index) => (
                            <Cell key={index} fill={colors[index % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </DeferredRecharts>
                <div className="mt-2 space-y-2">
                  {data.professionalChart.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ background: colors[index % colors.length] }}
                        />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[240px] items-center justify-center rounded-xl bg-muted/30 px-6 text-center text-sm text-muted-foreground">
                Ainda nao ha dados suficientes para distribuir consultas por profissional.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-heading font-semibold text-foreground">Faturamento Mensal</h2>
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
                      formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"]}
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
              Os dados de faturamento aparecerao aqui assim que houver pagamentos reais consolidados para a clinica.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
