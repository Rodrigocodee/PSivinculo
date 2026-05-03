import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  Brain,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  PUBLIC_DEMO_ACTION_MESSAGE,
  publicDemoAppointments,
  publicDemoFinancialItems,
  publicDemoMetrics,
  publicDemoPatients,
  publicDemoRecord,
  publicDemoSettings,
} from "@/data/publicDemo";

type DemoView = "dashboard" | "agenda" | "pacientes" | "financeiro" | "prontuario" | "configuracoes";

type DemoTab = {
  id: DemoView;
  label: string;
  icon: LucideIcon;
  actionLabel: string;
};

const demoTabs: DemoTab[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, actionLabel: "Criar lembrete" },
  { id: "agenda", label: "Agenda", icon: CalendarDays, actionLabel: "Novo agendamento" },
  { id: "pacientes", label: "Pacientes", icon: Users, actionLabel: "Novo paciente" },
  { id: "financeiro", label: "Financeiro", icon: WalletCards, actionLabel: "Nova cobranca" },
  { id: "prontuario", label: "Prontuario", icon: ClipboardList, actionLabel: "Salvar evolucao" },
  { id: "configuracoes", label: "Configuracoes", icon: Settings, actionLabel: "Salvar configuracoes" },
];

const viewDescriptions: Record<DemoView, string> = {
  dashboard: "Uma leitura rapida do dia, dos pacientes e do financeiro da pratica profissional.",
  agenda: "Consultas ficticias com status, modalidade e acoes simuladas.",
  pacientes: "Lista demonstrativa para visualizar acompanhamento sem expor dados reais.",
  financeiro: "Cobrancas e recebimentos ficticios para entender o fluxo financeiro.",
  prontuario: "Exemplo de evolucao clinica com conteudo demonstrativo e seguro.",
  configuracoes: "Preferencias profissionais preenchidas apenas para visualizacao.",
};

const statusClasses: Record<string, string> = {
  Confirmada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Solicitada: "border-amber-200 bg-amber-50 text-amber-700",
  "Aguardando pagamento": "border-sky-200 bg-sky-50 text-sky-700",
  Ativa: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Ativo: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Em triagem": "border-amber-200 bg-amber-50 text-amber-700",
  Pago: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Pendente: "border-amber-200 bg-amber-50 text-amber-700",
  "A cobrar": "border-sky-200 bg-sky-50 text-sky-700",
};

function getStatusClass(status: string) {
  return statusClasses[status] || "border-border bg-muted text-muted-foreground";
}

function DemoBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground/70">
      {children}
    </span>
  );
}

function DemoActionButton({
  children,
  onClick,
  variant = "primary",
}: {
  children: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  const variantClass =
    variant === "primary"
      ? "gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
      : "border border-border bg-white text-foreground hover:border-primary/30 hover:bg-primary/5";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${variantClass}`}
    >
      {children}
    </button>
  );
}

function DashboardView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {publicDemoMetrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-foreground">{metric.value}</p>
            <p className="mt-2 text-sm leading-6 text-foreground/60">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Proximas consultas</h2>
              <p className="text-sm text-muted-foreground">Agenda demonstrativa do dia.</p>
            </div>
            <DemoActionButton onClick={onDemoAction} variant="secondary">
              Criar lembrete
            </DemoActionButton>
          </div>

          <div className="space-y-3">
            {publicDemoAppointments.slice(0, 3).map((appointment) => (
              <div
                key={appointment.id}
                className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {appointment.time}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{appointment.patient}</p>
                    <p className="text-sm text-muted-foreground">
                      {appointment.kind} · {appointment.duration}
                    </p>
                  </div>
                </div>
                <span className={`w-fit rounded-lg border px-2.5 py-1 text-xs font-semibold ${getStatusClass(appointment.status)}`}>
                  {appointment.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-semibold text-foreground">Acoes rapidas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Botoes clicaveis, sem gravar dados.</p>
          <div className="mt-5 grid grid-cols-1 gap-3">
            {["Novo paciente", "Novo agendamento", "Gerar cobranca", "Salvar prontuario"].map((label) => (
              <button
                key={label}
                type="button"
                onClick={onDemoAction}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5"
              >
                <span>{label}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AgendaView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Agenda demonstrativa</h2>
          <p className="text-sm text-muted-foreground">Consultas ficticias para explorar a experiencia.</p>
        </div>
        <DemoActionButton onClick={onDemoAction}>Novo agendamento</DemoActionButton>
      </div>

      <div className="space-y-3">
        {publicDemoAppointments.map((appointment) => (
          <article key={appointment.id} className="rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {appointment.time}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{appointment.patient}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {appointment.kind} · {appointment.duration}
                  </p>
                  <span className={`mt-3 inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${getStatusClass(appointment.status)}`}>
                    {appointment.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <DemoActionButton onClick={onDemoAction} variant="secondary">
                  Confirmar
                </DemoActionButton>
                <DemoActionButton onClick={onDemoAction} variant="secondary">
                  Reagendar
                </DemoActionButton>
                <DemoActionButton onClick={onDemoAction} variant="secondary">
                  Cancelar
                </DemoActionButton>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PatientsView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Pacientes ficticios</h2>
          <p className="text-sm text-muted-foreground">Nomes abreviados e dados demonstrativos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoActionButton onClick={onDemoAction}>Novo paciente</DemoActionButton>
          <DemoActionButton onClick={onDemoAction} variant="secondary">
            Importar lista
          </DemoActionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {publicDemoPatients.map((patient) => (
          <article key={patient.id} className="rounded-lg border border-border/70 bg-background/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg gradient-seafoam text-sm font-bold text-secondary-foreground">
                  {patient.initials}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{patient.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{patient.profile}</p>
                </div>
              </div>
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${getStatusClass(patient.status)}`}>
                {patient.status}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm text-foreground/70">
              <p>Proxima consulta: {patient.nextSession}</p>
              <p>Foco atual: {patient.focus}</p>
            </div>
            <button
              type="button"
              onClick={onDemoAction}
              className="mt-4 inline-flex h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5"
            >
              Editar paciente
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinancialView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Financeiro ficticio</h2>
          <p className="text-sm text-muted-foreground">Valores simulados, sem integracao de cobranca.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoActionButton onClick={onDemoAction}>Nova cobranca</DemoActionButton>
          <DemoActionButton onClick={onDemoAction} variant="secondary">
            Configurar Asaas
          </DemoActionButton>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: "Recebido", value: "R$ 12.500" },
          { label: "Pendente", value: "R$ 3.250" },
          { label: "A cobrar", value: "R$ 2.100" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border/70 bg-background/60 p-4">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-3 font-semibold">Paciente</th>
              <th className="py-3 font-semibold">Descricao</th>
              <th className="py-3 font-semibold">Vencimento</th>
              <th className="py-3 font-semibold">Valor</th>
              <th className="py-3 font-semibold">Status</th>
              <th className="py-3 font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody>
            {publicDemoFinancialItems.map((item) => (
              <tr key={item.id} className="border-b border-border/70">
                <td className="py-3 font-medium text-foreground">{item.patient}</td>
                <td className="py-3 text-foreground/70">{item.description}</td>
                <td className="py-3 text-foreground/70">{item.dueDate}</td>
                <td className="py-3 font-semibold text-foreground">{item.amount}</td>
                <td className="py-3">
                  <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${getStatusClass(item.status)}`}>
                    {item.status}
                  </span>
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={onDemoAction}
                    className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    Gerar cobranca
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecordView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Prontuario exemplo</h2>
          <p className="text-sm text-muted-foreground">Conteudo demonstrativo, sem dados clinicos reais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoActionButton onClick={onDemoAction}>Salvar evolucao</DemoActionButton>
          <DemoActionButton onClick={onDemoAction} variant="secondary">
            Anexar arquivo
          </DemoActionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-border/70 bg-background/60 p-4">
          <DemoBadge>{publicDemoRecord.sessionNumber}</DemoBadge>
          <h3 className="mt-4 font-heading text-xl font-semibold text-foreground">{publicDemoRecord.patient}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{publicDemoRecord.date}</p>
          <div className="mt-5 space-y-3">
            {publicDemoRecord.nextSteps.map((step) => (
              <div key={step} className="flex items-start gap-2 text-sm text-foreground/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-foreground" htmlFor="demo-record-summary">
            {publicDemoRecord.title}
          </label>
          <textarea
            id="demo-record-summary"
            readOnly
            value={publicDemoRecord.summary}
            className="mt-2 min-h-[220px] w-full resize-none rounded-lg border border-border bg-background/60 p-4 text-sm leading-7 text-foreground/75 outline-none"
          />
        </div>
      </div>
    </section>
  );
}

function SettingsView({ onDemoAction }: { onDemoAction: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Configuracoes exemplo</h2>
          <p className="text-sm text-muted-foreground">Preferencias ilustrativas em modo somente demonstracao.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoActionButton onClick={onDemoAction}>Salvar configuracoes</DemoActionButton>
          <DemoActionButton onClick={onDemoAction} variant="secondary">
            Salvar horarios
          </DemoActionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {publicDemoSettings.map((setting) => (
          <label key={setting.label} className="block rounded-lg border border-border/70 bg-background/60 p-4">
            <span className="text-sm font-semibold text-foreground">{setting.label}</span>
            <input
              readOnly
              value={setting.value}
              className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none"
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function renderDemoView(activeView: DemoView, onDemoAction: () => void) {
  if (activeView === "agenda") return <AgendaView onDemoAction={onDemoAction} />;
  if (activeView === "pacientes") return <PatientsView onDemoAction={onDemoAction} />;
  if (activeView === "financeiro") return <FinancialView onDemoAction={onDemoAction} />;
  if (activeView === "prontuario") return <RecordView onDemoAction={onDemoAction} />;
  if (activeView === "configuracoes") return <SettingsView onDemoAction={onDemoAction} />;
  return <DashboardView onDemoAction={onDemoAction} />;
}

export default function PublicDemoPage() {
  const [activeView, setActiveView] = useState<DemoView>("dashboard");
  const activeTab = useMemo(
    () => demoTabs.find((tab) => tab.id === activeView) || demoTabs[0],
    [activeView],
  );
  const ActiveIcon = activeTab.icon;

  function handleDemoAction() {
    toast.error(PUBLIC_DEMO_ACTION_MESSAGE);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(220_43%_97%),hsl(var(--background))_46%,hsl(220_35%_96%))] text-foreground">
      <header className="border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-heading text-lg font-bold text-foreground">Psivinculo</span>
              <p className="text-xs font-medium text-muted-foreground">Demonstração pública</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-primary/30 sm:inline-flex"
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="inline-flex h-10 items-center gap-2 rounded-lg gradient-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
            >
              Criar conta
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-primary/20 bg-white/90 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Você está vendo uma demonstração. Nenhum dado será salvo.</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Esta area usa apenas dados ficticios locais e bloqueia qualquer acao real.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/cadastro"
              className="inline-flex h-10 items-center rounded-lg gradient-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
            >
              Criar conta
            </Link>
            <Link
              to="/cadastro?origem=demo&acao=plano"
              className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5"
            >
              Escolher plano
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_1fr]">
          <aside className="h-fit rounded-lg border border-border bg-white p-3 shadow-sm">
            <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Navegação da demonstração">
              {demoTabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = tab.id === activeView;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveView(tab.id)}
                    className={`flex h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/70 hover:bg-primary/10 hover:text-foreground"
                    }`}
                  >
                    <TabIcon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 rounded-lg border border-border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary" />
                Sem dados reais
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A demo nao consulta Supabase, Asaas ou endpoints protegidos para montar estas telas.
              </p>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-5 flex flex-col gap-4 rounded-lg border border-border bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <ActiveIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-bold text-foreground">{activeTab.label}</h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {viewDescriptions[activeView]}
                  </p>
                </div>
              </div>
              <DemoActionButton onClick={handleDemoAction}>{activeTab.actionLabel}</DemoActionButton>
            </div>

            {renderDemoView(activeView, handleDemoAction)}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { icon: BellRing, title: "Notificacoes", text: "Lembretes e avisos aparecem como simulacao." },
                { icon: CreditCard, title: "Pagamentos", text: "Cobrancas nao sao geradas nesta area publica." },
                { icon: FileText, title: "Prontuarios", text: "Registros da demo usam conteudo ficticio." },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-white p-4 shadow-sm">
                  <item.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Pronto para usar com seus dados?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Crie uma conta para ativar os fluxos reais com segurança.</p>
              </div>
              <Link
                to="/cadastro"
                className="inline-flex h-10 items-center justify-center rounded-lg gradient-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
              >
                Começar agora
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
