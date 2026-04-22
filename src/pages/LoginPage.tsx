import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import {
  getRememberPreference,
  getSafeRedirectPath,
  isValidEmail,
  signInWithEmailPassword,
} from "@/services/auth";

const heroStats = [
  { label: "Sessoes confirmadas", value: "08", icon: Calendar },
  { label: "Adesao da agenda", value: "94%", icon: Activity },
  { label: "Recebimentos", value: "R$ 4,2k", icon: Wallet },
];

const heroTimeline = [
  { time: "08:00", title: "Ana Beatriz", detail: "Sessao confirmada para hoje" },
  { time: "10:00", title: "Carlos Eduardo", detail: "Prontuario atualizado" },
  { time: "14:00", title: "Fernanda Lima", detail: "Pagamento registrado" },
];

const trustSignals = [
  { icon: ShieldCheck, label: "Seguranca pensada para contexto clinico" },
  { icon: CheckCircle2, label: "Fluxos refinados para a rotina do consultorio" },
  { icon: Sparkles, label: "Experiencia premium para profissionais e pacientes" },
];

const weeklyBars = [42, 76, 58, 88, 70, 64];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => getRememberPreference());
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectFrom =
    typeof location.state === "object" && location.state && "from" in location.state
      ? String(location.state.from || "")
      : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage("Informe seu e-mail.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Informe um e-mail valido.");
      return;
    }

    if (!password.trim()) {
      setErrorMessage("Informe sua senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { appUser, user } = await signInWithEmailPassword({
        email: normalizedEmail,
        password,
        rememberMe,
      });

      toast.success("Login realizado com sucesso.");
      navigate(getSafeRedirectPath(appUser, redirectFrom, user), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel autenticar agora.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.18),transparent_24%),radial-gradient(circle_at_100%_0%,hsla(var(--accent),0.18),transparent_28%),linear-gradient(180deg,hsl(225_38%_96%),hsl(34_28%_96%)_56%,hsl(var(--background)))]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-7rem] top-[-5rem] h-72 w-72 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-4rem] h-80 w-80 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <section className="relative hidden overflow-hidden border-r border-white/12 lg:flex lg:w-1/2 xl:w-[54%] bg-[radial-gradient(circle_at_top_left,hsla(var(--accent),0.42),transparent_24%),radial-gradient(circle_at_82%_18%,hsla(var(--secondary),0.30),transparent_22%),radial-gradient(circle_at_50%_120%,hsla(var(--primary),0.34),transparent_40%),linear-gradient(160deg,hsl(228_58%_14%),hsl(236_49%_22%)_42%,hsl(252_38%_30%)_72%,hsl(218_56%_19%))]">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.15] [background-image:linear-gradient(to_right,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:86px_86px]"
          />
          <div aria-hidden className="absolute left-[10%] top-[12%] h-48 w-48 rounded-full bg-white/14 blur-3xl" />
          <div aria-hidden className="absolute bottom-[8%] right-[8%] h-56 w-56 rounded-full bg-accent/25 blur-3xl" />

          <div className="relative flex w-full items-center px-12 py-14 xl:px-16">
            <div className="mx-auto w-full max-w-2xl text-[hsl(230_30%_22%)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/34 bg-white/62 px-4 py-2 text-sm font-medium text-[hsl(230_32%_24%)] backdrop-blur-md shadow-[0_16px_36px_-24px_rgba(31,44,91,0.45)]">
                <Sparkles className="h-4 w-4" />
                Plataforma premium para psicologos e clinicas
              </div>

              <div className="mt-8 max-w-xl">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/58 backdrop-blur-md shadow-[0_12px_30px_-18px_rgba(28,42,88,0.38)]">
                    <Brain className="h-7 w-7 text-[hsl(231_38%_28%)]" />
                  </div>
                  <div>
                    <p className="font-heading text-2xl font-bold tracking-[-0.03em] text-[hsl(231_42%_18%)]">Psivinculo</p>
                    <p className="text-sm text-[hsl(228_20%_38%)]">Clareza, presenca e confianca na rotina clinica</p>
                  </div>
                </div>

                <h1 className="font-heading text-5xl font-bold leading-[1.02] tracking-[-0.045em] text-[hsl(231_46%_17%)] xl:text-[3.7rem]">
                  Clareza operacional para uma rotina clinica mais humana.
                </h1>
                <p className="mt-6 text-lg leading-relaxed text-[hsl(227_23%_34%)]">
                  Agenda, prontuarios, financeiro e relacionamento com pacientes em uma experiencia
                  sofisticada, segura e tranquila para consultorios modernos.
                </p>
              </div>

              <div className="relative mt-12 max-w-xl">
                <div className="overflow-hidden rounded-[2rem] border border-white/34 bg-[linear-gradient(180deg,rgba(255,255,255,0.66),rgba(241,241,251,0.54))] p-6 backdrop-blur-xl shadow-[0_28px_90px_-42px_rgba(26,40,86,0.52)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.22em] text-[hsl(228_18%_44%)]">
                        Visao do dia
                      </p>
                      <p className="mt-2 font-heading text-2xl font-semibold text-[hsl(231_40%_18%)]">
                        Sua clinica, em equilibrio.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/38 bg-white/70 px-3 py-1 text-xs font-semibold text-[hsl(230_28%_28%)]">
                      Ao vivo
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {heroStats.map((item, index) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-white/30 bg-white/54 p-4"
                        style={{ animationDelay: `${index * 90}ms` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <item.icon className="h-4 w-4 text-[hsl(230_40%_28%)]" />
                          <span className="text-xs text-[hsl(228_16%_48%)]">Hoje</span>
                        </div>
                        <p className="mt-4 text-2xl font-semibold text-[hsl(231_42%_18%)]">{item.value}</p>
                        <p className="mt-1 text-xs text-[hsl(228_18%_40%)]">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-3xl border border-white/28 bg-white/50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[hsl(231_38%_21%)]">Proximos movimentos</p>
                        <span className="text-xs text-[hsl(228_16%_46%)]">Hoje</span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {heroTimeline.map((item) => (
                          <div key={`${item.time}-${item.title}`} className="flex items-start gap-3">
                            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-xl bg-[hsl(229_70%_96%)] text-xs font-semibold text-[hsl(231_30%_30%)]">
                              {item.time}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[hsl(231_42%_20%)]">{item.title}</p>
                              <p className="mt-1 text-xs text-[hsl(227_18%_39%)]">{item.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/28 bg-white/50 p-4">
                      <p className="text-sm font-semibold text-[hsl(231_38%_21%)]">Ritmo da semana</p>
                      <div className="mt-5 flex h-28 items-end gap-2">
                        {weeklyBars.map((value, index) => (
                          <div key={value} className="flex flex-1 flex-col items-center gap-2">
                            <div
                              className="w-full rounded-t-2xl bg-gradient-to-t from-[hsl(236_56%_48%/0.28)] via-[hsl(249_64%_58%/0.5)] to-[hsl(219_91%_62%/0.88)]"
                              style={{ height: `${value}%` }}
                            />
                            <span className="text-[10px] text-[hsl(228_16%_46%)]">{["S", "T", "Q", "Q", "S", "S"][index]}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-xs leading-relaxed text-[hsl(227_18%_39%)]">
                        Visibilidade de agenda, confirmacoes e receita em um unico fluxo.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="absolute -right-10 top-10 hidden w-56 rounded-3xl border border-white/36 bg-white/74 p-4 backdrop-blur-xl shadow-[0_18px_42px_-26px_rgba(28,42,88,0.42)] xl:block">
                  <div className="flex items-center gap-2 text-[hsl(231_38%_20%)]">
                    <CheckCircle2 className="h-4 w-4 text-seafoam" />
                    <span className="text-sm font-semibold">Paciente confirmou</span>
                  </div>
                  <p className="mt-3 text-sm text-[hsl(227_20%_35%)]">Maria Silva confirmou a sessao de amanha as 08:00.</p>
                </div>

                <div className="absolute -bottom-8 left-[-2.5rem] hidden w-52 rounded-3xl border border-white/36 bg-white/74 p-4 backdrop-blur-xl shadow-[0_18px_42px_-26px_rgba(28,42,88,0.42)] xl:block">
                  <div className="flex items-center gap-2 text-[hsl(231_38%_20%)]">
                    <ShieldCheck className="h-4 w-4 text-[hsl(231_38%_28%)]" />
                    <span className="text-sm font-semibold">Ambiente protegido</span>
                  </div>
                  <p className="mt-3 text-sm text-[hsl(227_20%_35%)]">Dados sensiveis tratados com foco em confianca e privacidade.</p>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {trustSignals.map((item) => (
                  <div
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/48 px-4 py-2 text-sm text-[hsl(228_22%_31%)] backdrop-blur-sm"
                  >
                    <item.icon className="h-4 w-4 text-[hsl(231_36%_30%)]" />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.16),transparent_32%),radial-gradient(circle_at_85%_18%,hsla(var(--accent),0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.28),transparent_42%)]"
          />

          <div className="relative w-full max-w-xl">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm premium-shadow">
                <Sparkles className="h-4 w-4" />
                Gestao premium para psicologos e clinicas
              </div>

              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary premium-shadow">
                  <Brain className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-heading text-xl font-bold text-foreground">Psivinculo</span>
                  <p className="text-sm text-muted-foreground">Mais clareza para a sua rotina clinica</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-border/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,244,252,0.94))] p-8 backdrop-blur-xl premium-shadow shadow-[0_36px_90px_-38px_rgba(79,88,156,0.34)] ring-1 ring-white/70 sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.22),transparent_62%)]"
              />

              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70 shadow-[0_10px_24px_-20px_rgba(80,92,150,0.45)]">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Acesso profissional
                </div>

                <div className="mt-6">
                  <h2 className="font-heading text-3xl font-bold tracking-[-0.03em] text-foreground">
                    Entre para continuar sua rotina clinica com mais presenca.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/68">
                    Seu espaco para acompanhar agenda, pacientes e operacao com a mesma serenidade
                    que voce oferece em cada atendimento.
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-border/70 bg-white/72 px-3 py-1 text-xs font-medium text-foreground/68">
                    Sessao segura
                  </span>
                  <span className="rounded-full border border-border/70 bg-white/72 px-3 py-1 text-xs font-medium text-foreground/68">
                    Dados protegidos
                  </span>
                  <span className="rounded-full border border-border/70 bg-white/72 px-3 py-1 text-xs font-medium text-foreground/68">
                    UX pensada para clinicas
                  </span>
                </div>

                {errorMessage ? (
                  <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errorMessage}
                  </div>
                ) : null}

                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      E-mail
                    </label>
                    <div className="group flex items-center rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,242,249,0.88))] pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12">
                      <Mail className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="seu@email.com"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Senha
                    </label>
                    <div className="group flex items-center rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,242,249,0.88))] pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12">
                      <Lock className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="********"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                        disabled={isSubmitting}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                        disabled={isSubmitting}
                      />
                      Lembrar de mim
                    </label>

                    <Link to="/recuperar-senha" className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
                      Esqueci minha senha
                    </Link>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground premium-shadow shadow-[0_24px_42px_-20px_hsl(232_58%_52%/0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    <span className="relative">{isSubmitting ? "Entrando..." : "Entrar"}</span>
                    <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </form>

                <div className="mt-8 border-t border-border/70 pt-6">
                  <p className="text-center text-sm text-muted-foreground">
                    Nao tem uma conta? Escolha como deseja se cadastrar.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link
                      to="/cadastro/psicologo"
                      className="inline-flex items-center justify-center rounded-2xl border border-border/80 bg-white/72 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      Cadastrar como psicologo
                    </Link>
                    <Link
                      to="/cadastro/clinica"
                      className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:border-primary/35 hover:bg-primary/10"
                    >
                      Cadastrar como clinica
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
