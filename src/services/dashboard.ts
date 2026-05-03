import { getPsychologistServiceScope } from "@/services/psychologistScope";
import { supabase } from "../lib/supabase";

type DashboardConsulta = {
  id: string;
  paciente_id: string;
  data_consulta: string;
  status: string;
  status_pagamento?: string | null;
  valor_consulta?: number | string | null;
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

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function isSameMonth(dateString: string | null, reference: Date) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
}

function isClosedConsultaStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeStatus(status);
  return normalizedStatus === "cancelada" || normalizedStatus === "recusada";
}

function getConsultationValue(consulta: DashboardConsulta) {
  const raw = consulta.valor_consulta;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim()) {
    const normalizedValue = raw.trim();
    let parsed = Number(normalizedValue);

    if (!Number.isFinite(parsed) && /^\d{1,3}(\.\d{3})*,\d+$/.test(normalizedValue)) {
      parsed = Number(normalizedValue.replace(/\./g, "").replace(",", "."));
    }

    if (!Number.isFinite(parsed) && /^\d+,\d+$/.test(normalizedValue)) {
      parsed = Number(normalizedValue.replace(",", "."));
    }

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getConsultationPaymentStatus(consulta: DashboardConsulta) {
  return normalizeStatus(consulta.status_pagamento);
}

export async function buscarDashboardPsicologo() {
  const scope = await getPsychologistServiceScope();
  const now = new Date();
  const todayKey = formatDateKey(now);
  const year = now.getFullYear();

  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, ativo, created_at")
    .in("psicologo_id", scope.psychologistIds);

  if (scope.clinicId) {
    pacientesQuery = pacientesQuery.eq("clinica_id", scope.clinicId);
  }

  const [consultasAnoResult, pacientesResult] = await Promise.all([
    supabase
      .from("consultas")
      .select(`
        id,
        paciente_id,
        data_consulta,
        status,
        status_pagamento,
        valor_consulta,
        observacoes,
        pacientes (
          id,
          nome
        )
      `)
      .in("psicologo_id", scope.psychologistIds)
      .gte("data_consulta", `${year}-01-01T00:00:00`)
      .lte("data_consulta", `${year}-12-31T23:59:59`)
      .order("data_consulta", { ascending: true }),
    pacientesQuery,
  ]);

  if (consultasAnoResult.error) throw consultasAnoResult.error;
  if (pacientesResult.error) throw pacientesResult.error;

  const consultasAno = (consultasAnoResult.data ?? []) as DashboardConsulta[];
  const consultasHoje = consultasAno.filter((consulta) => {
    const date = new Date(consulta.data_consulta);
    return !Number.isNaN(date.getTime()) && formatDateKey(date) === todayKey;
  });
  const consultasHojeAtivas = consultasHoje.filter((consulta) => !isClosedConsultaStatus(consulta.status));
  const consultasMes = consultasAno.filter((consulta) => isSameMonth(consulta.data_consulta, now));
  const pacientes = (pacientesResult.data ?? []) as DashboardPaciente[];
  const consultasPagasMes = consultasMes.filter(
    (consulta) => getConsultationPaymentStatus(consulta) === "pago",
  );
  const consultasPendentesMes = consultasMes.filter(
    (consulta) => getConsultationPaymentStatus(consulta) === "aguardando_pagamento",
  );

  const totalConsultasHoje = consultasHojeAtivas.length;
  const confirmadasHoje = consultasHoje.filter((consulta) => consulta.status === "confirmada").length;
  const agendaHoje = consultasHojeAtivas;

  const pacientesAtivos = pacientes.filter((paciente) => paciente.ativo).length;
  const pacientesNovosMes = pacientes.filter((paciente) => isSameMonth(paciente.created_at ?? null, now)).length;

  const receitaMes = consultasPagasMes.reduce(
    (acc, consulta) => acc + getConsultationValue(consulta),
    0,
  );

  const receitaPendente = consultasPendentesMes.reduce(
    (acc, consulta) => acc + getConsultationValue(consulta),
    0,
  );

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
    const value = consultasAno
      .filter((consulta) => getConsultationPaymentStatus(consulta) === "pago")
      .filter((consulta) => {
        const date = new Date(consulta.data_consulta);
        return !Number.isNaN(date.getTime()) && date.getMonth() === index && date.getFullYear() === year;
      })
      .reduce((acc, consulta) => acc + getConsultationValue(consulta), 0);

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
