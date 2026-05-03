import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, Brain, CheckCircle2, Copy, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  buildPublicPlanCheckoutFallbackRoute,
  getPublicCheckoutPlanByKey,
  isPublicPlanCheckoutKey,
} from "@/config/publicCheckout";
import { formatCNPJ, formatCPF } from "@/lib/formatters";
import { createAsaasSubscriptionForPlan, type AsaasCheckoutResponse } from "@/services/asaasCheckout";
import { buildPendingSubscriptionDraft, savePendingSubscriptionDraft } from "@/services/subscriptionPersistence";

function normalizeDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function formatCpfCnpj(value: string) {
  const digits = normalizeDigits(value).slice(0, 14);
  if (!digits) return "";

  return digits.length <= 11 ? formatCPF(digits) : formatCNPJ(digits);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return null;

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return value;

  return parsedDate.toLocaleDateString("pt-BR");
}

function extractPaymentStatusLabel(result: AsaasCheckoutResponse | null) {
  if (!result?.firstPayment || typeof result.firstPayment !== "object") return null;

  const status =
    "status" in result.firstPayment && typeof result.firstPayment.status === "string"
      ? result.firstPayment.status.trim()
      : "";

  return status || null;
}

export default function PublicPlanCheckoutRedirectPage() {
  const params = useParams<{ planKey: string }>();
  const rawPlanKey = params.planKey?.trim() || "";
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AsaasCheckoutResponse | null>(null);
  const [copiedPixCode, setCopiedPixCode] = useState(false);

  if (!isPublicPlanCheckoutKey(rawPlanKey)) {
    return <Navigate to="/cadastro" replace />;
  }

  const selectedPlan = getPublicCheckoutPlanByKey(rawPlanKey);
  const nextDueDateLabel = useMemo(() => formatDateLabel(result?.nextDueDate), [result?.nextDueDate]);
  const paymentStatusLabel = extractPaymentStatusLabel(result);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setCopiedPixCode(false);
    setResult(null);

    const normalizedName = customerName.trim();
    const normalizedEmail = customerEmail.trim().toLowerCase();
    const normalizedDocument = normalizeDigits(customerCpfCnpj);

    if (!normalizedName) {
      setErrorMessage("Informe seu nome completo para continuar.");
      return;
    }

    if (!normalizedEmail) {
      setErrorMessage("Informe seu e-mail para continuar.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage("Informe um e-mail valido.");
      return;
    }

    if (![11, 14].includes(normalizedDocument.length)) {
      setErrorMessage("Informe um CPF ou CNPJ valido.");
      return;
    }

    setIsSubmitting(true);

    try {
      const checkoutResult = await createAsaasSubscriptionForPlan({
        planKey: rawPlanKey,
        customer: {
          name: normalizedName,
          email: normalizedEmail,
          cpfCnpj: normalizedDocument,
        },
      });

      savePendingSubscriptionDraft(buildPendingSubscriptionDraft(checkoutResult));
      setResult(checkoutResult);

      if (checkoutResult.paymentUrl) {
        toast.success("Assinatura criada. Redirecionando para o pagamento...");
        window.location.replace(checkoutResult.paymentUrl);
        return;
      }

      if (checkoutResult.pixQrCode) {
        toast.success("Assinatura criada. Use o QR Code abaixo para concluir o pagamento.");
        return;
      }

      const fallbackMessage =
        "Assinatura criada, mas o link de pagamento ainda nao ficou disponivel. Tente novamente em instantes.";
      setErrorMessage(fallbackMessage);
      toast.error(fallbackMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel iniciar sua assinatura agora.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyPixCode() {
    const pixPayload = result?.pixQrCode?.payload?.trim();
    if (!pixPayload) return;

    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopiedPixCode(true);
      toast.success("Codigo Pix copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o codigo Pix agora.");
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,hsla(var(--primary),0.18),transparent_24%),radial-gradient(circle_at_100%_0%,hsla(var(--accent),0.14),transparent_28%),linear-gradient(180deg,hsl(225_38%_96%),hsl(34_28%_96%)_58%,hsl(var(--background)))] px-4 py-8 sm:px-6 sm:py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-5rem] h-72 w-72 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute bottom-[-7rem] right-[-4rem] h-80 w-80 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <section className="w-full lg:max-w-md">
          <div className="rounded-[1.5rem] border border-border/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,244,252,0.94))] p-5 shadow-[0_36px_90px_-38px_rgba(79,88,156,0.34)] ring-1 ring-white/70 sm:rounded-[2rem] sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70 shadow-[0_10px_24px_-20px_rgba(80,92,150,0.45)]">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Assinatura segura
            </div>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary premium-shadow">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-foreground">Psivinculo</p>
                <p className="text-sm text-muted-foreground">Checkout protegido via backend</p>
              </div>
            </div>

            <h1 className="mt-6 font-heading text-3xl font-bold tracking-[-0.03em] text-foreground">
              {selectedPlan.name}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-foreground/68">{selectedPlan.description}</p>

            <div className="mt-8 rounded-[1.5rem] border border-primary/12 bg-primary/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/82">Valor mensal</p>
              <p className="mt-3 text-4xl font-bold tracking-[-0.04em] text-foreground">{selectedPlan.priceLabel}</p>
              <p className="mt-2 text-sm text-muted-foreground">Cobranca recorrente mensal criada sob demanda.</p>
            </div>

            <div className="mt-6 space-y-3 rounded-[1.5rem] border border-border/75 bg-white/75 p-5">
              {[
                "A chave do Asaas continua somente no servidor.",
                "O customer e a assinatura sao criados no backend.",
                "O pagamento segue pelo fluxo retornado pelo Asaas.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <Link
              to={buildPublicPlanCheckoutFallbackRoute(rawPlanKey)}
              className="mt-6 inline-flex text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Prefere criar conta primeiro? Ir para cadastro
            </Link>
          </div>
        </section>

        <section className="flex-1">
          <div className="rounded-[1.5rem] border border-border/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,244,252,0.94))] p-5 shadow-[0_36px_90px_-38px_rgba(79,88,156,0.34)] ring-1 ring-white/70 sm:rounded-[2rem] sm:p-8">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
                Informe os dados para iniciar a assinatura
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Usaremos essas informacoes para localizar ou criar o cliente no Asaas e gerar a assinatura mensal recorrente.
              </p>
            </div>

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <form className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
              <div className="md:col-span-2">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Seu nome ou razao social"
                  className="h-14 w-full rounded-2xl border border-border/85 bg-white/82 px-4 text-sm text-foreground outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/12"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="voce@email.com"
                  className="h-14 w-full rounded-2xl border border-border/85 bg-white/82 px-4 text-sm text-foreground outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/12"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  CPF ou CNPJ
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customerCpfCnpj}
                  onChange={(event) => setCustomerCpfCnpj(formatCpfCnpj(event.target.value))}
                  placeholder="000.000.000-00"
                  className="h-14 w-full rounded-2xl border border-border/85 bg-white/82 px-4 text-sm text-foreground outline-none transition-all focus:border-primary/35 focus:ring-4 focus:ring-primary/12"
                  disabled={isSubmitting}
                />
              </div>

              <div className="md:col-span-2">
                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl gradient-primary text-sm font-semibold text-primary-foreground hover:opacity-95"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Criando assinatura..." : "Escolher plano e continuar"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {result ? (
              <div className="mt-8 rounded-[1.75rem] border border-border/80 bg-white/82 p-6 shadow-[0_18px_46px_-36px_rgba(45,58,109,0.2)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/82">
                      Assinatura criada
                    </p>
                    <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">
                      Fluxo preparado para pagamento
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {result.paymentUrl
                        ? "Redirecionando voce para a pagina de pagamento."
                        : result.pixQrCode
                          ? "Use o QR Code ou o copia e cola abaixo para concluir."
                          : "A assinatura foi criada, mas o link ainda nao ficou disponivel."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/12 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">Proximo vencimento:</span>{" "}
                      {nextDueDateLabel || "--"}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-foreground">Status:</span>{" "}
                      {paymentStatusLabel || "Aguardando pagamento"}
                    </p>
                  </div>
                </div>

                {result.pixQrCode ? (
                  <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="flex items-center justify-center rounded-[1.5rem] border border-border/75 bg-white p-4">
                      {result.pixQrCode.encodedImage ? (
                        <img
                          src={`data:image/png;base64,${result.pixQrCode.encodedImage}`}
                          alt="QR Code Pix"
                          className="h-44 w-44 rounded-xl object-contain"
                        />
                      ) : (
                        <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
                          <QrCode className="h-12 w-12" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border/75 bg-white/85 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Pix copia e cola
                        </p>
                        <p className="mt-3 break-all text-sm leading-6 text-foreground">
                          {result.pixQrCode.payload || "Codigo Pix indisponivel no momento."}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={handleCopyPixCode}
                          disabled={!result.pixQrCode.payload}
                        >
                          <Copy className="h-4 w-4" />
                          {copiedPixCode ? "Codigo copiado" : "Copiar codigo Pix"}
                        </Button>

                        {result.paymentUrl ? (
                          <Button asChild className="rounded-2xl gradient-primary text-primary-foreground hover:opacity-95">
                            <a href={result.paymentUrl} target="_self" rel="noreferrer">
                              <CreditCard className="h-4 w-4" />
                              Abrir pagina de pagamento
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
