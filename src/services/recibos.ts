export type ReciboPagamentoInput = {
  patientId: string;
  patientName: string;
  paymentId?: string | null;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  description?: string;
  psychologistName: string;
  psychologistCrp?: string | null;
  issuedAt?: Date;
};

export type ReciboPagamentoPreview = {
  patientId: string;
  patientName: string;
  paymentId: string | null;
  paymentDate: string;
  paymentDateLabel: string;
  amount: number;
  amountLabel: string;
  paymentMethod: string;
  description: string;
  psychologistName: string;
  psychologistCrp: string | null;
  issuedAtLabel: string;
  receiptCode: string;
};

const RECEIPT_PRINT_IFRAME_ID = "mindclinic-receipt-print-frame";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Informe uma data de pagamento valida.");
  }

  return date.toLocaleDateString("pt-BR");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function montarPreviewRecibo(input: ReciboPagamentoInput): ReciboPagamentoPreview {
  if (!input.patientId.trim()) throw new Error("Selecione um paciente.");
  if (!input.patientName.trim()) throw new Error("Paciente invalido.");
  if (!input.paymentDate.trim()) throw new Error("Informe a data do pagamento.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Informe um valor valido.");
  if (!input.paymentMethod.trim()) throw new Error("Informe a forma de pagamento.");
  if (!input.psychologistName.trim()) throw new Error("Nao foi possivel identificar o psicologo responsavel.");

  const issuedAt = input.issuedAt ?? new Date();
  const receiptCode = input.paymentId?.trim()
    ? `REC-${input.paymentId.trim().slice(0, 8).toUpperCase()}`
    : `REC-${issuedAt.getTime().toString().slice(-8)}`;

  return {
    patientId: input.patientId,
    patientName: input.patientName.trim(),
    paymentId: input.paymentId?.trim() || null,
    paymentDate: input.paymentDate,
    paymentDateLabel: formatDate(input.paymentDate),
    amount: input.amount,
    amountLabel: formatCurrency(input.amount),
    paymentMethod: input.paymentMethod.trim(),
    description: input.description?.trim() || "Pagamento referente a atendimento psicologico.",
    psychologistName: input.psychologistName.trim(),
    psychologistCrp: input.psychologistCrp?.trim() || null,
    issuedAtLabel: issuedAt.toLocaleDateString("pt-BR"),
    receiptCode,
  };
}

export function gerarReciboHtml(preview: ReciboPagamentoPreview) {
  const psychologistLine = preview.psychologistCrp
    ? `${escapeHtml(preview.psychologistName)} - CRP ${escapeHtml(preview.psychologistCrp)}`
    : escapeHtml(preview.psychologistName);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(preview.receiptCode)}</title>
  <style>
    body {
      font-family: "Segoe UI", sans-serif;
      background: #f4f6fb;
      color: #162033;
      margin: 0;
      padding: 32px;
    }
    .sheet {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d8dfeb;
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 16px 40px rgba(22, 32, 51, 0.08);
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #53627c;
      margin: 0 0 10px;
    }
    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
    }
    .meta {
      margin-top: 8px;
      color: #53627c;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 28px;
    }
    .card {
      border: 1px solid #d8dfeb;
      border-radius: 18px;
      padding: 18px;
      background: #fbfcff;
    }
    .label {
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6d7b93;
      margin-bottom: 8px;
    }
    .value {
      font-size: 18px;
      font-weight: 600;
    }
    .value.small {
      font-size: 15px;
      line-height: 1.5;
      font-weight: 500;
    }
    .footer {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid #d8dfeb;
      color: #53627c;
      font-size: 14px;
      line-height: 1.6;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .sheet {
        border: none;
        box-shadow: none;
        border-radius: 0;
        max-width: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <p class="eyebrow">Recibo de pagamento</p>
    <h1>${escapeHtml(preview.receiptCode)}</h1>
    <p class="meta">Emitido em ${escapeHtml(preview.issuedAtLabel)}</p>

    <section class="grid">
      <div class="card">
        <div class="label">Paciente</div>
        <div class="value">${escapeHtml(preview.patientName)}</div>
      </div>
      <div class="card">
        <div class="label">Valor</div>
        <div class="value">${escapeHtml(preview.amountLabel)}</div>
      </div>
      <div class="card">
        <div class="label">Data do pagamento</div>
        <div class="value">${escapeHtml(preview.paymentDateLabel)}</div>
      </div>
      <div class="card">
        <div class="label">Forma de pagamento</div>
        <div class="value">${escapeHtml(preview.paymentMethod)}</div>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <div class="label">Descricao</div>
        <div class="value small">${escapeHtml(preview.description)}</div>
      </div>
      <div class="card" style="grid-column: 1 / -1;">
        <div class="label">Responsavel</div>
        <div class="value small">${psychologistLine}</div>
      </div>
    </section>

    <div class="footer">
      Declaro, para os devidos fins, o recebimento do valor acima descrito referente ao atendimento prestado.
    </div>
  </main>
</body>
</html>`;
}

export function abrirReciboParaImpressao(preview: ReciboPagamentoPreview) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("A impressao do recibo so pode ser aberta no navegador.");
  }

  let iframe = document.getElementById(RECEIPT_PRINT_IFRAME_ID) as HTMLIFrameElement | null;

  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = RECEIPT_PRINT_IFRAME_ID;
    iframe.title = "Impressao de recibo";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);
  }

  const html = gerarReciboHtml(preview);

  iframe.onload = () => {
    const printWindow = iframe?.contentWindow;
    if (!printWindow) return;

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 100);
  };

  iframe.srcdoc = html;
}
