import { useEffect, useMemo, useState } from "react";
import { AlertCircle, DollarSign, Filter, Receipt, TrendingUp, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { toast } from "@/components/ui/sonner";
import {
  buscarFinanceiroPsicologo,
  type PacienteFinanceiroOption,
  type PagamentoNormalizado,
} from "@/services/financeiro";
import {
  abrirReciboParaImpressao,
  montarPreviewRecibo,
  type ReciboPagamentoPreview,
} from "@/services/recibos";

type ReceiptFormState = {
  patientId: string;
  paymentId: string;
  paymentDate: string;
  amount: string;
  paymentMethod: string;
  description: string;
};

const initialReceiptForm: ReceiptFormState = {
  patientId: "",
  paymentId: "",
  paymentDate: "",
  amount: "",
  paymentMethod: "",
  description: "",
};

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPaymentDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR");
}

function toInputDate(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCurrencyInput(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PsychologistFinancial() {
  const { data: currentProfile } = useCurrentPsychologistProfile();
  const [payments, setPayments] = useState<PagamentoNormalizado[]>([]);
  const [patients, setPatients] = useState<PacienteFinanceiroOption[]>([]);
  const [monthOptions, setMonthOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<ReceiptFormState>(initialReceiptForm);
  const [receiptPreview, setReceiptPreview] = useState<ReciboPagamentoPreview | null>(null);

  useEffect(() => {
    async function carregarFinanceiro() {
      try {
        const data = await buscarFinanceiroPsicologo();
        setPayments(data.pagamentos);
        setPatients(data.pacientes);
        setMonthOptions(data.monthOptions);
        setSelectedMonth((current) => current || data.monthOptions[0]?.value || "");
      } catch (error) {
        console.error("Erro ao carregar financeiro:", error);
        setPayments([]);
        setPatients([]);
        setMonthOptions([]);
      } finally {
        setIsLoading(false);
      }
    }

    carregarFinanceiro();
  }, []);

  const psychologistName = currentProfile?.fullName?.trim() || "Profissional";
  const psychologistCrp = currentProfile?.crp?.trim() || null;

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (selectedMonth && payment.monthKey !== selectedMonth) return false;
      if (statusFilter === "paid" && payment.status !== "paid") return false;
      if (statusFilter === "pending" && payment.status !== "pending") return false;
      return true;
    });
  }, [payments, selectedMonth, statusFilter]);

  const stats = useMemo(() => {
    const totalReceived = filteredPayments
      .filter((payment) => payment.status === "paid")
      .reduce((total, payment) => total + payment.amount, 0);

    const totalPending = filteredPayments
      .filter((payment) => payment.status === "pending")
      .reduce((total, payment) => total + payment.amount, 0);

    const paidCount = filteredPayments.filter((payment) => payment.status === "paid").length;

    return {
      totalReceived,
      totalPending,
      paidCount,
      totalCount: filteredPayments.length,
    };
  }, [filteredPayments]);

  const paymentOptionsForReceipt = useMemo(() => {
    if (!receiptForm.patientId) return payments;
    return payments.filter((payment) => payment.patientId === receiptForm.patientId);
  }, [payments, receiptForm.patientId]);

  const selectedReceiptPayment = useMemo(
    () => payments.find((payment) => payment.id === receiptForm.paymentId) || null,
    [payments, receiptForm.paymentId],
  );

  const selectedReceiptPatient = useMemo(
    () => patients.find((patient) => patient.id === receiptForm.patientId) || null,
    [patients, receiptForm.patientId],
  );

  function resetReceiptFlow() {
    setReceiptForm(initialReceiptForm);
    setReceiptPreview(null);
  }

  function openReceiptModal() {
    resetReceiptFlow();
    setIsReceiptOpen(true);
  }

  function closeReceiptModal() {
    setIsReceiptOpen(false);
    resetReceiptFlow();
  }

  function updateReceiptForm(changes: Partial<ReceiptFormState>) {
    setReceiptForm((current) => ({
      ...current,
      ...changes,
    }));
    setReceiptPreview(null);
  }

  function handleReceiptPatientChange(patientId: string) {
    const selectedPaymentStillMatches = payments.find((payment) => payment.id === receiptForm.paymentId)?.patientId === patientId;

    updateReceiptForm({
      patientId,
      paymentId: selectedPaymentStillMatches ? receiptForm.paymentId : "",
    });
  }

  function handleReceiptPaymentChange(paymentId: string) {
    if (!paymentId) {
      updateReceiptForm({ paymentId: "" });
      return;
    }

    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) {
      updateReceiptForm({ paymentId: "" });
      return;
    }

    updateReceiptForm({
      paymentId,
      patientId: payment.patientId || receiptForm.patientId,
      paymentDate: toInputDate(payment.date),
      amount: payment.amount ? payment.amount.toFixed(2).replace(".", ",") : "",
      paymentMethod: payment.method === "-" ? "" : payment.method,
      description: payment.description,
    });
  }

  function gerarPreviewRecibo() {
    try {
      const preview = montarPreviewRecibo({
        patientId: receiptForm.patientId,
        patientName: selectedReceiptPatient?.nome || selectedReceiptPayment?.patientName || "",
        paymentId: receiptForm.paymentId || null,
        paymentDate: receiptForm.paymentDate,
        amount: parseCurrencyInput(receiptForm.amount),
        paymentMethod: receiptForm.paymentMethod,
        description: receiptForm.description,
        psychologistName,
        psychologistCrp,
      });

      setReceiptPreview(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel gerar o preview do recibo.";
      toast.error(message);
    }
  }

  function handlePrintReceipt() {
    try {
      const preview = receiptPreview ??
        montarPreviewRecibo({
          patientId: receiptForm.patientId,
          patientName: selectedReceiptPatient?.nome || selectedReceiptPayment?.patientName || "",
          paymentId: receiptForm.paymentId || null,
          paymentDate: receiptForm.paymentDate,
          amount: parseCurrencyInput(receiptForm.amount),
          paymentMethod: receiptForm.paymentMethod,
          description: receiptForm.description,
          psychologistName,
          psychologistCrp,
        });

      setReceiptPreview(preview);
      abrirReciboParaImpressao(preview);
      toast.success("Recibo enviado para impressao. Voce pode salvar em PDF pelo navegador.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel preparar o recibo.";
      toast.error(message);
    }
  }

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Financeiro</h1>
            <p className="mt-1 text-muted-foreground">Controle de pagamentos e receitas.</p>
          </div>
          <button
            onClick={openReceiptModal}
            {...getProfessionalPreviewActionProps({
              description:
                "A emissao de recibos e o uso operacional do financeiro ficam liberados assim que sua area profissional for ativada.",
            })}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
          >
            <Receipt className="h-4 w-4" /> Gerar Recibo
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Recebido no Mes", value: formatCurrency(stats.totalReceived), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
            { label: "Pendente", value: formatCurrency(stats.totalPending), icon: AlertCircle, color: "text-warning", bg: "bg-warning/10" },
            { label: "Consultas Pagas", value: `${stats.paidCount}/${stats.totalCount}`, icon: DollarSign, color: "text-primary", bg: "bg-primary/10" },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-sm text-muted-foreground outline-none"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-sm text-muted-foreground outline-none"
          >
            <option value="all">Todos os status</option>
            <option value="paid">Pago</option>
            <option value="pending">Pendente</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">Carregando financeiro...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Paciente</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Data</th>
                    <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Descricao</th>
                    <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Forma</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Valor</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.length > 0 ? filteredPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{payment.patientName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatPaymentDate(payment.date)}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{payment.description}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{payment.method}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(payment.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${payment.status === "paid" ? "bg-success/10 text-success" : payment.status === "pending" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>
                          {payment.status === "paid" ? "Pago" : payment.status === "pending" ? "Pendente" : "Outro"}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum pagamento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isReceiptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm" onClick={closeReceiptModal}>
          <div className="w-full max-w-3xl animate-scale-in rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Gerar Recibo</h2>
                <p className="mt-1 text-sm text-muted-foreground">Selecione um pagamento existente ou preencha os dados manualmente.</p>
              </div>
              <button onClick={closeReceiptModal} className="rounded-lg p-1 transition-colors hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Paciente</label>
                  <select
                    value={receiptForm.patientId}
                    onChange={(e) => handleReceiptPatientChange(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Selecione um paciente</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>{patient.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Pagamento</label>
                  <select
                    value={receiptForm.paymentId}
                    onChange={(e) => handleReceiptPaymentChange(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">Preencher manualmente</option>
                    {paymentOptionsForReceipt.map((payment) => (
                      <option key={payment.id} value={payment.id}>
                        {payment.patientName} - {formatPaymentDate(payment.date)} - {formatCurrency(payment.amount)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Data do pagamento</label>
                    <input
                      type="date"
                      value={receiptForm.paymentDate}
                      onChange={(e) => updateReceiptForm({ paymentDate: e.target.value })}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Valor</label>
                    <input
                      type="text"
                      value={receiptForm.amount}
                      onChange={(e) => updateReceiptForm({ amount: e.target.value })}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Forma de pagamento</label>
                  <input
                    type="text"
                    value={receiptForm.paymentMethod}
                    onChange={(e) => updateReceiptForm({ paymentMethod: e.target.value })}
                    placeholder="PIX, cartao, transferencia..."
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Descricao opcional</label>
                  <textarea
                    rows={4}
                    value={receiptForm.description}
                    onChange={(e) => updateReceiptForm({ description: e.target.value })}
                    placeholder="Ex.: Sessao individual realizada em 15/04/2026."
                    className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={gerarPreviewRecibo}
                    {...getProfessionalPreviewActionProps({
                      description:
                        "A geracao de recibos reais faz parte do acesso profissional completo. Escolha um plano para liberar essa etapa.",
                    })}
                    className="rounded-xl gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
                  >
                    Visualizar Recibo
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    {...getProfessionalPreviewActionProps({
                      description:
                        "A emissao e impressao de recibos estao bloqueadas no modo preview. Libere o acesso para usar o financeiro de forma real.",
                    })}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
                  >
                    Baixar / Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={closeReceiptModal}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/60 p-5">
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Preview</p>
                  <h3 className="mt-1 font-heading text-xl font-semibold text-foreground">Recibo de pagamento</h3>
                </div>

                {receiptPreview ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Codigo</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{receiptPreview.receiptCode}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Paciente</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{receiptPreview.patientName}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Valor</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{receiptPreview.amountLabel}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Data</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{receiptPreview.paymentDateLabel}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Forma</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{receiptPreview.paymentMethod}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Descricao</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground">{receiptPreview.description}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Responsavel</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{receiptPreview.psychologistName}</p>
                      {receiptPreview.psychologistCrp ? (
                        <p className="mt-1 text-xs text-muted-foreground">CRP {receiptPreview.psychologistCrp}</p>
                      ) : null}
                      <p className="mt-3 text-xs text-muted-foreground">Emitido em {receiptPreview.issuedAtLabel}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                    Preencha os dados do pagamento e clique em "Visualizar Recibo" para conferir antes de imprimir.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
