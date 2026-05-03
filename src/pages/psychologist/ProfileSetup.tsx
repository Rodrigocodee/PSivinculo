import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, Building2, Loader2, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { PsychologistSpecialtySelect } from "@/components/psychologist/PsychologistSpecialtySelect";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  currentPsychologistProfileQueryKey,
  useCurrentPsychologistProfile,
} from "@/hooks/use-current-psychologist-profile";
import { getDefaultRouteForRole } from "@/services/auth";
import {
  CRP_VALIDATION_MESSAGE,
  formatPhone,
  getCrpDigits,
  isValidCrp,
  MAX_CRP_DIGITS,
  normalizePhone,
  sanitizeCrpInput,
  saveCurrentPsychologistProfessionalProfile,
} from "@/services/currentPsychologist";

type ProfileSetupForm = {
  phone: string;
  crp: string;
  specialty: string;
  clinicName: string;
};

const INPUT_CLASS =
  "w-full rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(244,242,249,0.9))] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_12px_28px_-26px_rgba(86,99,160,0.28)] outline-none transition-all focus:border-primary/45 focus:bg-white focus:ring-4 focus:ring-primary/12";

const valueHighlights = [
  {
    title: "Perfil profissional completo",
    description: "Telefone, CRP e especialidade ajudam a personalizar sua experiencia desde o primeiro acesso.",
  },
  {
    title: "Dados reais no sistema",
    description: "As informacoes salvas aqui alimentam seu perfil do psicologo dentro do Psivinculo.",
  },
  {
    title: "Sem plano ou cobranca agora",
    description: "Esta etapa e apenas para finalizar seus dados profissionais iniciais.",
  },
];

export default function PsychologistProfileSetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appUser, refreshAuth } = useAuth();
  const { data: currentProfile, isLoading } = useCurrentPsychologistProfile(Boolean(appUser));
  const hasHydratedFormRef = useRef(false);
  const [form, setForm] = useState<ProfileSetupForm>({
    phone: "",
    crp: "",
    specialty: "",
    clinicName: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!currentProfile || hasHydratedFormRef.current) return;

    setForm({
      phone: formatPhone(currentProfile.phone),
      crp: getCrpDigits(currentProfile.crp),
      specialty: currentProfile.specialty || "",
      clinicName: currentProfile.clinicName || "",
    });
    hasHydratedFormRef.current = true;
  }, [currentProfile]);

  if (appUser && !appUser.needsProfileSetup) {
    return <Navigate to={getDefaultRouteForRole(appUser.role)} replace />;
  }

  const psychologistName = currentProfile?.fullName || appUser?.fullName || "Psicologo(a)";
  const psychologistEmail = currentProfile?.email || appUser?.email || "";
  const isClinicInvitedPsychologist = Boolean(appUser?.isClinicInvitedPsychologist);

  function updateField(field: keyof ProfileSetupForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]:
        field === "phone"
          ? formatPhone(value)
          : field === "crp"
            ? sanitizeCrpInput(value)
            : value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedPhone = normalizePhone(form.phone);
    const nextForm = {
      phone: formatPhone(form.phone),
      crp: getCrpDigits(form.crp),
      specialty: form.specialty.trim(),
      clinicName: form.clinicName.trim(),
    };

    if (!normalizedPhone || ![10, 11].includes(normalizedPhone.length)) {
      setErrorMessage("Informe um telefone valido com DDD.");
      return;
    }

    if (!nextForm.crp) {
      setErrorMessage("Informe seu CRP.");
      return;
    }

    if (!isValidCrp(nextForm.crp)) {
      setErrorMessage(CRP_VALIDATION_MESSAGE);
      return;
    }

    if (!nextForm.specialty) {
      setErrorMessage("Informe sua especialidade.");
      return;
    }

    setIsSaving(true);

    try {
      await saveCurrentPsychologistProfessionalProfile(nextForm);
      await queryClient.invalidateQueries({ queryKey: currentPsychologistProfileQueryKey });
      await refreshAuth();
      toast.success(
        isClinicInvitedPsychologist
          ? "Perfil profissional salvo. Sua area foi liberada no contexto da clinica."
          : "Perfil profissional salvo. Sua area foi liberada em modo preview.",
      );
      navigate(getDefaultRouteForRole(appUser?.role || "psychologist"), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar seu perfil agora.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.22),transparent_24%),radial-gradient(circle_at_100%_0%,hsla(var(--accent),0.2),transparent_28%),linear-gradient(180deg,hsl(226_40%_95%),hsl(34_30%_95%)_54%,hsl(var(--background)))] px-4 py-8 sm:px-6 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-6rem] h-80 w-80 rounded-full bg-primary/18 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-5rem] h-96 w-96 rounded-full bg-accent/16 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.94fr_1.06fr]">
          <section className="relative hidden overflow-hidden rounded-[2rem] border border-white/24 bg-[radial-gradient(circle_at_top_left,hsla(var(--accent),0.42),transparent_24%),radial-gradient(circle_at_82%_18%,hsla(var(--secondary),0.3),transparent_22%),radial-gradient(circle_at_48%_118%,hsla(var(--primary),0.28),transparent_42%),linear-gradient(160deg,hsl(224_74%_88%),hsl(237_62%_87%)_42%,hsl(252_56%_84%)_72%,hsl(217_72%_86%))] p-8 text-[hsl(230_30%_22%)] shadow-[0_34px_96px_-34px_rgba(42,55,110,0.38)] lg:flex lg:flex-col lg:justify-between">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(35,49,97,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(35,49,97,0.18)_1px,transparent_1px)] [background-size:82px_82px]"
            />
            <div aria-hidden className="absolute left-[8%] top-[10%] h-52 w-52 rounded-full bg-white/18 blur-3xl" />
            <div aria-hidden className="absolute bottom-[6%] right-[8%] h-64 w-64 rounded-full bg-primary/18 blur-3xl" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/34 bg-white/62 px-4 py-2 text-sm font-medium text-[hsl(230_32%_24%)] backdrop-blur-md shadow-[0_16px_36px_-24px_rgba(31,44,91,0.45)]">
                <Sparkles className="h-4 w-4" />
                Etapa 2 de 2
              </div>

              <div className="mt-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/58 backdrop-blur-md shadow-[0_12px_30px_-18px_rgba(28,42,88,0.38)]">
                  <Brain className="h-6 w-6 text-[hsl(231_38%_28%)]" />
                </div>
                <div>
                  <p className="font-heading text-2xl font-bold tracking-[-0.03em] text-[hsl(231_42%_18%)]">Psivinculo</p>
                  <p className="text-sm text-[hsl(228_20%_38%)]">Complete seu perfil profissional inicial</p>
                </div>
              </div>

              <h1 className="mt-8 font-heading text-4xl font-bold leading-tight tracking-[-0.04em] text-[hsl(231_46%_17%)]">
                Sua conta ja esta criada. Falta so um passo para entrar no app.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[hsl(227_23%_34%)]">
                Preencha seus dados profissionais basicos para personalizar seu perfil e seguir para a experiencia completa do Psivinculo.
              </p>

              <div className="mt-8 rounded-[1.75rem] border border-white/34 bg-[linear-gradient(180deg,rgba(255,255,255,0.66),rgba(241,241,251,0.54))] p-5 backdrop-blur-xl shadow-[0_28px_90px_-42px_rgba(26,40,86,0.42)]">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(228_18%_44%)]">Conta criada para</p>
                <p className="mt-3 text-xl font-semibold text-[hsl(231_42%_18%)]">{psychologistName}</p>
                <p className="mt-1 text-sm text-[hsl(227_20%_38%)]">{psychologistEmail || "E-mail profissional"}</p>
              </div>
            </div>

            <div className="relative z-10 space-y-3">
              {valueHighlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/30 bg-white/54 p-4 backdrop-blur-md shadow-[0_18px_42px_-26px_rgba(28,42,88,0.28)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(229_70%_96%)] shadow-[0_10px_24px_-18px_rgba(28,42,88,0.28)]">
                      <ShieldCheck className="h-4 w-4 text-[hsl(231_38%_28%)]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(231_42%_20%)]">{item.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[hsl(227_18%_39%)]">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[1.5rem] border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,252,0.95))] p-5 shadow-[0_44px_104px_-42px_rgba(67,77,149,0.4)] ring-1 ring-white/80 sm:rounded-[2rem] sm:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.2),transparent_34%),radial-gradient(circle_at_86%_18%,hsla(var(--accent),0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.28),transparent_42%)]"
            />

            <div className="relative">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary shadow-[0_18px_34px_-20px_hsl(232_58%_52%/0.55)]">
                    <Brain className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-heading text-xl font-bold text-foreground">Psivinculo</p>
                    <p className="text-sm text-muted-foreground">Complete seu perfil</p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-border/75 bg-white/82 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/72 shadow-[0_12px_24px_-18px_rgba(80,92,150,0.44)]">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Etapa 2 de 2
                </div>
              </div>

              <div className="lg:hidden">
                <div className="rounded-2xl border border-border/75 bg-white/74 p-4 shadow-[0_16px_32px_-26px_rgba(85,98,156,0.3)]">
                  <p className="text-sm font-semibold text-foreground">{psychologistName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{psychologistEmail || "E-mail profissional"}</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Agora vamos completar seus dados profissionais iniciais antes de seguir.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <h2 className="font-heading text-3xl font-bold tracking-[-0.03em] text-foreground">
                  Complete seu perfil profissional
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/70">
                  Esta etapa registra suas informacoes basicas de contato e exibicao profissional. Nome da clinica ou consultorio e opcional.
                </p>
              </div>

              {errorMessage ? (
                <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : null}

              {isLoading && !hasHydratedFormRef.current ? (
                <div className="mt-8 rounded-2xl border border-border/75 bg-white/74 p-4 text-sm text-muted-foreground shadow-[0_16px_32px_-26px_rgba(85,98,156,0.28)]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando seus dados iniciais...
                  </div>
                </div>
              ) : (
                <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Telefone
                      </label>
                      <div className="group flex items-center rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,242,249,0.9))] pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_12px_28px_-26px_rgba(86,99,160,0.28)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12">
                        <Phone className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(event) => updateField("phone", event.target.value)}
                          placeholder="(00) 00000-0000"
                          className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                          disabled={isSaving}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        CRP
                      </label>
                      <input
                        type="text"
                        value={form.crp}
                        onChange={(event) => updateField("crp", event.target.value)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={MAX_CRP_DIGITS}
                        placeholder="Ex.: 1234567"
                        className={INPUT_CLASS}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Especialidade
                      </label>
                      <PsychologistSpecialtySelect
                        value={form.specialty}
                        onChange={(value) => updateField("specialty", value)}
                        selectClassName={INPUT_CLASS}
                        customInputClassName={INPUT_CLASS}
                        disabled={isSaving}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Nome da clinica ou consultorio <span className="normal-case tracking-normal text-muted-foreground">(opcional)</span>
                      </label>
                      <div className="group flex items-center rounded-2xl border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,242,249,0.9))] pl-4 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_12px_28px_-26px_rgba(86,99,160,0.28)] transition-all duration-200 focus-within:border-primary/45 focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/12">
                        <Building2 className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
                        <input
                          type="text"
                          value={form.clinicName}
                          onChange={(event) => updateField("clinicName", event.target.value)}
                          placeholder="Ex.: Espaco Clinico Horizonte"
                          className="h-14 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80"
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/75 bg-white/72 p-4 shadow-[0_16px_32px_-26px_rgba(85,98,156,0.22)]">
                    <p className="text-sm font-medium text-foreground">Proximo passo</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {isClinicInvitedPsychologist
                        ? "Ao concluir esta etapa, voce segue direto para a area profissional vinculada a clinica."
                        : "Ao concluir esta etapa, voce segue para uma preview da sua area profissional com o perfil inicial salvo."}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl gradient-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_28px_48px_-20px_hsl(232_58%_52%/0.62)] transition-all duration-200 hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    <span className="relative">{isSaving ? "Salvando perfil..." : "Salvar e continuar"}</span>
                    {isSaving ? (
                      <Loader2 className="relative h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    )}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
