import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  fetchPatientDocumentsData,
  patientDocumentsQueryKey,
} from "@/services/patientDocuments";

function formatDocumentDate(value: string | null) {
  if (!value) return "Data indisponivel";

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Data indisponivel";

  return parsedDate.toLocaleDateString("pt-BR");
}

export default function PatientDocuments() {
  const { data, isLoading, error } = useQuery({
    queryKey: patientDocumentsQueryKey,
    queryFn: fetchPatientDocumentsData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const patientName = data?.patient.fullName || "Paciente";
  const documents = data?.documents ?? [];

  return (
    <AppLayout role="patient" userName={patientName}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Recibos</h1>
          <p className="mt-1 text-muted-foreground">
            Consulte aqui apenas as consultas que ja foram pagas.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar seus recibos agora."}
              </p>
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Carregando seus recibos...
            </div>
          ) : documents.length > 0 ? (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Profissional</th>
                    <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Data</th>
                    <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Valor</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{document.psychologistName}</p>
                          <p className="text-xs text-muted-foreground md:hidden">
                            {formatDocumentDate(document.date)} - {document.amountLabel}
                          </p>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {formatDocumentDate(document.date)}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {document.amountLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                          <Receipt className="h-3 w-3" />
                          {document.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {document.downloadUrl ? (
                          <a
                            href={document.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Abrir cobranca
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {document.availabilityLabel || "-"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="text-base font-medium text-foreground">
                Nenhum recibo ou documento disponivel.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Quando uma consulta estiver com status pago, ela aparecera aqui.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
