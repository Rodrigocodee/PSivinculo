export const PUBLIC_DEMO_ACTION_MESSAGE = "Crie sua conta para usar este recurso.";

export const publicDemoMetrics = [
  {
    label: "Consultas hoje",
    value: "6",
    detail: "4 confirmadas, 1 pendente, 1 finalizada",
  },
  {
    label: "Pacientes ativos",
    value: "42",
    detail: "3 novos acompanhamentos no mes",
  },
  {
    label: "Receita prevista",
    value: "R$ 18.750",
    detail: "R$ 3.250 ainda pendentes",
  },
  {
    label: "Ocupacao",
    value: "78%",
    detail: "Agenda com boa distribuicao semanal",
  },
];

export const publicDemoAppointments = [
  {
    id: "demo-appointment-1",
    time: "08:00",
    patient: "Marina L.",
    kind: "Online",
    status: "Confirmada",
    duration: "50 min",
  },
  {
    id: "demo-appointment-2",
    time: "09:00",
    patient: "Caio R.",
    kind: "Presencial",
    status: "Confirmada",
    duration: "50 min",
  },
  {
    id: "demo-appointment-3",
    time: "10:30",
    patient: "Bianca M.",
    kind: "Online",
    status: "Solicitada",
    duration: "50 min",
  },
  {
    id: "demo-appointment-4",
    time: "14:00",
    patient: "Renato P.",
    kind: "Presencial",
    status: "Aguardando pagamento",
    duration: "50 min",
  },
];

export const publicDemoPatients = [
  {
    id: "demo-patient-1",
    initials: "ML",
    name: "Marina L.",
    profile: "Terapia individual",
    nextSession: "Hoje, 08:00",
    status: "Ativa",
    focus: "Ansiedade e rotina de autocuidado",
  },
  {
    id: "demo-patient-2",
    initials: "CR",
    name: "Caio R.",
    profile: "Acompanhamento quinzenal",
    nextSession: "Hoje, 09:00",
    status: "Ativo",
    focus: "Organizacao emocional e trabalho",
  },
  {
    id: "demo-patient-3",
    initials: "BM",
    name: "Bianca M.",
    profile: "Primeiras sessoes",
    nextSession: "Amanha, 10:30",
    status: "Em triagem",
    focus: "Sono, limites e estresse",
  },
  {
    id: "demo-patient-4",
    initials: "RP",
    name: "Renato P.",
    profile: "Terapia de casal",
    nextSession: "Sexta, 14:00",
    status: "Ativo",
    focus: "Comunicacao e combinados",
  },
];

export const publicDemoFinancialItems = [
  {
    id: "demo-financial-1",
    patient: "Marina L.",
    description: "Sessao individual",
    amount: "R$ 250,00",
    status: "Pago",
    dueDate: "02/05/2026",
  },
  {
    id: "demo-financial-2",
    patient: "Renato P.",
    description: "Terapia de casal",
    amount: "R$ 320,00",
    status: "Pendente",
    dueDate: "03/05/2026",
  },
  {
    id: "demo-financial-3",
    patient: "Bianca M.",
    description: "Consulta inicial",
    amount: "R$ 250,00",
    status: "A cobrar",
    dueDate: "04/05/2026",
  },
];

export const publicDemoRecord = {
  patient: "Marina L.",
  sessionNumber: "Sessao 18",
  date: "02/05/2026",
  title: "Registro de evolucao",
  summary:
    "Paciente relatou melhora na organizacao da rotina e maior consciencia sobre gatilhos de ansiedade. Foram revisadas estrategias de respiracao e planejamento de atividades de autocuidado para a semana.",
  nextSteps: [
    "Manter registro breve de humor entre sessoes",
    "Revisar combinados de sono e pausas durante o trabalho",
    "Retomar exercicios de respiracao antes de situacoes de maior tensao",
  ],
};

export const publicDemoSettings = [
  {
    label: "Valor da consulta",
    value: "R$ 250,00",
  },
  {
    label: "Duracao padrao",
    value: "50 minutos",
  },
  {
    label: "Modalidade",
    value: "Online e presencial",
  },
  {
    label: "Local presencial",
    value: "Sala demonstrativa, Unidade Centro",
  },
  {
    label: "Horario de atendimento",
    value: "Segunda a sexta, 08:00 as 18:00",
  },
];
