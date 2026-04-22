import { DeferredRecharts } from "@/components/charts/DeferredRecharts";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { buscarRelatorioPsicologo, type RelatorioMensal } from "@/services/financeiro";
import { Calendar, Users, XCircle, UserMinus, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

export default function PsychologistReports() {
  const { data: profile } = useCurrentPsychologistProfile();
  const [activePatients, setActivePatients] = useState(0);
  const [monthlyData, setMonthlyData] = useState<RelatorioMensal[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [charts, setCharts] = useState<{
    appointments: Array<{ month: string; total: number }>;
    revenue: Array<{ month: string; value: number }>;
  }>({
    appointments: [],
    revenue: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  useEffect(() => {
    async function carregarRelatorios() {
      try {
        const data = await buscarRelatorioPsicologo();
        setActivePatients(data.activePatients);
        setMonthlyData(data.monthly);
        setCharts(data.charts);
        setSelectedMonth((current) => current || data.monthly[new Date().getMonth()]?.monthKey || data.monthly[0]?.monthKey || "");
      } catch (error) {
        console.error("Erro ao carregar relatorios:", error);
        setActivePatients(0);
        setMonthlyData([]);
        setCharts({ appointments: [], revenue: [] });
      } finally {
        setIsLoading(false);
      }
    }

    carregarRelatorios();
  }, []);

  const currentMonth = useMemo(() => {
    return monthlyData.find((month) => month.monthKey === selectedMonth) ?? null;
  }, [monthlyData, selectedMonth]);

  const pieData = useMemo(() => {
    const month = currentMonth ?? {
      completedAppointments: 0,
      cancelledAppointments: 0,
      missedAppointments: 0,
    };

    return [
      { name: "Realizadas", value: month.completedAppointments, color: "hsl(155, 50%, 45%)" },
      { name: "Canceladas", value: month.cancelledAppointments, color: "hsl(0, 65%, 55%)" },
      { name: "Faltas", value: month.missedAppointments, color: "hsl(38, 90%, 55%)" },
    ];
  }, [currentMonth]);

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Relatorios</h1>
            <p className="text-muted-foreground mt-1">Analise de desempenho e indicadores.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-sm outline-none text-muted-foreground"
              >
                {monthlyData.map((item) => (
                  <option key={item.monthKey} value={item.monthKey}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total de Consultas", value: currentMonth?.totalAppointments ?? 0, icon: Calendar, color: "text-primary" },
            { label: "Realizadas", value: currentMonth?.completedAppointments ?? 0, icon: Calendar, color: "text-success" },
            { label: "Cancelamentos", value: currentMonth?.cancelledAppointments ?? 0, icon: XCircle, color: "text-destructive" },
            { label: "Faltas", value: currentMonth?.missedAppointments ?? 0, icon: UserMinus, color: "text-warning" },
            { label: "Pacientes Ativos", value: activePatients, icon: Users, color: "text-secondary" },
          ].map((s, i) => (
            <div key={i} className="stat-card text-center">
              <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-4">Atendimentos por Mes</h2>
            {isLoading ? (
              <div className="h-[250px] flex items-center text-sm text-muted-foreground">Carregando grafico...</div>
            ) : (
              <DeferredRecharts fallback={<div className="h-[250px] animate-pulse rounded-xl bg-muted/40" />}>
                {({ Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={charts.appointments}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                      <Bar dataKey="total" fill="hsl(220, 65%, 60%)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </DeferredRecharts>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-4">Resultado das Consultas</h2>
            {isLoading ? (
              <div className="h-[250px] flex items-center text-sm text-muted-foreground">Carregando grafico...</div>
            ) : (
              <>
                <DeferredRecharts fallback={<div className="h-[250px] animate-pulse rounded-xl bg-muted/40" />}>
                  {({ Cell, Pie, PieChart, ResponsiveContainer, Tooltip }) => (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={4}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </DeferredRecharts>
                <div className="flex justify-center gap-6 mt-2">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-heading font-semibold text-foreground">Faturamento Mensal</h2>
            <p className="text-sm text-muted-foreground">{formatCurrency(currentMonth?.revenue ?? 0)} no periodo selecionado</p>
          </div>
          {isLoading ? (
            <div className="h-[250px] flex items-center text-sm text-muted-foreground">Carregando grafico...</div>
          ) : (
            <DeferredRecharts fallback={<div className="h-[250px] animate-pulse rounded-xl bg-muted/40" />}>
              {({ Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis }) => (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={charts.revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} />
                    <YAxis tick={{ fontSize: 12, fill: "hsl(220, 15%, 50%)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), "Receita"]} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220, 20%, 90%)" }} />
                    <Area type="monotone" dataKey="value" stroke="hsl(175, 35%, 55%)" fill="hsl(175, 35%, 55%)" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </DeferredRecharts>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
