import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRoundSearch,
  Users,
} from "lucide-react";
import {
  buildPublicPlanCheckoutRoute,
  listPublicCheckoutPlans,
} from "@/config/publicCheckout";
import { PublicSiteFooter } from "@/components/public/PublicSiteFooter";

const quickFeatures = [
  {
    icon: CalendarDays,
    title: "Agenda inteligente",
    description: "Organize consultas, confirmacoes e reagendamentos com uma leitura clara da rotina.",
  },
  {
    icon: ClipboardList,
    title: "Pacientes e prontuarios",
    description: "Centralize cadastro, historico e evolucoes clinicas em um ambiente preparado para o cuidado.",
  },
  {
    icon: BadgeDollarSign,
    title: "Cobrancas e pagamentos",
    description: "Acompanhe valores, pendencias e recebimentos sem perder o contexto de cada consulta.",
  },
  {
    icon: BellRing,
    title: "Notificacoes automaticas",
    description: "Reduza esquecimentos com lembretes e comunicacoes que apoiam profissional e paciente.",
  },
  {
    icon: Users,
    title: "Area do paciente",
    description: "Ofereca uma experiencia simples para agendamentos, recibos e informacoes importantes.",
  },
];

const productHighlights = [
  "Dashboard com prioridades do dia",
  "Agenda semanal com status de consultas",
  "Financeiro conectado ao atendimento",
  "Configuracoes profissionais em um so lugar",
];

const plans = listPublicCheckoutPlans();

const navLinks = [
  { label: "Funcionalidades", href: "#features" },
  { label: "Sobre", href: "#about" },
  { label: "Planos", href: "#pricing" },
  { label: "Demonstração", href: "/demo" },
];

function ProductScene() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] overflow-hidden lg:block" aria-hidden>
      <div className="absolute right-[-3rem] top-12 w-[760px] rotate-[-2deg] rounded-lg border border-white/70 bg-white/90 p-4 shadow-2xl backdrop-blur">
        <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-destructive/50" />
            <div className="h-3 w-3 rounded-full bg-warning/60" />
            <div className="h-3 w-3 rounded-full bg-success/60" />
          </div>
          <div className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Demo visual</div>
        </div>

        <div className="grid grid-cols-[11rem_1fr] gap-4">
          <div className="space-y-2 rounded-lg border border-border bg-background/80 p-3">
            {["Dashboard", "Agenda", "Pacientes", "Financeiro", "Prontuario"].map((item, index) => (
              <div
                key={item}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-white text-foreground/70"}`}
              >
                {item}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Consultas", "6"],
                ["Pacientes", "42"],
                ["Receita", "R$ 18.750"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/80 p-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="mt-2 text-xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-background/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-foreground">Agenda de hoje</p>
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              {[
                ["08:00", "Marina L.", "Confirmada"],
                ["10:30", "Bianca M.", "Solicitada"],
                ["14:00", "Renato P.", "Aguardando pagamento"],
              ].map(([time, patient, status]) => (
                <div key={`${time}-${patient}`} className="flex items-center justify-between border-t border-border/70 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary">{time}</span>
                    <span className="font-medium text-foreground">{patient}</span>
                  </div>
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-foreground/60">{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary shadow-sm">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-heading text-xl font-bold text-foreground">Psivínculo</span>
              <p className="text-xs font-medium text-muted-foreground">Gestão para psicólogos</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Navegação principal">
            {navLinks.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.label}
                  to={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground/70 transition hover:bg-primary/10 hover:text-foreground"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground/70 transition hover:bg-primary/10 hover:text-foreground"
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-foreground/70 transition hover:bg-primary/10 hover:text-foreground sm:inline-flex"
            >
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="inline-flex h-10 items-center rounded-lg gradient-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
            >
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-border/70 bg-[linear-gradient(135deg,hsl(224_48%_96%),hsl(40_33%_98%)_52%,hsl(218_42%_94%))]">
          <ProductScene />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,255,255,0.96),rgba(255,255,255,0.82)_46%,rgba(255,255,255,0.36))]" aria-hidden />

          <div className="container mx-auto px-4 py-14 sm:py-16 lg:py-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-white/80 px-3 py-2 text-sm font-semibold text-primary shadow-sm">
                <ShieldCheck className="h-4 w-4" />
                Plataforma profissional para rotinas clínicas
              </div>

              <h1 className="mt-6 font-heading text-4xl font-extrabold leading-tight text-foreground sm:text-5xl md:text-6xl">
                Psivínculo
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/70 md:text-xl">
                Agenda, pacientes, prontuários, cobranças, notificações e área do paciente em uma experiência
                limpa para psicólogos e clínicas que querem operar com mais clareza.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/cadastro"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg gradient-primary px-6 text-base font-semibold text-primary-foreground shadow-lg transition hover:opacity-95"
                >
                  Começar agora
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 text-base font-semibold text-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/5"
                >
                  Ver demonstração
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </div>

              <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {productHighlights.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 px-4 py-16 lg:py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase text-primary">Funcionalidades</p>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                Uma base completa para a rotina profissional.
              </h2>
              <p className="mt-4 text-lg leading-8 text-foreground/70">
                O Psivínculo conecta os pontos que mais consomem tempo no consultório, mantendo a experiência
                organizada para profissional e paciente.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              {quickFeatures.map((feature) => (
                <article key={feature.title} className="rounded-lg border border-border bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 font-heading text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-foreground/70">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-white px-4 py-14 lg:py-16">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Em breve
                </div>
                <h2 className="mt-4 font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                  Psicólogos da plataforma
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-foreground/70">
                  Uma vitrine futura para pacientes encontrarem profissionais, conhecerem especialidades e solicitarem
                  atendimento com mais facilidade.
                </p>
                <Link
                  to="/psicologos-da-plataforma"
                  className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-5 text-sm font-semibold text-primary transition hover:bg-primary/15"
                >
                  Ver teaser
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-lg border border-border bg-background/70 p-4 shadow-sm">
                <div className="rounded-lg border border-primary/15 bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase text-primary">Preview visual</p>
                      <p className="mt-1 font-heading text-xl font-bold text-foreground">Busca de profissionais</p>
                    </div>
                    <UserRoundSearch className="h-9 w-9 text-primary" />
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {["Especialidades", "Modalidade online", "Cidade/Estado", "Perfil público"].map((item) => (
                      <div key={item} className="rounded-lg border border-border bg-background/80 p-4 text-sm font-semibold text-foreground/70">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-[linear-gradient(180deg,hsl(220_42%_97%),hsl(var(--background)))] px-4 py-16 lg:py-20">
          <div className="container mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase text-primary">Demonstração pública</p>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                Visitantes podem explorar o sistema sem login.
              </h2>
              <p className="mt-4 text-lg leading-8 text-foreground/70">
                A rota pública usa dados mockados locais, permite navegar pelas telas principais e bloqueia
                qualquer ação de criação, edição, cobrança ou salvamento.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/demo"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                >
                  Ver demonstração
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/cadastro"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-white px-5 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5"
                >
                  Criar conta
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-heading text-xl font-bold text-foreground">Preview profissional</p>
                  <p className="mt-1 text-sm text-muted-foreground">Nenhum dado será salvo.</p>
                </div>
                <LockKeyhole className="h-5 w-5 text-primary" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["Dashboard", "Indicadores fictícios"],
                  ["Agenda", "Consultas fictícias"],
                  ["Pacientes", "Lista demonstrativa"],
                  ["Financeiro", "Valores fictícios"],
                  ["Prontuário", "Registro exemplo"],
                  ["Configurações", "Campos somente leitura"],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-lg border border-border bg-background/70 p-4">
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 px-4 py-16 lg:py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 rounded-lg border border-border bg-white p-6 shadow-sm md:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Sobre o Psivínculo</p>
                <h2 className="mt-3 font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                  Criado com propósito, pensado para cuidar
                </h2>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground/70">
                  O Psivínculo nasceu de uma experiência real com a saúde mental e da vontade de simplificar a rotina
                  dos psicólogos, para que mais tempo seja dedicado ao que realmente importa: o cuidado com as pessoas.
                </p>
                <Link
                  to="/sobre"
                  className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                >
                  Conhecer a história
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="overflow-hidden rounded-lg border border-primary/15 bg-[linear-gradient(135deg,hsla(var(--primary),0.08),hsla(var(--accent),0.08))] p-4">
                <div className="grid grid-cols-[5.5rem_1fr] items-center gap-4 sm:grid-cols-[7rem_1fr] lg:grid-cols-1">
                  <img
                    src="/images/rodrigo.jpeg"
                    alt="Rodrigo Ferreira, fundador do Psivínculo"
                    className="aspect-square w-full rounded-lg object-cover lg:aspect-[4/3]"
                    loading="lazy"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">História do fundador</p>
                    <p className="mt-2 text-sm leading-6 text-foreground/70">
                      Conheça a origem humana e o propósito por trás da plataforma.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 px-4 py-16 lg:py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase text-primary">Planos</p>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                Comece com o plano que combina com sua operação.
              </h2>
              <p className="mt-4 text-lg leading-8 text-foreground/70">
                Do consultório individual à clínica em crescimento, a plataforma acompanha sua maturidade.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => (
                <article
                  key={plan.routeKey}
                  className={`flex h-full flex-col rounded-lg border bg-white p-6 shadow-sm ${plan.featured ? "border-primary/30 ring-2 ring-primary/10" : "border-border"}`}
                >
                  <div className="mb-4 flex min-h-7 flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-lg px-3 py-1 text-xs font-semibold ${
                        plan.audience === "clinic"
                          ? "bg-accent/15 text-accent-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {plan.audienceLabel}
                    </span>
                    {plan.featured ? (
                      <span className="inline-flex rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Mais escolhido
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-foreground">{plan.publicName || plan.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.publicDescription}</p>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-3xl font-bold text-foreground">{plan.priceLabel}</span>
                    <span className="pb-1 text-sm font-medium text-muted-foreground">/mês</span>
                  </div>
                  {plan.pricingNote ? (
                    <p className="mt-2 text-xs font-semibold text-primary">{plan.pricingNote}</p>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-transparent" aria-hidden>
                      Sem adicional
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-foreground/70">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={buildPublicPlanCheckoutRoute(plan.routeKey)}
                    className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold transition ${
                      plan.featured
                        ? "gradient-primary text-primary-foreground hover:opacity-95"
                        : "border border-border bg-white text-foreground hover:border-primary/30 hover:bg-primary/5"
                    }`}
                  >
                    Escolher plano
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 lg:pb-20">
          <div className="container mx-auto max-w-6xl">
            <div className="rounded-lg border border-primary/20 gradient-primary p-8 text-primary-foreground shadow-xl md:p-10">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4" />
                    Experimente sem compromisso
                  </div>
                  <h2 className="font-heading text-3xl font-bold leading-tight md:text-4xl">
                    Veja a demo ou crie sua conta para começar.
                  </h2>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-primary-foreground/90">
                    A demonstração é pública e segura. O ambiente real fica disponível após cadastro e autenticação.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Link
                    to="/cadastro"
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-foreground transition hover:bg-white/90"
                  >
                    Começar agora
                  </Link>
                  <Link
                    to="/demo"
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-5 text-sm font-semibold text-primary-foreground transition hover:bg-white/20"
                  >
                    Ver demonstração
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
