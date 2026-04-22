import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import {
  buildPublicPlanCheckoutRoute,
  type PublicPlanCheckoutKey,
} from "@/config/publicCheckout";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Calendar,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  Lock,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { PublicSiteFooter } from "@/components/public/PublicSiteFooter";
import { PSYCHOLOGIST_HOME_ROUTE } from "@/services/auth";

const heroMetrics = [
  { label: "Consultórios ativos", value: "+250", icon: Users },
  { label: "Tempo poupado por semana", value: "6h", icon: Clock3 },
  { label: "Experiência do paciente", value: "Portal 100% digital", icon: Sparkles },
];

const heroPillars = [
  "Agenda inteligente",
  "Prontuário digital",
  "Financeiro integrado",
  "Portal do paciente",
];

const features = [
  {
    icon: Calendar,
    title: "Agenda inteligente e previsível",
    desc: "Organize horários, confirmações e lembretes com uma visão clara do dia, da semana e da ocupação da clínica.",
    highlight: "Menos fricção operacional",
  },
  {
    icon: Users,
    title: "Gestão de pacientes sem ruído",
    desc: "Acompanhe cadastro, histórico, status de atendimento e próximos passos em uma experiência centralizada.",
    highlight: "Jornada clínica mais fluida",
  },
  {
    icon: FileText,
    title: "Prontuário digital bem estruturado",
    desc: "Registre evoluções, anexos e observações com mais contexto, organização e rapidez no dia a dia.",
    highlight: "Registro com mais clareza",
  },
  {
    icon: Shield,
    title: "Segurança e sigilo por padrão",
    desc: "Proteja dados sensíveis com uma base pensada para ambientes clínicos e operações que exigem confiança.",
    highlight: "Confiável desde a base",
  },
  {
    icon: BarChart3,
    title: "Indicadores para decidir melhor",
    desc: "Visualize faturamento, volume de atendimentos, ocupação e performance para crescer com mais controle.",
    highlight: "Gestão orientada por dados",
  },
  {
    icon: Heart,
    title: "Experiência premium para o paciente",
    desc: "Ofereça um portal digital elegante para agendamentos, recibos e interações com menos atrito.",
    highlight: "Mais percepção de valor",
  },
];

const benefits = [
  {
    icon: Lock,
    title: "Segurança com padrão profissional",
    desc: "Informações clínicas organizadas com mais controle, sigilo e consistência para sustentar uma operação séria.",
    tag: "Confiabilidade",
  },
  {
    icon: Sparkles,
    title: "Fluxos desenhados para psicólogos",
    desc: "Cada detalhe foi pensado para reduzir atrito na rotina e devolver atenção ao que realmente importa: o atendimento.",
    tag: "Experiência",
  },
  {
    icon: Smartphone,
    title: "Mobilidade sem perder contexto",
    desc: "Acompanhe agenda, pacientes e operação com fluidez no desktop, no tablet ou no celular.",
    tag: "Flexibilidade",
  },
];

const audience = [
  {
    title: "Psicólogos autônomos",
    desc: "Estruture agenda, prontuários e financeiro em um ambiente mais profissional desde o primeiro paciente.",
  },
  {
    title: "Consultórios em crescimento",
    desc: "Ganhe previsibilidade para coordenar equipe, horários, salas e rotina administrativa em um só painel.",
  },
  {
    title: "Clínicas com operação expandida",
    desc: "Centralize profissionais, permissões e indicadores com mais visão de negócio.",
  },
];

const plans = [
  {
    name: "Essencial",
    price: "R$ 39,99",
    period: "/mês",
    desc: "Para 1 psicólogo com até 50 pacientes",
    features: ["1 psicólogo", "Até 50 pacientes", "Agenda e prontuário", "Financeiro", "Suporte por e-mail"],
    highlighted: false,
  },
  {
    name: "Profissional",
    price: "R$ 59,99",
    period: "/mês",
    desc: "Para 1 psicólogo com pacientes ilimitados",
    features: ["1 psicólogo", "Pacientes ilimitados", "Agenda e prontuário", "Relatórios completos", "Financeiro", "Suporte por e-mail"],
    highlighted: true,
  },
  {
    name: "Clínica Duo",
    price: "R$ 99,99",
    period: "/mês",
    desc: "Para clínicas com 2 psicólogos",
    features: ["2 psicólogos", "Pacientes ilimitados", "Agenda compartilhada", "Gestão administrativa", "Relatórios consolidados", "Suporte prioritário"],
    highlighted: false,
  },
  {
    name: "Clínica Expansão",
    price: "R$ 99,99",
    period: "+ R$ 39,99 por psicólogo",
    desc: "Para clínicas em expansão com equipe crescente",
    features: ["Base para expansão da equipe", "Pacientes ilimitados", "Gestão administrativa", "Permissões avançadas", "Relatórios consolidados", "Suporte prioritário"],
    highlighted: false,
  },
];

const planCheckoutKeys: PublicPlanCheckoutKey[] = [
  "essencial",
  "profissional",
  "clinica-duo",
  "clinica-expansao",
];

const testimonials = [
  {
    name: "Dra. Mariana Alves",
    role: "Psicóloga clínica",
    text: "O Psivínculo transformou a gestão do meu consultório. Economizo horas por semana, e meus pacientes adoram o portal.",
    rating: 5,
  },
  {
    name: "Dr. Felipe Costa",
    role: "Neuropsicólogo",
    text: "Finalmente, um sistema que entende as necessidades do psicólogo. Interface bonita, prática e segura.",
    rating: 5,
  },
  {
    name: "Clínica Equilíbrio",
    role: "São Paulo - SP",
    text: "Gerenciamos 8 profissionais com facilidade. Os relatórios nos ajudam a tomar decisões estratégicas.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "O Psivínculo é seguro para armazenar dados de pacientes?",
    a: "Sim. Utilizamos criptografia, controle de acesso e uma estrutura pensada para proteger dados sensíveis em contexto clínico.",
  },
  {
    q: "Posso migrar meus dados de outro sistema?",
    a: "Sim. A equipe auxilia no processo de transição para reduzir atrito e preservar o histórico necessário da operação.",
  },
  {
    q: "O paciente precisa baixar algum aplicativo?",
    a: "Não. O portal do paciente é 100% web e funciona em qualquer navegador, sem necessidade de instalação.",
  },
  {
    q: "Os planos mudam conforme o tamanho da clínica?",
    a: "Sim. Há planos para psicólogos autônomos, clínicas com dois profissionais e clínicas em expansão. A escolha depende da estrutura e do momento da operação.",
  },
  {
    q: "Como funciona o suporte?",
    a: "Oferecemos suporte por e-mail e canais prioritários nos planos mais completos, acompanhando a maturidade da sua operação.",
  },
];

const navLinks = [
  { label: "Funcionalidades", href: "#features" },
  { label: "Planos", href: "#pricing" },
  { label: "Depoimentos", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
];

const sectionBadgeClass =
  "inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary shadow-[0_18px_42px_-30px_rgba(67,77,149,0.38)] backdrop-blur-md";
const sectionTitleClass =
  "mt-6 font-heading text-3xl font-bold leading-tight tracking-[-0.04em] text-foreground md:text-4xl lg:text-5xl";
const sectionDescriptionClass = "mt-5 text-lg leading-8 text-foreground/68";
const premiumPanelClass =
  "relative overflow-hidden rounded-[2rem] border border-white/65 bg-white/78 shadow-[0_28px_90px_-42px_rgba(49,61,114,0.36)] backdrop-blur-xl";
const surfaceCardClass =
  "relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/84 shadow-[0_22px_70px_-40px_rgba(45,58,109,0.32)] backdrop-blur-xl transition-all duration-300";
const primaryButtonClass =
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_24px_60px_-24px_hsl(220_65%_60%/0.72)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_70px_-22px_hsl(220_65%_60%/0.76)]";
const secondaryButtonClass =
  "group inline-flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-white/82 px-8 py-4 text-base font-semibold text-foreground shadow-[0_20px_50px_-36px_rgba(45,58,109,0.3)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-white";

export default function LandingPage() {
  function handlePricingClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    const pricingSection = document.getElementById("pricing");
    if (!pricingSection) return;

    pricingSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(220_43%_97%)_34%,hsl(var(--background))_72%)]" />
        <div className="absolute left-[-8rem] top-[-7rem] h-[24rem] w-[24rem] rounded-full bg-primary/18 blur-3xl" />
        <div className="absolute right-[-7rem] top-16 h-[22rem] w-[22rem] rounded-full bg-accent/16 blur-3xl" />
        <div className="absolute bottom-8 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.3] [background-image:linear-gradient(to_right,rgba(95,112,167,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(95,112,167,0.08)_1px,transparent_1px)] [background-size:82px_82px] [mask-image:linear-gradient(to_bottom,white,transparent_72%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/55 bg-background/78 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
        <div className="container mx-auto flex h-20 items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] gradient-primary shadow-[0_18px_40px_-20px_hsl(220_65%_60%/0.72)] ring-1 ring-white/55">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-heading text-xl font-bold tracking-[-0.03em] text-foreground">Psivínculo</span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/46">
                gestão premium para psicólogos
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-white/70 bg-white/70 p-1.5 shadow-[0_20px_48px_-36px_rgba(45,58,109,0.28)] backdrop-blur-md md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-foreground/68 transition-all hover:bg-primary/8 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground sm:inline-flex"
            >
              Entrar
            </Link>
            <a
              href="#pricing"
              onClick={handlePricingClick}
              className="rounded-full gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_18px_44px_-24px_hsl(220_65%_60%/0.72)] transition-all hover:-translate-y-0.5 hover:opacity-95"
            >
              Ver planos
            </a>
          </div>
        </div>
      </header>

      <section className="relative px-4 pb-24 pt-16 lg:pb-28 lg:pt-24">
        <div className="container relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/84 px-5 py-2 text-sm font-medium text-primary shadow-[0_24px_60px_-34px_rgba(67,77,149,0.42)] backdrop-blur-md">
              <Smartphone className="h-4 w-4" />
              <span>Novo: portal do paciente 100% digital</span>
            </div>

            <h1 className="mt-8 font-heading text-5xl font-extrabold leading-[0.96] tracking-[-0.05em] text-foreground md:text-6xl lg:text-[5.35rem]">
              A plataforma premium para organizar sua clínica com
              <span className="block pt-2 text-gradient">clareza, presença e segurança.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-foreground/72 md:text-xl">
              Agenda, prontuários, financeiro e gestão de pacientes em um só lugar, com uma experiência
              elegante para profissionais que querem mais controle sem perder leveza na rotina.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href="#pricing" onClick={handlePricingClick} className={`${primaryButtonClass} min-w-[250px]`}>
                <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="relative">Ver planos</span>
                <ArrowRight className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </a>

              <Link to={PSYCHOLOGIST_HOME_ROUTE} className={`${secondaryButtonClass} min-w-[228px]`}>
                <span>Ver demonstração</span>
                <ChevronRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {heroPillars.map((item) => (
                <div
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-border/65 bg-white/72 px-4 py-2 text-sm font-medium text-foreground/72 shadow-[0_18px_42px_-36px_rgba(45,58,109,0.28)] backdrop-blur-sm"
                >
                  <Check className="h-4 w-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-5 text-sm font-medium text-foreground/52">
              Sem cartão de crédito · Implantação simples · Cancele quando quiser
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
            {heroMetrics.map((item) => (
              <div
                key={item.label}
                className={`${surfaceCardClass} group px-6 py-6 text-left hover:-translate-y-1 hover:border-primary/18`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.78),rgba(247,245,251,0.7))]" />
                <div className="relative">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors group-hover:bg-primary/14">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-2xl font-bold tracking-[-0.03em] text-foreground">{item.value}</p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/62">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="mockup" className="px-4 pb-24">
        <div className="container mx-auto max-w-6xl">
          <div className={`${premiumPanelClass} overflow-hidden`}>
            <div className="flex h-12 items-center justify-between border-b border-border/55 bg-white/72 px-5">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive/40" />
                <div className="h-3 w-3 rounded-full bg-warning/40" />
                <div className="h-3 w-3 rounded-full bg-success/40" />
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary sm:inline-flex">
                <Sparkles className="h-3.5 w-3.5" />
                Demonstração premium
              </div>
            </div>

            <div className="relative bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(240,244,251,0.82))] p-6 lg:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.16),transparent_28%),radial-gradient(circle_at_92%_12%,hsla(var(--accent),0.14),transparent_24%)]" />

              <div className="relative">
                <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/82">Visão do produto</p>
                    <h2 className="mt-3 font-heading text-2xl font-bold tracking-[-0.04em] text-foreground md:text-3xl">
                      Operação clínica com leitura imediata e acabamento premium.
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/72 px-4 py-3 text-sm leading-relaxed text-foreground/68 shadow-[0_18px_46px_-34px_rgba(45,58,109,0.28)] backdrop-blur-md">
                    Do primeiro agendamento ao financeiro, tudo conversa em uma experiência mais elegante.
                  </div>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[
                    { label: "Consultas Hoje", value: "6", color: "text-primary" },
                    { label: "Pacientes Ativos", value: "42", color: "text-secondary" },
                    { label: "Receita do Mês", value: "R$ 18.750", color: "text-success" },
                    { label: "Taxa de Ocupação", value: "78%", color: "text-accent" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.35rem] border border-white/75 bg-white/84 p-5 shadow-[0_20px_54px_-40px_rgba(45,58,109,0.28)]"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/48">{item.label}</p>
                      <p className={`mt-3 text-2xl font-bold tracking-[-0.03em] ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/75 bg-white/84 p-5 shadow-[0_20px_54px_-40px_rgba(45,58,109,0.28)]">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-foreground">Agenda do Dia</p>
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                        em andamento
                      </span>
                    </div>

                    <div className="space-y-3">
                      {["08:00 - Maria Silva", "09:00 - Carlos Eduardo", "10:00 - Ana Beatriz"].map((item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-2xl border border-border/55 bg-background/72 px-4 py-3 text-sm text-foreground/70"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                            <span>{item}</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-foreground/35" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/75 bg-white/84 p-5 shadow-[0_20px_54px_-40px_rgba(45,58,109,0.28)]">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-foreground">Atendimentos por Mês</p>
                      <span className="rounded-full bg-secondary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
                        crescimento
                      </span>
                    </div>

                    <div className="flex h-36 items-end justify-between gap-3 px-2">
                      {[45, 60, 72, 68, 80, 85].map((value, index) => (
                        <div key={value} className="flex flex-1 flex-col items-center gap-2">
                          <div
                            className="w-full rounded-t-[0.85rem] bg-[linear-gradient(180deg,hsl(var(--primary)),hsl(var(--accent)))] shadow-[0_16px_34px_-22px_hsl(220_65%_60%/0.65)]"
                            style={{ height: `${value}%` }}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/46">
                            {["J", "F", "M", "A", "M", "J"][index]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Experiência pensada para a rotina clínica</span>
            <h2 className={sectionTitleClass}>Mais do que um sistema, uma base sólida para crescer com confiança.</h2>
            <p className={sectionDescriptionClass}>
              O Psivínculo combina organização, cuidado com a experiência e controle operacional em uma
              interface elegante, criada para valorizar a prática profissional.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className={`${surfaceCardClass} group p-7 hover:-translate-y-1 hover:border-primary/18`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.1),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,244,251,0.8))]" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-[0_18px_40px_-22px_hsl(220_65%_60%/0.7)]">
                    <benefit.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">{benefit.tag}</p>
                  <h3 className="mt-3 font-heading text-xl font-semibold leading-snug text-foreground">{benefit.title}</h3>
                  <p className="mt-3 text-base leading-7 text-foreground/66">{benefit.desc}</p>
                  <div className="mt-6 h-px w-full bg-gradient-to-r from-primary/24 via-border to-transparent" />
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/44">Design premium</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-[linear-gradient(180deg,rgba(232,238,247,0.42),rgba(255,255,255,0.18))] px-4 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Funcionalidades que conectam clínica e gestão</span>
            <h2 className={sectionTitleClass}>Tudo o que você precisa para operar com mais sofisticação.</h2>
            <p className={sectionDescriptionClass}>
              Recursos completos para profissionalizar a rotina clínica, melhorar a experiência do paciente
              e criar uma operação mais previsível.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`${surfaceCardClass} group p-7 hover:-translate-y-1 hover:border-primary/18`}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,252,0.82))]" />
                <div className="relative">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition-colors group-hover:bg-primary/14">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/46">
                      {feature.highlight}
                    </span>
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-3 text-base leading-7 text-foreground/66">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Estrutura para cada estágio da operação</span>
            <h2 className={sectionTitleClass}>Para quem quer elevar a percepção de valor da clínica.</h2>
            <p className={sectionDescriptionClass}>
              O produto acompanha desde a prática individual até a expansão da operação, com mais pessoas,
              processos e necessidade de visão gerencial.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {audience.map((item) => (
              <div
                key={item.title}
                className={`${surfaceCardClass} p-7 hover:-translate-y-1 hover:border-secondary/24`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--secondary),0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(246,248,252,0.84))]" />
                <div className="relative">
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl gradient-seafoam shadow-[0_18px_40px_-24px_hsl(175_35%_55%/0.74)]">
                    <Users className="h-7 w-7 text-secondary-foreground" />
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-3 text-base leading-7 text-foreground/66">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-28 bg-[linear-gradient(180deg,rgba(232,238,247,0.34),rgba(255,255,255,0.14))] px-4 py-24"
      >
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Planos claros para cada fase da operação</span>
            <h2 className={sectionTitleClass}>Preços que acompanham o momento da sua clínica.</h2>
            <p className={sectionDescriptionClass}>
              Comece com uma estrutura enxuta e evolua para uma operação mais robusta sem trocar de plataforma.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {["Comece grátis", "Sem fidelidade", "Evolução simples"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border/65 bg-white/78 px-4 py-2 text-sm font-medium text-foreground/66 shadow-[0_18px_42px_-36px_rgba(45,58,109,0.24)] backdrop-blur-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, index) => {
              const checkoutRoute = buildPublicPlanCheckoutRoute(planCheckoutKeys[index] || "essencial");
              const isExpansionPlan = plan.name === "Clínica Expansão";

              return (
                <div key={plan.name} className="group relative h-full">
                  <div
                    aria-hidden
                    className={`absolute inset-0 rounded-[2rem] transition-all duration-300 ${
                      plan.highlighted
                        ? "bg-[linear-gradient(180deg,rgba(241,246,255,0.94),rgba(235,241,252,0.88))] shadow-[0_30px_86px_-42px_hsl(220_65%_60%/0.38)]"
                        : "bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(247,249,252,0.8))] shadow-[0_24px_74px_-42px_rgba(45,58,109,0.22)] group-hover:shadow-[0_28px_82px_-40px_rgba(45,58,109,0.28)]"
                    }`}
                  />

                  <div
                    className={`relative flex h-full min-h-[34rem] flex-col overflow-hidden rounded-[2rem] border p-7 md:p-8 ${
                      plan.highlighted
                        ? "border-primary/20 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.1),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,246,255,0.92))] ring-1 ring-primary/10"
                        : "border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,249,252,0.9))] backdrop-blur-sm group-hover:border-primary/12"
                    }`}
                  >
                    <div className="flex min-h-[7.5rem] flex-col">
                      {plan.highlighted ? (
                        <span className="mb-4 inline-flex w-fit items-center rounded-full border border-primary/14 bg-white/88 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary shadow-[0_16px_34px_-28px_hsl(220_65%_60%/0.56)]">
                          Mais popular
                        </span>
                      ) : (
                        <span className="mb-4 inline-flex w-fit rounded-full border border-border/65 bg-white/82 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/46">
                          Plano premium
                        </span>
                      )}

                      <h3 className="max-w-[12rem] font-heading text-[1.65rem] font-bold leading-tight tracking-[-0.04em] text-foreground">
                        {plan.name}
                      </h3>

                      <p className="mt-4 min-h-[3rem] text-sm leading-6 text-foreground/62">{plan.desc}</p>
                    </div>

                    <div className="mt-8">
                      <div className="flex items-end gap-2">
                        <span className="text-[2.6rem] font-bold leading-none tracking-[-0.05em] text-foreground">
                          {plan.price}
                        </span>
                        {!isExpansionPlan ? (
                          <span className="pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/40">
                            {plan.period}
                          </span>
                        ) : null}
                      </div>

                      {isExpansionPlan ? (
                        <p className="mt-3 text-sm font-semibold leading-6 text-primary">{plan.period}</p>
                      ) : (
                        <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-foreground/36">
                          cobrança mensal
                        </p>
                      )}
                    </div>

                    <div className="mt-6 h-px w-full bg-gradient-to-r from-primary/18 via-border to-transparent" />

                    <ul className="mt-6 flex-1 space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className={`flex items-start gap-3 rounded-2xl px-1 py-1 text-sm leading-6 ${
                            plan.highlighted
                              ? "text-foreground/70"
                              : "text-foreground/66"
                          }`}
                        >
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                              plan.highlighted ? "bg-primary/10" : "bg-success/10"
                            }`}
                          >
                            <Check className={`h-3.5 w-3.5 ${plan.highlighted ? "text-primary" : "text-success"}`} />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      to={checkoutRoute}
                      className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl py-4 text-sm font-semibold transition-all ${
                        plan.highlighted
                          ? "gradient-primary text-primary-foreground shadow-[0_22px_56px_-28px_hsl(220_65%_60%/0.62)] hover:-translate-y-0.5 hover:opacity-95"
                          : "border border-border/70 bg-white/84 text-foreground shadow-[0_18px_44px_-34px_rgba(45,58,109,0.18)] hover:-translate-y-0.5 hover:border-primary/14 hover:bg-white"
                      }`}
                    >
                      Escolher plano
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="testimonials" className="px-4 py-24">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Resultados percebidos na prática</span>
            <h2 className={sectionTitleClass}>O que profissionais e clínicas dizem sobre a experiência.</h2>
            <p className={sectionDescriptionClass}>
              A proposta do Psivínculo não é só organizar a rotina, mas fazer a operação parecer mais segura,
              fluida e profissional em cada ponto de contato.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((item) => (
              <div
                key={item.name}
                className={`${surfaceCardClass} p-7 hover:-translate-y-1 hover:border-primary/16`}
              >
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,248,252,0.82))]" />
                <span className="absolute right-6 top-4 font-heading text-6xl leading-none text-primary/10">"</span>

                <div className="relative">
                  <div className="mb-5 flex gap-1">
                    {Array.from({ length: item.rating }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>

                  <p className="text-base italic leading-8 text-foreground/68">"{item.text}"</p>

                  <div className="mt-7 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-seafoam text-sm font-semibold text-secondary-foreground shadow-[0_18px_40px_-24px_hsl(175_35%_55%/0.74)]">
                      {item.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/42">{item.role}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[linear-gradient(180deg,rgba(232,238,247,0.34),rgba(255,255,255,0.14))] px-4 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mx-auto max-w-3xl text-center">
            <span className={sectionBadgeClass}>Perguntas frequentes</span>
            <h2 className={sectionTitleClass}>Respostas claras para decidir com mais segurança.</h2>
            <p className={sectionDescriptionClass}>
              Tudo o que você precisa entender antes de iniciar a experiência com mais confiança e menos fricção.
            </p>
          </div>

          <div className="mt-16 space-y-4">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group overflow-hidden rounded-[1.6rem] border border-white/72 bg-white/84 px-6 shadow-[0_20px_56px_-42px_rgba(45,58,109,0.26)] transition-all duration-300 hover:border-primary/16"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-semibold text-foreground">
                  <span>{faq.q}</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/8 text-primary">
                    <ChevronRight className="h-4 w-4 transition-transform duration-300 group-open:rotate-90" />
                  </div>
                </summary>
                <div className="pb-5 text-base leading-7 text-foreground/66">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-24">
        <div className="container mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-primary/18 gradient-primary p-10 text-center shadow-[0_34px_110px_-42px_hsl(220_65%_60%/0.58)] lg:p-16">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-6rem] top-[-6rem] h-52 w-52 rounded-full bg-white/16 blur-3xl" />
              <div className="absolute bottom-[-5rem] right-[-4rem] h-56 w-56 rounded-full bg-secondary/24 blur-3xl" />
              <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,rgba(255,255,255,0.34)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.34)_1px,transparent_1px)] [background-size:88px_88px]" />
            </div>

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/26 bg-white/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/88 backdrop-blur-sm">
                <Sparkles className="h-4 w-4" />
                Sua operação pode parecer tão premium quanto o seu cuidado
              </span>

              <h2 className="mt-6 font-heading text-3xl font-bold leading-tight tracking-[-0.04em] text-primary-foreground md:text-5xl">
                Pronto para transformar a percepção da sua prática?
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-primary-foreground/84">
                Comece gratuitamente e veja como o Psivínculo pode trazer mais organização, consistência
                e sofisticação para a sua rotina.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  to="/cadastro"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-semibold text-foreground shadow-[0_24px_54px_-28px_rgba(23,33,66,0.42)] transition-all hover:-translate-y-0.5 hover:bg-white/96"
                >
                  Criar Conta Grátis
                  <ArrowRight className="h-5 w-5" />
                </Link>

                <Link
                  to={PSYCHOLOGIST_HOME_ROUTE}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/24 bg-white/10 px-8 py-4 text-base font-semibold text-primary-foreground backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/14"
                >
                  Ver demonstração
                  <ChevronRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </div>
  );
}
