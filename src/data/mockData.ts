export const mockPatients = [
  { id: "1", name: "Maria Silva Santos", email: "maria.silva@email.com", phone: "(11) 98765-4321", cpf: "123.456.789-00", birthDate: "1990-03-15", status: "active", lastSession: "2026-04-10", nextSession: "2026-04-17", emergencyContact: "João Silva - (11) 91234-5678", address: "Rua das Flores, 123 - São Paulo, SP", notes: "Paciente desde 2024. Sessões semanais às quintas." },
  { id: "2", name: "Carlos Eduardo Oliveira", email: "carlos.oliveira@email.com", phone: "(11) 97654-3210", cpf: "234.567.890-11", birthDate: "1985-07-22", status: "active", lastSession: "2026-04-12", nextSession: "2026-04-19", emergencyContact: "Ana Oliveira - (11) 92345-6789", address: "Av. Paulista, 456 - São Paulo, SP", notes: "Acompanhamento quinzenal." },
  { id: "3", name: "Ana Beatriz Costa", email: "ana.costa@email.com", phone: "(11) 96543-2109", cpf: "345.678.901-22", birthDate: "1995-11-08", status: "active", lastSession: "2026-04-08", nextSession: "2026-04-15", emergencyContact: "Pedro Costa - (11) 93456-7890", address: "Rua Augusta, 789 - São Paulo, SP", notes: "" },
  { id: "4", name: "Roberto Almeida Junior", email: "roberto.almeida@email.com", phone: "(11) 95432-1098", cpf: "456.789.012-33", birthDate: "1978-02-28", status: "inactive", lastSession: "2026-02-20", nextSession: null, emergencyContact: "Lúcia Almeida - (11) 94567-8901", address: "Rua Oscar Freire, 321 - São Paulo, SP", notes: "Encerrou tratamento em fevereiro." },
  { id: "5", name: "Fernanda Lima Rodrigues", email: "fernanda.lima@email.com", phone: "(11) 94321-0987", cpf: "567.890.123-44", birthDate: "1992-06-14", status: "active", lastSession: "2026-04-11", nextSession: "2026-04-18", emergencyContact: "Marcos Lima - (11) 95678-9012", address: "Alameda Santos, 654 - São Paulo, SP", notes: "Sessões às sextas-feiras." },
  { id: "6", name: "Lucas Mendes Pereira", email: "lucas.mendes@email.com", phone: "(11) 93210-9876", cpf: "678.901.234-55", birthDate: "2000-09-30", status: "active", lastSession: "2026-04-09", nextSession: "2026-04-16", emergencyContact: "Clara Mendes - (11) 96789-0123", address: "Rua Bela Cintra, 987 - São Paulo, SP", notes: "Primeira consulta em março 2026." },
  { id: "7", name: "Juliana Ferreira Souza", email: "juliana.ferreira@email.com", phone: "(11) 92109-8765", cpf: "789.012.345-66", birthDate: "1988-12-05", status: "active", lastSession: "2026-04-13", nextSession: "2026-04-20", emergencyContact: "Ricardo Ferreira - (11) 97890-1234", address: "Rua Consolação, 159 - São Paulo, SP", notes: "" },
  { id: "8", name: "Gustavo Henrique Martins", email: "gustavo.martins@email.com", phone: "(11) 91098-7654", cpf: "890.123.456-77", birthDate: "1983-04-18", status: "inactive", lastSession: "2026-01-15", nextSession: null, emergencyContact: "Marina Martins - (11) 98901-2345", address: "Av. Rebouças, 753 - São Paulo, SP", notes: "Transferido para outro profissional." },
];

export const mockAppointments = [
  { id: "1", patientName: "Maria Silva Santos", patientId: "1", date: "2026-04-14", time: "08:00", duration: 50, status: "confirmed", type: "Sessão Individual", room: "Sala 1", notes: "Sessão semanal" },
  { id: "2", patientName: "Carlos Eduardo Oliveira", patientId: "2", date: "2026-04-14", time: "09:00", duration: 50, status: "confirmed", type: "Sessão Individual", room: "Sala 1", notes: "" },
  { id: "3", patientName: "Ana Beatriz Costa", patientId: "3", date: "2026-04-14", time: "10:00", duration: 50, status: "pending", type: "Sessão Individual", room: "Sala 1", notes: "Primeira sessão após férias" },
  { id: "4", patientName: "Lucas Mendes Pereira", patientId: "6", date: "2026-04-14", time: "11:00", duration: 50, status: "confirmed", type: "Sessão Individual", room: "Sala 1", notes: "" },
  { id: "5", patientName: "Fernanda Lima Rodrigues", patientId: "5", date: "2026-04-14", time: "14:00", duration: 50, status: "cancelled", type: "Sessão Individual", room: "Sala 1", notes: "Paciente cancelou por motivo pessoal" },
  { id: "6", patientName: "Juliana Ferreira Souza", patientId: "7", date: "2026-04-14", time: "15:00", duration: 50, status: "completed", type: "Sessão Individual", room: "Sala 1", notes: "" },
  { id: "7", patientName: "Maria Silva Santos", patientId: "1", date: "2026-04-17", time: "08:00", duration: 50, status: "confirmed", type: "Sessão Individual", room: "Sala 1", notes: "" },
  { id: "8", patientName: "Ana Beatriz Costa", patientId: "3", date: "2026-04-15", time: "10:00", duration: 50, status: "pending", type: "Sessão Individual", room: "Sala 1", notes: "" },
];

export const mockFinancials = [
  { id: "1", patientName: "Maria Silva Santos", date: "2026-04-10", amount: 250, status: "paid", method: "PIX", description: "Sessão individual" },
  { id: "2", patientName: "Carlos Eduardo Oliveira", date: "2026-04-12", amount: 250, status: "paid", method: "Cartão de Crédito", description: "Sessão individual" },
  { id: "3", patientName: "Ana Beatriz Costa", date: "2026-04-08", amount: 250, status: "pending", method: "-", description: "Sessão individual" },
  { id: "4", patientName: "Lucas Mendes Pereira", date: "2026-04-09", amount: 200, status: "paid", method: "PIX", description: "Sessão individual" },
  { id: "5", patientName: "Fernanda Lima Rodrigues", date: "2026-04-11", amount: 250, status: "pending", method: "-", description: "Sessão individual" },
  { id: "6", patientName: "Juliana Ferreira Souza", date: "2026-04-13", amount: 300, status: "paid", method: "Transferência", description: "Sessão individual" },
  { id: "7", patientName: "Maria Silva Santos", date: "2026-03-27", amount: 250, status: "paid", method: "PIX", description: "Sessão individual" },
  { id: "8", patientName: "Carlos Eduardo Oliveira", date: "2026-03-29", amount: 250, status: "paid", method: "Cartão de Crédito", description: "Sessão individual" },
];

export const mockEvolutions = [
  { id: "1", date: "2026-04-10", sessionNumber: 42, content: "Paciente relatou melhora significativa no quadro de ansiedade. Mantém exercícios de respiração diários. Discutimos estratégias para situações sociais. Humor estável, sono regular.", attachments: [] },
  { id: "2", date: "2026-04-03", sessionNumber: 41, content: "Sessão focada em reestruturação cognitiva. Paciente identificou padrões de pensamento automático negativos. Trabalho com registro de pensamentos disfuncionais.", attachments: ["registro_pensamentos.pdf"] },
  { id: "3", date: "2026-03-27", sessionNumber: 40, content: "Paciente trouxe questão sobre relacionamento familiar. Exploração de dinâmicas e definição de limites. Técnicas de comunicação assertiva.", attachments: [] },
  { id: "4", date: "2026-03-20", sessionNumber: 39, content: "Retorno após férias. Paciente manteve rotina de autocuidado. Relato de evento estressor no trabalho. Manejo de estresse e planejamento de ações.", attachments: [] },
];

export const mockUsers = [
  { id: "1", name: "Dra. Camila Rodrigues", email: "camila@psivinculo.com", role: "psychologist", status: "active", avatar: "", specialty: "TCC - Terapia Cognitivo-Comportamental" },
  { id: "2", name: "Dr. Rafael Souza", email: "rafael@psivinculo.com", role: "psychologist", status: "active", avatar: "", specialty: "Psicanálise" },
  { id: "3", name: "Dra. Beatriz Lima", email: "beatriz@psivinculo.com", role: "psychologist", status: "active", avatar: "", specialty: "Terapia Sistêmica" },
  { id: "4", name: "Amanda Costa", email: "amanda@psivinculo.com", role: "admin", status: "active", avatar: "", specialty: "" },
  { id: "5", name: "Pedro Santos", email: "pedro@psivinculo.com", role: "receptionist", status: "active", avatar: "", specialty: "" },
  { id: "6", name: "Dr. Marcos Almeida", email: "marcos@psivinculo.com", role: "psychologist", status: "inactive", avatar: "", specialty: "Neuropsicologia" },
];

export const mockNotifications = [
  { id: "1", title: "Consulta confirmada", message: "Maria Silva confirmou a sessão de amanhã às 08:00", time: "10 min atrás", read: false },
  { id: "2", title: "Pagamento recebido", message: "Pagamento de R$ 250,00 recebido via PIX", time: "1h atrás", read: false },
  { id: "3", title: "Novo agendamento", message: "Lucas Mendes solicitou agendamento para sexta-feira", time: "3h atrás", read: true },
  { id: "4", title: "Lembrete", message: "Prontuário de Ana Beatriz precisa de atualização", time: "5h atrás", read: true },
];

export const mockClinic = {
  name: "Psivínculo - Psicologia Integrada",
  cnpj: "12.345.678/0001-90",
  address: "Av. Paulista, 1000 - Sala 1201 - Bela Vista, São Paulo - SP, 01310-100",
  phone: "(11) 3456-7890",
  email: "contato@psivinculo.com",
  logo: "",
  workingHours: "Segunda a Sexta: 08:00 - 20:00 | Sábado: 08:00 - 14:00",
  sessionDuration: 50,
};

export const monthlyStats = {
  totalRevenue: 18750,
  pendingRevenue: 3250,
  totalAppointments: 85,
  completedAppointments: 72,
  cancelledAppointments: 8,
  missedAppointments: 5,
  activePatients: 42,
  newPatients: 6,
  occupancyRate: 78,
};

export const chartData = {
  appointments: [
    { month: "Jan", total: 68 }, { month: "Fev", total: 72 }, { month: "Mar", total: 80 },
    { month: "Abr", total: 85 }, { month: "Mai", total: 0 }, { month: "Jun", total: 0 },
  ],
  revenue: [
    { month: "Jan", value: 15200 }, { month: "Fev", value: 16800 }, { month: "Mar", value: 17500 },
    { month: "Abr", value: 18750 }, { month: "Mai", value: 0 }, { month: "Jun", value: 0 },
  ],
  appointmentsByProfessional: [
    { name: "Dra. Camila", value: 32 }, { name: "Dr. Rafael", value: 28 }, { name: "Dra. Beatriz", value: 25 },
  ],
};
