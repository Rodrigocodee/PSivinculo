import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, Loader2, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useCurrentPsychologistPaymentSettings } from "@/hooks/use-current-psychologist-payment-settings";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import {
  PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE,
  currentPsychologistPaymentSettingsQueryKey,
  saveCurrentPsychologistPaymentSettings,
} from "@/services/psychologistPaymentSettings";

const INPUT_CLASS =
  "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20";
const ASAAS_REFERRAL_URL = "https://www.asaas.com/r/162481a3-72ee-49fe-971e-fa8604eb848a";

const activationSteps = [
  {
    title: "1. Crie sua conta no Asaas",
    description: "Voce pode abrir como Pessoa Fisica (CPF) ou Pessoa Juridica (CNPJ).",
  },
  {
    title: "2. Confirme sua conta",
    description: "Envie os documentos solicitados pelo Asaas e aguarde a aprovacao.",
  },
  {
    title: "3. Copie seu Wallet ID",
    description: "No painel do Asaas, acesse Minha Conta > Wallet e copie seu Wallet ID.",
  },
  {
    title: "4. Cole seu Wallet ID aqui",
    description: "Cole o Wallet ID no campo acima e salve suas configuracoes.",
  },
  {
    title: "5. Pronto",
    description: "Quando um paciente pagar uma consulta, o repasse sera feito automaticamente para sua conta Asaas.",
  },
] as const;

export default function PsychologistFinancialSettings() {
  const queryClient = useQueryClient();
  const { data: currentProfile } = useCurrentPsychologistProfile();
  const {
    data: paymentSettings,
    isLoading,
    isError,
    refetch,
  } = useCurrentPsychologistPaymentSettings();
  const [receivablesEnabled, setReceivablesEnabled] = useState(false);
  const [asaasWalletId, setAsaasWalletId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!paymentSettings) return;

    setReceivablesEnabled(paymentSettings.receivablesEnabled);
    setAsaasWalletId(paymentSettings.asaasWalletId);
  }, [paymentSettings]);

  async function handleSave() {
    setIsSaving(true);

    try {
      await saveCurrentPsychologistPaymentSettings({
        receivablesEnabled,
        asaasWalletId,
      });

      await queryClient.invalidateQueries({
        queryKey: currentPsychologistPaymentSettingsQueryKey,
      });

      toast.success("Configuracoes financeiras salvas com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar as configuracoes financeiras.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppLayout
      role="psychologist"
      userName={currentProfile?.fullName?.trim() || "Profissional"}
    >
      <div className="max-w-5xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/psi/configuracoes" className="hover:text-foreground hover:underline">
              Configuracoes
            </Link>
            {" / "}Financeiro
          </p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
            Configuracoes Financeiras
          </h1>
          <p className="mt-1 text-muted-foreground">
            Escolha se voce quer continuar recebendo por fora da plataforma ou habilitar o split automatico com Asaas.
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando configuracoes financeiras...
            </div>
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Nao foi possivel carregar as configuracoes financeiras agora.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-muted"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="font-heading font-semibold text-foreground">
                    Receber pagamentos pelo Psivinculo
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Quando ativado, a area de Recebimentos fica disponivel para acompanhar cobrancas.
                  </p>
                </div>
                <Switch
                  checked={receivablesEnabled}
                  onCheckedChange={setReceivablesEnabled}
                  aria-label="Receber pagamentos pelo Psivinculo"
                />
              </div>
            </div>

            {receivablesEnabled ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="mb-4">
                    <h2 className="font-heading font-semibold text-foreground">Split Asaas</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Informe seu Wallet ID para receber automaticamente as consultas pagas pelo Psivinculo.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Asaas Wallet ID
                    </label>
                    <input
                      type="text"
                      value={asaasWalletId}
                      onChange={(event) => setAsaasWalletId(event.target.value)}
                      placeholder="Informe seu Wallet ID do Asaas"
                      className={INPUT_CLASS}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Esse campo e obrigatorio quando os recebimentos pelo Psivinculo estiverem ativados.
                    </p>
                  </div>

                  <a
                    href={ASAAS_REFERRAL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
                  >
                    Criar conta no Asaas com indicacao
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>

                <div className="space-y-6">
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h2 className="font-heading text-lg font-semibold text-foreground">
                      Como funciona o recebimento pelo Psivinculo
                    </h2>
                    <p className="mt-3 text-base font-semibold text-foreground">
                      Voce fica com {PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE}% e a plataforma com {100 - PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE}%.
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Ao receber uma consulta paga pelo Psivinculo, o valor e dividido automaticamente pelo Asaas. O psicologo recebe {PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE}% do valor liquido e a plataforma fica com {100 - PSIVINCULO_ASAAS_SPLIT_PAYOUT_PERCENTAGE}%.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6">
                    <h2 className="font-heading text-lg font-semibold text-foreground">
                      Passo a passo para receber pelo Psivinculo
                    </h2>
                    <div className="mt-4 space-y-4">
                      {activationSteps.map((step) => (
                        <div key={step.title} className="flex gap-3 rounded-xl bg-background/70 p-4">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">Importante:</span> o repasse e feito automaticamente pelo Asaas para o seu Wallet. Depois, voce pode solicitar saque para sua conta bancaria diretamente no painel do Asaas.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-heading font-semibold text-foreground">Recebimento externo</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Com essa opcao desativada, voce pode continuar recebendo suas consultas por fora da plataforma, usando PIX, transferencia, dinheiro ou outro fluxo proprio.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                {...getProfessionalPreviewActionProps({
                  title: "Ative sua assinatura para salvar configuracoes financeiras.",
                  description: PREVIEW_FEATURE_LOCK_MESSAGE,
                })}
                className="inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "Salvando..." : "Salvar configuracoes"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
