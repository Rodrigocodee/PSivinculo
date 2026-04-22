import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { signUpClinicAdmin } from "@/services/adminClinicRegistration";
import { formatCNPJ, formatPhone } from "@/lib/formatters";

function formatStateInput(value: string) {
  return value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
}

function buildInputShellClassName() {
  return "group flex items-center rounded-2xl border border-border/90 pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,242,249,0.88))]";
}

export default function ClinicAdminRegisterPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicCnpj, setClinicCnpj] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicEmail, setClinicEmail] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicCity, setClinicCity] = useState("");
  const [clinicState, setClinicState] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || isSubmitting) return;
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("A confirmacao da senha nao confere.");
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await signUpClinicAdmin({
        password,
        clinicName,
        clinicCnpj,
        clinicPhone,
        clinicEmail,
        clinicAddress,
        clinicCity,
        clinicState,
      });

      if (result.requiresEmailConfirmation) {
        toast.success("Cadastro concluido. Confirme o e-mail da clinica para entrar no painel.");
        navigate("/login", { replace: true });
        return;
      }

      await refreshAuth();
      toast.success("Clinica criada com sucesso.");
      navigate("/admin/dashboard", { replace: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel concluir o cadastro da clinica.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.18),transparent_24%),radial-gradient(circle_at_100%_0%,hsla(var(--accent),0.14),transparent_28%),linear-gradient(180deg,hsl(225_38%_96%),hsl(34_28%_96%)_58%,hsl(var(--background)))] px-6 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-5rem] h-72 w-72 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-4rem] h-80 w-80 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm premium-shadow">
            <Sparkles className="h-4 w-4" />
            Cadastro da clinica
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary premium-shadow">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-left">
              <span className="font-heading text-xl font-bold text-foreground">Psivinculo</span>
              <p className="text-sm text-muted-foreground">Fluxo inicial da empresa no Psivinculo</p>
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
              Cadastro da clinica
            </div>

            <div className="mt-6 max-w-3xl">
              <h1 className="font-heading text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-[2.1rem]">
                Cadastre a clinica e prepare o acesso administrativo inicial.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-foreground/68">
                O Psivinculo registra a clinica, cria a conta administrativa com o e-mail da
                empresa e conclui o vinculo para voce seguir direto ao painel administrativo.
              </p>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <form className="mt-8 space-y-7" onSubmit={handleSubmit}>
              <section className="rounded-[1.6rem] border border-border/75 bg-white/70 p-5 shadow-[0_24px_45px_-38px_rgba(80,92,150,0.34)]">
                <div className="mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Dados da clinica
                  </p>
                  <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">
                    Informacoes da empresa
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/68">
                    Preencha os dados principais da clinica para liberar o acesso administrativo da empresa.
                  </p>
                </div>

                <div className="mb-5 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground/72">
                  O e-mail da clinica deve ser exclusivo para a conta administrativa e nao pode ser o mesmo e-mail ja utilizado por psicologo.
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Nome da clinica
                    </label>
                    <div className={buildInputShellClassName()}>
                      <Building2 className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="text"
                        value={clinicName}
                        onChange={(event) => setClinicName(event.target.value)}
                        placeholder="Nome da clinica"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      CNPJ
                    </label>
                    <div className={buildInputShellClassName()}>
                      <ShieldCheck className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="text"
                        value={clinicCnpj}
                        onChange={(event) => setClinicCnpj(formatCNPJ(event.target.value))}
                        placeholder="00.000.000/0000-00"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Telefone da clinica
                    </label>
                    <div className={buildInputShellClassName()}>
                      <Phone className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={clinicPhone}
                        onChange={(event) => setClinicPhone(formatPhone(event.target.value))}
                        placeholder="(00) 00000-0000"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      E-mail da clinica
                    </label>
                    <div className={buildInputShellClassName()}>
                      <Mail className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="email"
                        autoComplete="email"
                        value={clinicEmail}
                        onChange={(event) => setClinicEmail(event.target.value)}
                        placeholder="contato@clinica.com"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Senha de acesso
                    </label>
                    <div className={buildInputShellClassName()}>
                      <Lock className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type={showPassword ? "text" : "password"}
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

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Endereco
                    </label>
                    <div className={buildInputShellClassName()}>
                      <MapPin className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="text"
                        value={clinicAddress}
                        onChange={(event) => setClinicAddress(event.target.value)}
                        placeholder="Rua, numero e bairro"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Cidade
                    </label>
                    <div className={buildInputShellClassName()}>
                      <MapPin className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="text"
                        value={clinicCity}
                        onChange={(event) => setClinicCity(event.target.value)}
                        placeholder="Sua cidade"
                        className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Estado
                    </label>
                    <div className={buildInputShellClassName()}>
                      <MapPin className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                      <input
                        type="text"
                        value={clinicState}
                        onChange={(event) => setClinicState(formatStateInput(event.target.value))}
                        placeholder="UF"
                        className="h-14 w-full bg-transparent px-3 text-sm font-medium uppercase tracking-[0.12em] text-foreground outline-none placeholder:text-muted-foreground/80"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground premium-shadow shadow-[0_24px_42px_-20px_hsl(232_58%_52%/0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                <span className="relative">
                  {isSubmitting ? "Criando clinica..." : "Concluir cadastro da clinica"}
                </span>
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
              <p className="mt-2 text-sm text-muted-foreground">
                Cadastro de psicologo?{" "}
                <Link to="/cadastro" className="font-semibold text-primary transition-colors hover:text-primary/80">
                  Usar fluxo profissional
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
