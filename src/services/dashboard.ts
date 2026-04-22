import { getPsychologistServiceScope } from "@/services/psychologistScope";
import { supabase } from "../lib/supabase";

type DashboardConsulta = {
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

type DashboardPaciente = {
  id: string;
  ativo: boolean | null;
  created_at?: string | null;
};

type DashboardPagamento = Record<string, unknown>;

function getPaymentStatus(payment: DashboardPagamento) {
  const raw = payment.status;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNumericPaymentValue(payment: DashboardPagamento) {
  const possibleKeys = ["valor", "amount", "valor_pago", "total", "preco"];

  for (const key of possibleKeys) {
    const raw = payment[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return 0;
}

function getPaymentDate(payment: DashboardPagamento) {
  const possibleKeys = ["data_pagamento", "data", "created_at", "updated_at", "data_vencimento"];

  for (const key of possibleKeys) {
    const raw = payment[key];
    if (typeof raw === "string" && raw) return raw;
  }

  return null;
}

function isSameMonth(dateString: string | null, reference: Date) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
}

function isClosedConsultaStatus(status: string | null | undefined) {
  const normalizedStatus = status?.trim().toLowerCase() || "";
  return normalizedStatus === "cancelada" || normalizedStatus === "recusada";
}

export async function buscarDashboardPsicologo() {
  const scope = await getPsychologistServiceScope();
  const now = new Date();
  const todayKey = formatDateKey(now);
  const year = now.getFullYear();

  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, ativo, created_at")
    .eq("psicologo_id", scope.psychologistId);

  if (scope.clinicId) {
    pacientesQuery = pacientesQuery.eq("clinica_id", scope.clinicId);
  }

  let pagamentosQuery = supabase.from("pagamentos").select("*");
  if (scope.clinicId) {
    pagamentosQuery = pagamentosQuery.eq("clinica_id", scope.clinicId);
  }

  const [consultasAnoResult, pacientesResult, pagamentosResult] = await Promise.all([
    supabase
      .from("consultas")
      .select(`
        id,
        paciente_id,
        data_consulta,
        status,
        observacoes,
        pacientes (
          id,
          nome
        )
      `)
      .eq("psicologo_id", scope.psychologistId)
      .gte("data_consulta", `${year}-01-01T00:00:00`)
      .lte("data_consulta", `${year}-12-31T23:59:59`)
      .order("data_consulta", { ascending: true }),
    pacientesQuery,
    pagamentosQuery,
  ]);

  if (consultasAnoResult.error) throw consultasAnoResult.error;
  if (pacientesResult.error) throw pacientesResult.error;
  if (pagamentosResult.error) throw pagamentosResult.error;

  const consultasAno = (consultasAnoResult.data ?? []) as DashboardConsulta[];
  const consultasHoje = consultasAno.filter((consulta) => {
    const date = new Date(consulta.data_consulta);
    return !Number.isNaN(date.getTime()) && formatDateKey(date) === todayKey;
  });
  const consultasHojeAtivas = consultasHoje.filter((consulta) => !isClosedConsultaStatus(consulta.status));
  const consultasMes = consultasAno.filter((consulta) => isSameMonth(consulta.data_consulta, now));
  const pacientes = (pacientesResult.data ?? []) as DashboardPaciente[];
  const pagamentos = (pagamentosResult.data ?? []) as DashboardPagamento[];

  const totalConsultasHoje = consultasHojeAtivas.length;
  const confirmadasHoje = consultasHoje.filter((consulta) => consulta.status === "confirmada").length;
  const agendaHoje = consultasHojeAtivas;

  const pacientesAtivos = pacientes.filter((paciente) => paciente.ativo).length;
  const pacientesNovosMes = pacientes.filter((paciente) => isSameMonth(paciente.created_at ?? null, now)).length;

  const receitaMes = pagamentos
    .filter((pagamento) => getPaymentStatus(pagamento) === "pago" && isSameMonth(getPaymentDate(pagamento), now))
    .reduce((acc, pagamento) => acc + getNumericPaymentValue(pagamento), 0);

  const receitaPendente = pagamentos
    .filter((pagamento) => getPaymentStatus(pagamento) === "pendente")
    .reduce((acc, pagamento) => acc + getNumericPaymentValue(pagamento), 0);

  const consultasRealizadasMes = consultasMes.filter((consulta) => consulta.status === "realizada").length;
  const consultasCanceladasMes = consultasMes.filter((consulta) => consulta.status === "cancelada").length;

  const appointmentsByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(year, index, 1);
    const label = monthDate.toLocaleDateString("pt-BR", { month: "short" });
    const total = consultasAno.filter((consulta) => {
      const date = new Date(consulta.data_consulta);
      return !Number.isNaN(date.getTime()) && date.getMonth() === index && !isClosedConsultaStatus(consulta.status);
    }).length;

    return {
      month: label.charAt(0).toUpperCase() + label.slice(1, 3),
      total,
    };
  });

  const revenueByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(year, index, 1);
    const label = monthDate.toLocaleDateString("pt-BR", { month: "short" });
    const value = pagamentos
      .filter((pagamento) => getPaymentStatus(pagamento) === "pago")
      .filter((pagamento) => {
        const dateString = getPaymentDate(pagamento);
        if (!dateString) return false;
        const date = new Date(dateString);
        return !Number.isNaN(date.getTime()) && date.getMonth() === index && date.getFullYear() === year;
      })
      .reduce((acc, pagamento) => acc + getNumericPaymentValue(pagamento), 0);

    return {
      month: label.charAt(0).toUpperCase() + label.slice(1, 3),
      value,
    };
  });

  return {
    todayKey,
    totalConsultasHoje,
    confirmadasHoje,
    pacientesAtivos,
    pacientesNovosMes,
    receitaMes,
    receitaPendente,
    consultasRealizadasMes,
    consultasCanceladasMes,
    agendaHoje,
    charts: {
      appointments: appointmentsByMonth,
      revenue: revenueByMonth,
    },
  };
}
