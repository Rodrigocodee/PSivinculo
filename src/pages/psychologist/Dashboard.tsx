import { DeferredRecharts } from "@/components/charts/DeferredRecharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { getFirstName } from "@/services/currentPsychologist";
import { buscarDashboardPsicologo } from "@/services/dashboard";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock3,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type AgendaItem = {
  id: string;
  paciente_id: string;
  data_consulta: string;
  status: string;
  observacoes?: string | null;
  pacientes?: {
    id: string;
    nome: string;
  } | null;
};

type DashboardData = {
  todayKey: string;
  totalConsultasHoje: number;
  confirmadasHoje: number;
  pacientesAtivos: number;
  pacientesNovosMes: number;
  receitaMes: number;
  receitaPendente: number;
  consultasRealizadasMes: number;
  consultasCanceladasMes: number;
  agendaHoje: AgendaItem[];
  charts: {
    appointments: Array<{ month: string; total: number }>;
    revenue: Array<{ month: string; value: number }>;
  };
};

const initialDashboardData: DashboardData = {
  todayKey: "",
  totalConsultasHoje: 0,
  confirmadasHoje: 0,
  pacientesAtivos: 0,
  pacientesNovosMes: 0,
  receitaMes: 0,
  receitaPendente: 0,
  consultasRealizadasMes: 0,
  consultasCanceladasMes: 0,
  agendaHoje: [],
  charts: {
    appointments: [],
    revenue: [],
  },
};

const quickActions = [
  { label: "Novo Agendamento", hint: "Abrir agenda", path: "/psi/agenda", icon: Calendar, blockedInPreview: true },
  { label: "Novo Paciente", hint: "Cadastrar ficha", path: "/psi/pacientes/novo", icon: Users, blockedInPreview: true },
  { label: "Financeiro", hint: "Ver recebimentos", path: "/psi/financeiro", icon: DollarSign },
  { label: "Relatórios", hint: "Analisar métricas", path: "/psi/relatorios", icon: TrendingUp },
];

const scheduleStatusColors: Record<string, string> = {
  solicitada: "bg-primary/12 text-primary border-primary/20",
  confirmada: "bg-success/12 text-success border-success/20",
  pendente: "bg-warning/12 text-warning border-warning/20",
  contraproposta: "bg-info/12 text-info border-info/20",
  cancelada: "bg-destructive/12 text-destructive border-destructive/20",
  recusada: "bg-destructive/12 text-destructive border-destructive/20",
  realizada: "bg-muted text-muted-foreground border-border",
  faltou: "bg-destructive/12 text-destructive border-destructive/20",
  reagendada: "bg-info/12 text-info border-info/20",
};

const scheduleStatusLabels: Record<string, string> = {
  solicitada: "Solicitada",
  confirmada: "Confirmada",
  pendente: "Pendente",
  contraproposta: "Contraproposta",
  cancelada: "Cancelada",
  recusada: "Recusada",
  realizada: "Realizada",
  faltou: "Faltou",
  reagendada: "Reagendada",
};

const revenueTooltip = (value: number) => [`R$ ${value.toLocaleString("pt-BR")}`, "Receita"];
const appointmentTooltip = (value: number) => [`${value}`, "Atendimentos"];

function formatDateLong(dateString: string) {
  if (!dateString) return "Hoje";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Hoje";

  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getGreetingForHour(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour <= 11) return "Bom dia";
  if (hour >= 12 && hour <= 17) return "Boa tarde";
  return "Boa noite";
}

export default function PsychologistDashboard() {
  const { data: currentProfile } = useCurrentPsychologistProfile();
  const [dashboardData, setDashboardData] = useState<DashboardData>(initialDashboardData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const data = await buscarDashboardPsicologo();
        setDashboardData(data);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        setDashboardData(initialDashboardData);
      } finally {
        setIsLoading(false);
      }
    }

    carregarDashboard();
  }, []);

  const upcomingAppointment = dashboardData.agendaHoje[0] ?? null;
  const psychologistFullName = currentProfile?.fullName?.trim() || "Profissional";
  const greetingName = getFirstName(psychologistFullName) || "Profissional";
  const greeting = getGreetingForHour();

  const kpis = useMemo(
    () => [
      {
        label: "Consultas Hoje",
        value: dashboardData.totalConsultasHoje.toString(),
        support: `${dashboardData.confirmadasHoje} confirmadas`,
        icon: Calendar,
        color: "text-primary",
        iconBg: "bg-primary/12",
        accent: "from-primary/20 via-primary/5 to-transparent",
      },
      {
        label: "Pacientes Ativos",
        value: dashboardData.pacientesAtivos.toString(),
        support: `+${dashboardData.pacientesNovosMes} novos no mês`,
        icon: Users,
        color: "text-secondary",
        iconBg: "bg-secondary/12",
        accent: "from-secondary/20 via-secondary/5 to-transparent",
      },
      {
        label: "Receita do Mês",
        value: `R$ ${dashboardData.receitaMes.toLocaleString("pt-BR")}`,
        support: `${dashboardData.consultasRealizadasMes} sessões realizadas`,
        icon: DollarSign,
        color: "text-success",
        iconBg: "bg-success/12",
        accent: "from-success/20 via-success/5 to-transparent",
      },
      {
        label: "Receita Pendente",
        value: `R$ ${dashboardData.receitaPendente.toLocaleString("pt-BR")}`,
        support: `${dashboardData.consultasCanceladasMes} cancelamentos no mês`,
        icon: AlertCircle,
        color: "text-warning",
        iconBg: "bg-warning/12",
        accent: "from-warning/20 via-warning/5 to-transparent",
      },
    ],
    [dashboardData],
  );

  if (isLoading) {
    return (
      <AppLayout role="psychologist" userName={psychologistFullName}>
        <div className="space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Carregando dashboard...</h1>
            <p className="text-muted-foreground mt-1">Buscando os dados mais recentes da sua operação.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="psychologist" userName={psychologistFullName}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">Visão do dia</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-[-0.03em] text-foreground">
              {greeting}, {greetingName}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Aqui está o resumo da sua operação em {formatDateLong(dashboardData.todayKey)}, com foco nas consultas do dia e no desempenho do mês.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 premium-shadow">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Performance</p>
              <p className="text-sm font-semibold text-foreground">{dashboardData.consultasRealizadasMes} sessões concluídas no mês</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => (
            <div
              key={item.label}
              className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 premium-shadow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accent}`} />
              <div className="relative flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className={`text-3xl font-bold tracking-[-0.03em] ${item.color}`}>{item.value}</p>
                  <p className="text-sm text-muted-foreground">{item.support}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.iconBg}`}>
                  <item.icon className={`h-5 w-5 ${item.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="rounded-2xl border border-border/70 bg-card p-6 premium-shadow">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Agenda de Hoje</p>
                <h2 className="mt-1 font-heading text-2xl font-semibold text-foreground">Sua principal prioridade do dia</h2>
              </div>
              <Link to="/psi/agenda" className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80">
                Ver completa <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="space-y-3">
              {dashboardData.agendaHoje.length > 0 ? dashboardData.agendaHoje.map((appointment) => {
                const date = new Date(appointment.data_consulta);
                const time = Number.isNaN(date.getTime())
                  ? "--:--"
                  : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                return (
                  <div
                    key={appointment.id}
                    className="flex items-center gap-4 rounded-xl border border-border/70 bg-background/80 px-4 py-4 transition-all hover:border-primary/20 hover:bg-muted/40"
                  >
                    <div className="min-w-[68px] rounded-xl bg-muted px-3 py-2 text-center">
                      <p className="text-base font-semibold text-foreground">{time}</p>
                      <p className="text-xs text-muted-foreground">50min</p>
                    </div>

                    <div className="h-12 w-px rounded-full bg-border" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{appointment.pacientes?.nome ?? "Paciente"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Sessão Individual · Sala 1</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${scheduleStatusColors[appointment.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {scheduleStatusLabels[appointment.status] ?? appointment.status}
                        </span>
                      </div>
                      {appointment.observacoes && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{appointment.observacoes}</p>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  Nenhuma consulta encontrada para hoje.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border/70 bg-card p-5 premium-shadow">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Atalhos</p>
                  <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">Ações rápidas</h2>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action) => (
                  <Link
                    key={action.label}
                    to={action.path}
                    {...(action.blockedInPreview
                      ? getProfessionalPreviewActionProps({
                          description: PREVIEW_FEATURE_LOCK_MESSAGE,
                        })
                      : {})}
                    className="group rounded-2xl border border-border/70 bg-background/70 p-4 transition-all hover:border-primary/20 hover:bg-muted/50 hover:shadow-sm"
                  >
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <action.icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{action.hint}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card p-5 premium-shadow">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Próxima Consulta</p>
                  <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">Prepare o próximo atendimento</h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Clock3 className="h-5 w-5 text-primary" />
                </div>
              </div>

              {upcomingAppointment ? (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-primary">Hoje</p>
                      <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-foreground">
                        {new Date(upcomingAppointment.data_consulta).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${scheduleStatusColors[upcomingAppointment.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {scheduleStatusLabels[upcomingAppointment.status] ?? upcomingAppointment.status}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">{upcomingAppointment.pacientes?.nome ?? "Paciente"}</p>
                    <p className="text-sm text-muted-foreground">Sessão Individual · Sala 1</p>
                    <p className="text-xs text-muted-foreground">{upcomingAppointment.observacoes || "Sem observações registradas."}</p>
                  </div>
                  <Link
                    to="/psi/agenda"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Abrir agenda completa <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  Nenhuma consulta futura encontrada para hoje.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-5 premium-shadow">
            <div className="mb-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Atendimentos</p>
              <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">Evolução mensal</h2>
            </div>
            <DeferredRecharts fallback={<div className="h-[240px] animate-pulse rounded-xl bg-muted/40" />}>
              {({ Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dashboardData.charts.appointments} barCategoryGap={18}>
                    <CartesianGrid vertical={false} strokeDasharray="2 6" stroke="hsl(220 20% 91%)" />
                    <XAxis axisLine={false} tickLine={false} dataKey="month" tick={{ fontSize: 12, fill: "hsl(220 15% 46%)" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(220 15% 46%)" }} />
                    <Tooltip
                      cursor={{ fill: "hsl(220 30% 96%)" }}
                      contentStyle={{ borderRadius: "16px", border: "1px solid hsl(220 20% 90%)", boxShadow: "0 8px 24px rgba(31,41,55,0.08)" }}
                      formatter={appointmentTooltip}
                    />
                    <Bar dataKey="total" fill="hsl(220 65% 60%)" radius={[10, 10, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DeferredRecharts>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 premium-shadow">
            <div className="mb-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Receita</p>
              <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">Faturamento mensal</h2>
            </div>
            <DeferredRecharts fallback={<div className="h-[240px] animate-pulse rounded-xl bg-muted/40" />}>
              {({ Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={dashboardData.charts.revenue}>
                    <defs>
                      <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(175 35% 55%)" stopOpacity={0.34} />
                        <stop offset="100%" stopColor="hsl(175 35% 55%)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="2 6" stroke="hsl(220 20% 91%)" />
                    <XAxis axisLine={false} tickLine={false} dataKey="month" tick={{ fontSize: 12, fill: "hsl(220 15% 46%)" }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(220 15% 46%)" }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: "16px", border: "1px solid hsl(220 20% 90%)", boxShadow: "0 8px 24px rgba(31,41,55,0.08)" }}
                      formatter={revenueTooltip}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(175 35% 55%)" fill="url(#dashboardRevenue)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </DeferredRecharts>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
