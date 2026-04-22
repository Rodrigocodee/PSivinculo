import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { getSafeRedirectPath, isValidEmail, signUpPsychologist } from "@/services/auth";
import { normalizeClinicInviteCode, validateClinicInviteCode } from "@/services/currentAdmin";

type InviteState =
  | { status: "idle"; message: string; clinicName: string }
  | { status: "checking"; message: string; clinicName: string }
  | { status: "valid"; message: string; clinicName: string }
  | { status: "invalid"; message: string; clinicName: string };

const initialInviteState: InviteState = {
  status: "idle",
  message: "",
  clinicName: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lockedInviteCode = normalizeClinicInviteCode(searchParams.get("codigo") || "");
  const isInviteLocked = Boolean(lockedInviteCode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState(lockedInviteCode);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inviteState, setInviteState] = useState<InviteState>(initialInviteState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedInviteCode = normalizeClinicInviteCode(inviteCode);

  useEffect(() => {
    if (lockedInviteCode) {
      setInviteCode(lockedInviteCode);
    }
  }, [lockedInviteCode]);

  useEffect(() => {
    let isActive = true;

    async function validateInvite() {
      if (!normalizedInviteCode) {
        setInviteState(initialInviteState);
        return;
      }

      setInviteState({
        status: "checking",
        message: "Validando codigo da clinica...",
        clinicName: "",
      });

      try {
        const clinic = await validateClinicInviteCode(normalizedInviteCode);

        if (!isActive) return;

        setInviteState({
          status: "valid",
          message: "Codigo valido. Seu cadastro sera vinculado automaticamente a clinica correta.",
          clinicName: clinic.clinicName,
        });
      } catch (error) {
        if (!isActive) return;

        setInviteState({
          status: "invalid",
          message: error instanceof Error ? error.message : "Nao foi possivel validar o codigo da clinica.",
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
    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim()) {
      setErrorMessage("Informe seu nome completo.");
      return;
    }

    if (!normalizedEmail) {
      setErrorMessage("Informe seu e-mail.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Informe um e-mail valido.");
      return;
    }

    if (normalizedInviteCode && inviteState.status === "invalid") {
      setErrorMessage(inviteState.message);
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

    if (!acceptedTerms) {
      setErrorMessage("Voce precisa aceitar os termos para continuar.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { appUser, clinic, user, requiresEmailConfirmation } = await signUpPsychologist({
        fullName,
        email: normalizedEmail,
        password,
        clinicInviteCode: normalizedInviteCode || undefined,
      });

      if (requiresEmailConfirmation) {
        toast.success(
          clinic?.clinicName
            ? `Conta criada. Verifique seu e-mail para concluir o acesso com ${clinic.clinicName}.`
            : "Conta criada. Verifique seu e-mail para confirmar o cadastro.",
        );
        navigate("/login", { replace: true });
        return;
      }

      toast.success("Conta criada com sucesso.");
      navigate(getSafeRedirectPath(appUser, null, user), { replace: true });
    } catch (error) {
      console.error("[Psivinculo][psychologist-register][submit_failed]", {
        inviteCode: normalizedInviteCode || null,
        email: normalizedEmail,
        error,
      });
      const message = error instanceof Error ? error.message : "Nao foi possivel criar sua conta.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-heading text-xl font-bold text-foreground">Psivinculo</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="text-center font-heading text-2xl font-bold text-foreground">Criar conta de psicologo</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Cadastre-se para entrar na area profissional. Se voce recebeu convite da clinica, use o codigo para vincular o acesso automaticamente.
          </p>

          <div className="mt-6 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            O link de convite da clinica leva voce direto ao cadastro correto. Se voce abriu esse link,
            o codigo ja chega preenchido automaticamente. Sem codigo, o cadastro segue no fluxo individual normal.
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-foreground">
                  Codigo da clinica {!isInviteLocked ? <span className="text-muted-foreground">(opcional)</span> : null}
                </label>
                {isInviteLocked ? (
                  <span className="rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                    via link
                  </span>
                ) : null}
              </div>
              <input
                type="text"
                value={inviteCode}
                onChange={(event) => setInviteCode(normalizeClinicInviteCode(event.target.value))}
                placeholder="CLI-XXXXXX"
                readOnly={isInviteLocked}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium tracking-[0.18em] text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20"
                disabled={isSubmitting}
              />
              {inviteState.status !== "idle" ? (
                <p
                  className={`mt-2 text-xs ${
                    inviteState.status === "valid"
                      ? "text-primary"
                      : inviteState.status === "checking"
                        ? "text-muted-foreground"
                        : "text-destructive"
                  }`}
                >
                  {inviteState.message}
                  {inviteState.status === "valid" && inviteState.clinicName
                    ? ` Clinica: ${inviteState.clinicName}.`
                    : ""}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nome completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Confirmar senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="********"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                disabled={isSubmitting}
              />
              <span>
                Li e concordo com os <Link to="/termos-de-uso" className="text-primary hover:underline">Termos de Uso</Link> e{" "}
                <Link to="/privacidade" className="text-primary hover:underline">Politica de Privacidade</Link>.
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Criando conta..." : "Criar Conta"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ja tem uma conta?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
