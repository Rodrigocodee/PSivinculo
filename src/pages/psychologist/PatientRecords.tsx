import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { toast } from "@/components/ui/sonner";
import { formatCpf } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";
import { listarConsultasPorPaciente } from "@/services/consultas";
import { buscarPacientePorId } from "@/services/pacientes";
import { cadastrarProntuario, listarProntuariosPorPaciente, PRONTUARIOS_BUCKET, type Prontuario, uploadAnexoProntuario } from "@/services/prontuarios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Plus, Paperclip, Lock, Save, FileText } from "lucide-react";

type PacienteRecord = {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  ativo: boolean | null;
};

type ConsultaPaciente = {
  id: string;
  data_consulta: string;
  status: string;
};

function formatBirthDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function formatDateValue(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function getTimestamp(value: string) {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAttachmentLabel(value: string) {
  const normalized = value.split("?")[0];
  const fileName = normalized.split("/").pop() || value;
  const sanitized = fileName.replace(/^[a-f0-9-]+-/i, "");
  return decodeURIComponent(sanitized);
}

function getAttachmentHref(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const { data } = supabase.storage
    .from(PRONTUARIOS_BUCKET)
    .getPublicUrl(value);

  return data.publicUrl;
}

export default function PatientRecords() {
  const { id } = useParams();
  const { data: profile } = useCurrentPsychologistProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [patient, setPatient] = useState<PacienteRecord | null>(null);
  const [appointments, setAppointments] = useState<ConsultaPaciente[]>([]);
  const [records, setRecords] = useState<Prontuario[]>([]);
  const [newNote, setNewNote] = useState("");
  const [sessionDate, setSessionDate] = useState(() => formatDateInput(new Date()));
  const [sessionNumber, setSessionNumber] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<{
    fileName: string;
    path: string;
  } | null>(null);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  useEffect(() => {
    async function carregarDados() {
      if (!id) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const [patientData, consultasData, prontuariosData] = await Promise.all([
          buscarPacientePorId(id),
          listarConsultasPorPaciente(id),
          listarProntuariosPorPaciente(id),
        ]);

        if (!patientData) {
          setNotFound(true);
          setPatient(null);
          setAppointments([]);
          setRecords([]);
          return;
        }

        const normalizedAppointments = (consultasData as ConsultaPaciente[]) ?? [];
        const normalizedRecords = prontuariosData ?? [];
        const latestSessionNumber = normalizedRecords[0]?.numero_sessao ?? 0;

        setPatient(patientData as PacienteRecord);
        setAppointments(normalizedAppointments);
        setRecords(normalizedRecords);
        setSessionNumber(String(latestSessionNumber > 0 ? latestSessionNumber + 1 : 1));
        setNotFound(false);
      } catch (error) {
        console.error("Erro ao carregar prontuario:", error);
        setNotFound(true);
        setPatient(null);
        setAppointments([]);
        setRecords([]);
      } finally {
        setIsLoading(false);
      }
    }

    carregarDados();
  }, [id]);

  const patientInitials = useMemo(() => {
    if (!patient?.nome) return "PA";
    return patient.nome.split(" ").map((name) => name[0]).join("").slice(0, 2);
  }, [patient?.nome]);

  const sessionSummary = useMemo(() => {
    const nowTimestamp = Date.now();
    const sortedAppointments = appointments
      .filter((appointment) => appointment.status !== "cancelada" && appointment.status !== "recusada")
      .map((appointment) => ({
        ...appointment,
        timestamp: getTimestamp(appointment.data_consulta),
      }))
      .filter((appointment) => appointment.timestamp !== null)
      .sort((a, b) => b.timestamp - a.timestamp);

    const lastSession = sortedAppointments.find((appointment) => appointment.timestamp <= nowTimestamp) ?? null;
    const nextSession = [...sortedAppointments]
      .reverse()
      .find((appointment) => appointment.timestamp > nowTimestamp) ?? null;

    return {
      lastSession: lastSession?.data_consulta ?? null,
      nextSession: nextSession?.data_consulta ?? null,
    };
  }, [appointments]);

  async function handleSaveRecord() {
    if (!patient?.id) return;

    const trimmedNote = newNote.trim();

    if (!trimmedNote) {
      toast.error("Preencha a anotacao clinica antes de salvar.");
      return;
    }

    setIsSaving(true);

    try {
      const created = await cadastrarProntuario({
        paciente_id: patient.id,
        data_sessao: sessionDate,
        numero_sessao: sessionNumber ? Number(sessionNumber) : null,
        anotacoes: trimmedNote,
        anexos_url: selectedAttachment?.path ?? null,
      });

      setRecords((current) =>
        [created, ...current]
          .sort((a, b) => `${b.data_sessao}`.localeCompare(`${a.data_sessao}`)),
      );
      setNewNote("");
      setSessionDate(formatDateInput(new Date()));
      setSessionNumber(String((created.numero_sessao ?? records[0]?.numero_sessao ?? 0) + 1));
      setSelectedAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast.success("Evolucao salva com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar a evolucao.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !patient?.id) return;

    setIsUploadingFile(true);

    try {
      const uploaded = await uploadAnexoProntuario(file, patient.id);
      setSelectedAttachment({
        fileName: uploaded.fileName,
        path: uploaded.path,
      });
      toast.success("Anexo enviado com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel enviar o anexo.";
      setSelectedAttachment(null);
      toast.error(message);
    } finally {
      setIsUploadingFile(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout role="psychologist" userName={psychologistName}>
        <div className="max-w-5xl space-y-6">
          <div className="flex items-start gap-3">
            <Link to="/psi/pacientes" className="mt-0.5 p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">Carregando prontuario...</h1>
              <p className="mt-1 text-sm text-muted-foreground">Buscando historico clinico do paciente.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (notFound || !patient) {
    return (
      <AppLayout role="psychologist" userName={psychologistName}>
        <div className="max-w-5xl space-y-6">
          <div className="flex items-start gap-3">
            <Link to="/psi/pacientes" className="mt-0.5 p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">Paciente nao encontrado</h1>
              <p className="mt-1 text-sm text-muted-foreground">Nao foi possivel localizar este prontuario.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="max-w-5xl space-y-6">
        <div className="flex items-start gap-3">
          <Link to="/psi/pacientes" className="mt-0.5 p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Prontuario clinico</p>
                <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">Registro de Evolucao</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Documento de uso profissional destinado ao acompanhamento clinico e registro sigiloso das sessoes.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <Lock className="w-4 h-4" />
                <span>Documento sigiloso</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
          <div className="flex min-h-[124px] items-center gap-4 rounded-2xl border border-border/80 bg-card px-5 py-4 shadow-sm">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-bold text-primary">
              {patientInitials}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Paciente</p>
              <h2 className="mt-1 font-heading text-xl font-semibold leading-tight text-foreground">{patient.nome}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>CPF {formatCpf(patient.cpf)}</span>
                <span>Nascimento {formatBirthDate(patient.data_nascimento)}</span>
              </div>
            </div>
          </div>

          <div className="flex min-h-[124px] flex-col justify-between rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Status</p>
            <p className="text-sm font-semibold leading-snug text-foreground">
              {patient.ativo ? "Em acompanhamento" : "Inativo"}
            </p>
          </div>

          <div className="flex min-h-[124px] flex-col justify-between rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Ultima sessao</p>
            <p className="text-sm font-semibold leading-snug text-foreground">
              {formatDateValue(sessionSummary.lastSession)}
            </p>
          </div>

          <div className="flex min-h-[124px] flex-col justify-between rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Proxima sessao</p>
            <p className="text-sm font-semibold leading-snug text-foreground">
              {sessionSummary.nextSession ? formatDateValue(sessionSummary.nextSession) : "Nao agendada"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-primary/15 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-primary">
                <Plus className="w-3.5 h-3.5" />
                Nova Evolucao
              </div>
              <h2 className="font-heading text-xl font-semibold leading-tight text-foreground">Registrar observacoes da sessao atual</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Organize o registro clinico com contexto objetivo, linguagem tecnica e anexos relevantes ao acompanhamento.
              </p>
            </div>

            <div className="w-full rounded-xl border border-border/70 bg-background/80 px-4 py-3 text-sm leading-relaxed text-muted-foreground xl:max-w-sm">
              O conteudo salvo passa a integrar o historico clinico do paciente.
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_300px]">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <label className="mb-2.5 block text-sm font-medium text-foreground">Data da sessao</label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                  <label className="mb-2.5 block text-sm font-medium text-foreground">Numero da sessao</label>
                  <input
                    type="number"
                    value={sessionNumber}
                    onChange={(e) => setSessionNumber(e.target.value)}
                    className="h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-3">
                    <label className="block text-sm font-medium text-foreground">Anotacao clinica</label>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      Registre observacoes, intervencoes, resposta emocional, temas centrais e encaminhamentos.
                    </p>
                  </div>
                  <div className="shrink-0 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    Texto confidencial
                  </div>
                </div>
                <textarea
                  rows={13}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Descreva a evolucao da sessao com clareza, objetividade e foco clinico..."
                  className="min-h-[320px] w-full rounded-xl border border-input bg-background px-5 py-4 text-sm leading-7 text-foreground placeholder:text-muted-foreground/80 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20 resize-y"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-border bg-background/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Anexos da evolucao</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Adicione documentos de apoio, registros complementares ou arquivos clinicos pertinentes.
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelection}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  {...getProfessionalPreviewActionProps({
                    description:
                      "O envio de anexos clinicos esta bloqueado no modo preview. Libere o acesso para usar o prontuario de forma completa.",
                  })}
                  disabled={isUploadingFile}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  {isUploadingFile ? "Enviando arquivo..." : "Selecionar arquivo"}
                </button>

                <div className="mt-3 rounded-xl bg-muted/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                  {selectedAttachment
                    ? `Arquivo selecionado: ${selectedAttachment.fileName}`
                    : isUploadingFile
                      ? "Fazendo upload do anexo selecionado..."
                      : "Nenhum anexo selecionado para esta evolucao."}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <p className="text-sm font-medium text-foreground">Boas praticas de registro</p>
                <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                  <li>Registre fatos clinicos relevantes de forma objetiva.</li>
                  <li>Evite informacoes vagas ou sem contexto assistencial.</li>
                  <li>Inclua encaminhamentos e combinados quando necessario.</li>
                </ul>
              </div>

              <button
                onClick={handleSaveRecord}
                disabled={isSaving || isUploadingFile}
                {...getProfessionalPreviewActionProps({
                  description:
                    "O salvamento de prontuarios e evolucoes clinicas fica disponivel assim que sua area profissional for liberada.",
                })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Salvando..." : "Salvar Evolucao"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Historico clinico</p>
              <h2 className="mt-1 font-heading text-xl font-semibold text-foreground">Historico de Evolucoes</h2>
            </div>
            <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              {records.length} registros
            </div>
          </div>

          {records.length === 0 ? (
            <div className="rounded-2xl border border-border/80 bg-card p-8 text-center shadow-sm">
              <p className="text-sm font-medium text-foreground">Nenhuma evolucao registrada</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Este paciente ainda nao possui historico no prontuario. Use o formulario acima para registrar a primeira evolucao.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <article key={record.id} className="rounded-2xl border border-border/80 bg-card px-5 py-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {record.numero_sessao ? (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                            Sessao #{record.numero_sessao}
                          </span>
                        ) : null}
                        <span className="text-sm font-semibold leading-none text-foreground">
                          {formatDateValue(record.data_sessao)}
                        </span>
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Registro evolutivo</p>
                    </div>

                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      Documento clinico
                    </div>
                  </div>

                  <div className="mt-3 border-l-2 border-border/70 pl-4">
                    <p className="text-sm leading-6 text-foreground/88">{record.anotacoes}</p>
                  </div>

                  {record.anexos.length > 0 && (
                    <div className="mt-3 rounded-xl bg-muted/35 px-4 py-2.5">
                      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        <Paperclip className="w-3.5 h-3.5" />
                        Anexos
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.anexos.map((attachment, index) => (
                          <a
                            key={index}
                            href={getAttachmentHref(attachment)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-primary"
                          >
                            <Paperclip className="w-3 h-3" />
                            {getAttachmentLabel(attachment)}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
