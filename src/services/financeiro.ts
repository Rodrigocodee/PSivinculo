import { getPsychologistServiceScope } from "@/services/psychologistScope";
import { supabase } from "../lib/supabase";

type PagamentoBruto = Record<string, unknown> & {
  id?: string;
  paciente_id?: string | null;
  psicologo_id?: string | null;
  clinica_id?: string | null;
};

type ConsultaBruta = {
  id: string;
  data_consulta: string;
  status: string;
};

type PacienteBruto = {
  id: string;
  nome: string;
  ativo: boolean | null;
};

export type PagamentoNormalizado = {
  id: string;
  patientId: string | null;
  patientName: string;
  date: string | null;
  amount: number;
  status: "paid" | "pending" | "other";
  method: string;
  description: string;
  monthKey: string | null;
};

export type PacienteFinanceiroOption = {
  id: string;
  nome: string;
};

export type FinanceiroData = {
  pagamentos: PagamentoNormalizado[];
  monthOptions: Array<{ value: string; label: string }>;
  pacientes: PacienteFinanceiroOption[];
};

export type RelatorioMensal = {
  monthKey: string;
  label: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  missedAppointments: number;
  revenue: number;
};

export type RelatorioPsicologoData = {
  activePatients: number;
  monthly: RelatorioMensal[];
  charts: {
    appointments: Array<{ month: string; total: number }>;
    revenue: Array<{ month: string; value: number }>;
  };
};

function getPossibleString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function getPossibleNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string") {
      const normalized = value.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  return 0;
}

function normalizeStatus(value: unknown): PagamentoNormalizado["status"] {
  if (typeof value !== "string") return "other";

  const normalized = value.trim().toLowerCase();

  if (["pago", "paid", "recebido", "completed", "concluido", "concluído"].includes(normalized)) {
    return "paid";
  }

  if (["pendente", "pending", "aberto", "open"].includes(normalized)) {
    return "pending";
  }

  return "other";
}

function parseValidDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortMonth(monthIndex: number, year: number) {
  const label = new Date(year, monthIndex, 1).toLocaleDateString("pt-BR", { month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1, 3);
}

function extractPaymentDate(payment: PagamentoBruto) {
  return getPossibleString(payment, ["data_pagamento", "data", "created_at", "updated_at", "data_vencimento"]);
}

function extractPaymentMethod(payment: PagamentoBruto) {
  return getPossibleString(payment, ["metodo", "forma_pagamento", "payment_method", "metodo_pagamento"]) ?? "-";
}

function extractPaymentDescription(payment: PagamentoBruto) {
  return getPossibleString(payment, ["descricao", "description", "titulo", "reference"]) ?? "Sessao individual";
}

function buildMonthOptions(monthKeys: string[]) {
  return monthKeys
    .slice()
    .sort((a, b) => b.localeCompare(a))
    .map((monthKey) => ({
      value: monthKey,
      label: formatMonthLabel(monthKey),
    }));
}

export async function buscarFinanceiroPsicologo(): Promise<FinanceiroData> {
  const scope = await getPsychologistServiceScope();

  let pagamentosQuery = supabase.from("pagamentos").select("*");
  if (scope.clinicId) {
    pagamentosQuery = pagamentosQuery.eq("clinica_id", scope.clinicId);
  }

  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, nome")
    .eq("psicologo_id", scope.psychologistId);

  if (scope.clinicId) {
    pacientesQuery = pacientesQuery.eq("clinica_id", scope.clinicId);
  }

  const [pagamentosResult, pacientesResult] = await Promise.all([pagamentosQuery, pacientesQuery]);

  if (pagamentosResult.error) throw pagamentosResult.error;
  if (pacientesResult.error) throw pacientesResult.error;

  const pacientes = (pacientesResult.data ?? []) as Array<Pick<PacienteBruto, "id" | "nome">>;
  const pagamentos = (pagamentosResult.data ?? []) as PagamentoBruto[];
  const patientNameById = new Map(pacientes.map((paciente) => [paciente.id, paciente.nome]));

  const pagamentosNormalizados = pagamentos
    .filter((pagamento) => {
      if (pagamento.psicologo_id == null) return true;
      return pagamento.psicologo_id === scope.psychologistId;
    })
    .map((pagamento) => {
      const dateString = extractPaymentDate(pagamento);
      const date = parseValidDate(dateString);

      return {
        id: pagamento.id ?? crypto.randomUUID(),
        patientId: pagamento.paciente_id ?? null,
        patientName:
          getPossibleString(pagamento, ["nome_paciente", "patient_name"]) ??
          (pagamento.paciente_id ? patientNameById.get(pagamento.paciente_id) : null) ??
          "Paciente",
        date: dateString,
        amount: getPossibleNumber(pagamento, ["valor", "amount", "valor_pago", "total", "preco"]),
        status: normalizeStatus(pagamento.status),
        method: extractPaymentMethod(pagamento),
        description: extractPaymentDescription(pagamento),
        monthKey: date ? formatMonthKey(date) : null,
      } satisfies PagamentoNormalizado;
    })
    .sort((a, b) => {
      const aTime = parseValidDate(a.date)?.getTime() ?? 0;
      const bTime = parseValidDate(b.date)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const monthKeys = Array.from(
    new Set(
      pagamentosNormalizados
        .map((pagamento) => pagamento.monthKey)
        .filter((monthKey): monthKey is string => Boolean(monthKey)),
    ),
  );

  if (monthKeys.length === 0) {
    monthKeys.push(formatMonthKey(new Date()));
  }

  return {
    pagamentos: pagamentosNormalizados,
    monthOptions: buildMonthOptions(monthKeys),
    pacientes: pacientes.map((paciente) => ({
      id: paciente.id,
      nome: paciente.nome,
    })),
  };
}

export async function buscarRelatorioPsicologo(): Promise<RelatorioPsicologoData> {
  const scope = await getPsychologistServiceScope();
  const now = new Date();
  const year = now.getFullYear();

  let consultasQuery = supabase
    .from("consultas")
    .select("id, data_consulta, status")
    .eq("psicologo_id", scope.psychologistId)
    .gte("data_consulta", `${year}-01-01T00:00:00`)
    .lte("data_consulta", `${year}-12-31T23:59:59`);

  let pagamentosQuery = supabase.from("pagamentos").select("*");
  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, nome, ativo")
    .eq("psicologo_id", scope.psychologistId);

  if (scope.clinicId) {
    consultasQuery = consultasQuery.eq("clinica_id", scope.clinicId);
    pagamentosQuery = pagamentosQuery.eq("clinica_id", scope.clinicId);
    pacientesQuery = pacientesQuery.eq("clinica_id", scope.clinicId);
  }

  const [consultasResult, pagamentosResult, pacientesResult] = await Promise.all([
    consultasQuery,
    pagamentosQuery,
    pacientesQuery,
  ]);

  if (consultasResult.error) throw consultasResult.error;
  if (pagamentosResult.error) throw pagamentosResult.error;
  if (pacientesResult.error) throw pacientesResult.error;

  const consultas = (consultasResult.data ?? []) as ConsultaBruta[];
  const pagamentos = (pagamentosResult.data ?? []) as PagamentoBruto[];
  const pacientes = (pacientesResult.data ?? []) as PacienteBruto[];

  const pagamentosAno = pagamentos.filter((pagamento) => {
    if (pagamento.psicologo_id != null && pagamento.psicologo_id !== scope.psychologistId) return false;
    const date = parseValidDate(extractPaymentDate(pagamento));
    return Boolean(date) && date.getFullYear() === year;
  });

  const monthly = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const consultasMes = consultas.filter((consulta) => {
      const date = parseValidDate(consulta.data_consulta);
      return Boolean(date) && date.getMonth() === monthIndex && date.getFullYear() === year;
    });

    const revenue = pagamentosAno
      .filter((pagamento) => {
        const date = parseValidDate(extractPaymentDate(pagamento));
        return Boolean(date) && date.getMonth() === monthIndex && normalizeStatus(pagamento.status) === "paid";
      })
      .reduce((total, pagamento) => total + getPossibleNumber(pagamento, ["valor", "amount", "valor_pago", "total", "preco"]), 0);

    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      totalAppointments: consultasMes.length,
      completedAppointments: consultasMes.filter((consulta) => consulta.status === "realizada").length,
      cancelledAppointments: consultasMes.filter((consulta) => consulta.status === "cancelada").length,
      missedAppointments: consultasMes.filter((consulta) => consulta.status === "faltou").length,
      revenue,
    } satisfies RelatorioMensal;
  });

  return {
    activePatients: pacientes.filter((paciente) => paciente.ativo).length,
    monthly,
    charts: {
      appointments: monthly.map((item, monthIndex) => ({
        month: formatShortMonth(monthIndex, year),
        total: item.totalAppointments,
      })),
      revenue: monthly.map((item, monthIndex) => ({
        month: formatShortMonth(monthIndex, year),
        value: item.revenue,
      })),
    },
  };
}
