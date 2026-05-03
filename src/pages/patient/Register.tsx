import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Link2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { getSafeRedirectPath } from "@/services/auth";
import { signUpPatientWithInvite, validatePsychologistInviteCode } from "@/services/patientRegistration";
import { normalizeInviteCode } from "@/services/psychologistInvite";

type InviteState =
  | { status: "idle"; message: string; psychologistName: string; clinicName: string }
  | { status: "checking"; message: string; psychologistName: string; clinicName: string }
  | { status: "valid"; message: string; psychologistName: string; clinicName: string }
  | { status: "invalid"; message: string; psychologistName: string; clinicName: string };

type StatusPresentation = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  containerClassName: string;
  iconClassName: string;
};

const initialInviteState: InviteState = {
  status: "idle",
  message: "",
  psychologistName: "",
  clinicName: "",
};

const inviteSignals = [
  "Vinculo automatico com o profissional correto",
  "Acesso aos seus agendamentos e documentos",
  "Experiencia segura e coerente com a clinica",
];

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpfInput(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhoneInput(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function getInviteStatusPresentation(
  inviteState: InviteState,
  isInviteLocked: boolean,
): StatusPresentation {
  if (inviteState.status === "valid") {
    return {
      icon: CheckCircle2,
      eyebrow: "Convite validado",
      title: "Seu cadastro ja esta pronto para ser vinculado",
      description: inviteState.message,
      containerClassName: "border-primary/15 bg-primary/5 text-foreground",
      iconClassName: "text-primary",
    };
  }

  if (inviteState.status === "invalid") {
    return {
      icon: AlertCircle,
      eyebrow: "Convite indisponivel",
      title: "Nao conseguimos confirmar este codigo",
      description: inviteState.message,
      containerClassName: "border-destructive/20 bg-destructive/5 text-destructive",
      iconClassName: "text-destructive",
    };
  }

  if (inviteState.status === "checking") {
    return {
      icon: Sparkles,
      eyebrow: "Validando convite",
      title: "Estamos conferindo o codigo do psicologo",
      description: inviteState.message,
      containerClassName: "border-border/80 bg-muted/50 text-foreground",
      iconClassName: "text-primary",
    };
  }

  if (isInviteLocked) {
    return {
      icon: Link2,
      eyebrow: "Convite reconhecido",
      title: "Seu codigo chegou preenchido pelo link",
      description: "Conferimos esse convite automaticamente enquanto voce conclui o cadastro.",
      containerClassName: "border-border/80 bg-muted/50 text-foreground",
      iconClassName: "text-primary",
    };
  }

  return {
    icon: ShieldCheck,
    eyebrow: "Cadastro guiado",
    title: "Complete seus dados para entrar no portal do paciente",
    description: "Assim que o codigo for validado, seu acesso sera vinculado automaticamente.",
    containerClassName: "border-border/80 bg-muted/50 text-foreground",
    iconClassName: "text-primary",
  };
}

function buildInputShellClassName(isReadOnly = false) {
  return `group flex items-center rounded-2xl border border-border/90 pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12 ${
    isReadOnly
      ? "bg-[linear-gradient(180deg,rgba(243,241,248,0.96),rgba(239,236,245,0.92))]"
      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,242,249,0.88))]"
  }`;
}

export default function PatientRegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lockedInviteCode = normalizeInviteCode(searchParams.get("codigo") || "");
  const isInviteLocked = Boolean(lockedInviteCode);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [inviteCode, setInviteCode] = useState(lockedInviteCode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inviteState, setInviteState] = useState<InviteState>(initialInviteState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (lockedInviteCode) {
      setInviteCode(lockedInviteCode);
    }
  }, [lockedInviteCode]);

  const normalizedInviteCode = useMemo(() => normalizeInviteCode(inviteCode), [inviteCode]);
  const statusPresentation = getInviteStatusPresentation(inviteState, isInviteLocked);
  const StatusIcon = statusPresentation.icon;

  useEffect(() => {
    let isActive = true;

    async function validateInvite() {
      if (!normalizedInviteCode) {
        setInviteState(initialInviteState);
        return;
      }

      setInviteState({
        status: "checking",
        message: "Validando codigo do psicologo...",
        psychologistName: "",
        clinicName: "",
      });

      try {
        const psychologist = await validatePsychologistInviteCode(normalizedInviteCode);

        if (!isActive) return;

        setInviteState({
          status: "valid",
          message: "Codigo valido. Seu cadastro sera vinculado automaticamente.",
          psychologistName: psychologist.psychologistName,
          clinicName: psychologist.clinicName,
        });
      } catch (error) {
        if (!isActive) return;

        setInviteState({
          status: "invalid",
          message: error instanceof Error ? error.message : "Nao foi possivel validar o codigo informado.",
          psychologistName: "",
          clinicName: "",
        });
      }
    }

    const timeoutId = window.setTimeout(() => {
      void validateInvite();
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedInviteCode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Informe seu nome completo.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Informe seu e-mail.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("A confirmacao da senha nao confere.");
      return;
    }

    if (!onlyDigits(phone) || ![10, 11].includes(onlyDigits(phone).length)) {
      setErrorMessage("Informe um telefone valido.");
      return;
    }

    if (onlyDigits(cpf).length !== 11) {
      setErrorMessage("Informe um CPF valido.");
      return;
    }

    if (!normalizedInviteCode) {
      setErrorMessage("Informe o codigo do psicologo.");
      return;
    }

    if (inviteState.status === "invalid") {
      setErrorMessage(inviteState.message);
      return;
    }

    setIsSubmitting(true);

    try {
      const { appUser, requiresEmailConfirmation, psychologist, user } = await signUpPatientWithInvite({
        fullName,
        email,
        password,
        phone,
        cpf,
        inviteCode: normalizedInviteCode,
      });

      if (requiresEmailConfirmation) {
        toast.success(`Conta criada. Verifique seu e-mail para concluir o acesso com ${psychologist.psychologistName}.`);
        navigate("/login", { replace: true });
        return;
      }

      toast.success("Conta criada com sucesso.");
      navigate(getSafeRedirectPath(appUser, null, user), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel criar sua conta.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.18),transparent_24%),radial-gradient(circle_at_100%_0%,hsla(var(--accent),0.14),transparent_28%),linear-gradient(180deg,hsl(225_38%_96%),hsl(34_28%_96%)_58%,hsl(var(--background)))] px-4 py-8 sm:px-6 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-5rem] h-72 w-72 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-4rem] h-80 w-80 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm premium-shadow">
            <Sparkles className="h-4 w-4" />
            Convite e cadastro no mesmo fluxo
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary premium-shadow">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-left">
              <span className="font-heading text-xl font-bold text-foreground">Psivinculo</span>
              <p className="text-sm text-muted-foreground">Portal do paciente com a identidade da clinica</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[1.5rem] border border-border/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,244,252,0.94))] p-5 backdrop-blur-xl premium-shadow shadow-[0_36px_90px_-38px_rgba(79,88,156,0.34)] ring-1 ring-white/70 sm:rounded-[2rem] sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.22),transparent_62%)]"
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70 shadow-[0_10px_24px_-20px_rgba(80,92,150,0.45)]">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Cadastro de paciente
            </div>

            <div className="mt-6">
              <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-[2.1rem]">
                Crie sua conta para entrar no portal do Psivinculo.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/68">
                Complete seus dados para acessar agendamentos, recibos e comunicacoes com uma
                experiencia clara, acolhedora e coerente com o restante do produto.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {inviteSignals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-border/70 bg-white/72 px-3 py-1 text-xs font-medium text-foreground/68"
                >
                  {signal}
                </span>
              ))}
            </div>

            <div className={`mt-6 rounded-3xl border px-4 py-4 ${statusPresentation.containerClassName}`}>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white/80 p-2.5 shadow-[0_12px_28px_-22px_rgba(80,92,150,0.4)]">
                  <StatusIcon className={`h-5 w-5 ${statusPresentation.iconClassName}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">
                    {statusPresentation.eyebrow}
                  </p>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {statusPresentation.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {statusPresentation.description}
                  </p>
                  {inviteState.status === "valid" ? (
                    <p className="mt-2 text-xs font-medium text-foreground/72">
                      Vinculo com {inviteState.psychologistName}
                      {inviteState.clinicName ? ` • ${inviteState.clinicName}` : ""}.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Nome completo
                  </label>
                  <div className={buildInputShellClassName()}>
                    <User className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type="text"
                      name="full_name"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Seu nome"
                      className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    E-mail
                  </label>
                  <div className={buildInputShellClassName()}>
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
                    Telefone
                  </label>
                  <div className={buildInputShellClassName()}>
                    <Phone className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type="tel"
                      name="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                      placeholder="(00) 00000-0000"
                      className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Senha
                  </label>
                  <div className={buildInputShellClassName()}>
                    <Lock className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="new-password"
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

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Confirmar senha
                  </label>
                  <div className={buildInputShellClassName()}>
                    <Lock className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirm_password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="********"
                      className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
                      disabled={isSubmitting}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    CPF
                  </label>
                  <div className={buildInputShellClassName()}>
                    <Fingerprint className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type="text"
                      name="cpf"
                      autoComplete="off"
                      value={cpf}
                      onChange={(event) => setCpf(formatCpfInput(event.target.value))}
                      placeholder="000.000.000-00"
                      className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Codigo do psicologo
                    </label>
                    {isInviteLocked ? (
                      <span className="rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                        via link
                      </span>
                    ) : null}
                  </div>
                  <div className={buildInputShellClassName(isInviteLocked)}>
                    <Link2 className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                    <input
                      type="text"
                      name="invite_code"
                      autoComplete="off"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
                      placeholder="PSI-XXXXXX"
                      readOnly={isInviteLocked}
                      className="h-14 w-full bg-transparent px-3 text-sm font-medium tracking-[0.18em] text-foreground outline-none placeholder:text-muted-foreground/80"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

            {inviteState.status !== "idle" ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  inviteState.status === "valid"
                    ? "border-primary/15 bg-primary/5 text-foreground"
                    : inviteState.status === "checking"
                      ? "border-border bg-muted/50 text-muted-foreground"
                      : "border-destructive/20 bg-destructive/5 text-destructive"
                }`}
              >
                <div className="flex items-start gap-2">
                  {inviteState.status === "valid" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                  <div>
                    <p>{inviteState.message}</p>
                    {inviteState.status === "valid" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vinculo com {inviteState.psychologistName}
                        {inviteState.clinicName ? ` • ${inviteState.clinicName}` : ""}.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground premium-shadow shadow-[0_24px_42px_-20px_hsl(232_58%_52%/0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <span className="relative">{isSubmitting ? "Criando conta..." : "Criar conta"}</span>
              <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="mt-8 border-t border-border/70 pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ja tem uma conta?{" "}
              <Link to="/login" className="font-semibold text-primary transition-colors hover:text-primary/80">
                Entrar
              </Link>
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
