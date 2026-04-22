import { AppLayout } from "@/components/layout/AppLayout";
import {
  getProfessionalPreviewActionProps,
  usePsychologistProfessionalPreview,
} from "@/components/psychologist/ProfessionalPreview";
import { toast } from "@/components/ui/sonner";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import {
  atualizarConsulta,
  cadastrarConsulta,
  listarConsultasDoDia,
  responderSolicitacaoConsulta,
} from "@/services/consultas";
import { listarPacientes } from "@/services/pacientes";
import {
  getConsultationModalityLabel,
  normalizeAppointmentModality,
  type AppointmentModality,
} from "@/services/psychologistConsultationSettings";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

const statusColors: Record<string, string> = {
  requested: "bg-primary/10 text-primary border-primary/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  counterproposal: "bg-info/10 text-info border-info/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  refused: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
  missed: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-info/10 text-info border-info/20",
};

const statusLabels: Record<string, string> = {
  requested: "Solicitada",
  confirmed: "Confirmada",
  pending: "Pendente",
  counterproposal: "Contraproposta",
  cancelled: "Cancelada",
  refused: "Recusada",
  completed: "Realizada",
  missed: "Faltou",
  rescheduled: "Reagendada",
};

const manualStatusOptions: Array<
  "requested" | "pending" | "confirmed" | "cancelled" | "completed" | "missed" | "rescheduled"
> = ["requested", "pending", "confirmed", "cancelled", "completed", "missed", "rescheduled"];

const statusMap: Record<string, keyof typeof statusLabels> = {
  solicitada: "requested",
  confirmada: "confirmed",
  pendente: "pending",
  contraproposta: "counterproposal",
  cancelada: "cancelled",
  recusada: "refused",
  realizada: "completed",
  faltou: "missed",
  reagendada: "rescheduled",
};

const reverseStatusMap: Record<
  keyof typeof statusLabels,
  | "solicitada"
  | "pendente"
  | "confirmada"
  | "contraproposta"
  | "cancelada"
  | "recusada"
  | "realizada"
  | "faltou"
  | "reagendada"
> = {
  requested: "solicitada",
  pending: "pendente",
  confirmed: "confirmada",
  counterproposal: "contraproposta",
  cancelled: "cancelada",
  refused: "recusada",
  completed: "realizada",
  missed: "faltou",
  rescheduled: "reagendada",
};

const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

type ConsultaDoDia = {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  requestedDateTimeOriginal: string | null;
  respondedAt: string | null;
  duration: number;
  status: keyof typeof statusLabels;
  modality: AppointmentModality | null;
  type: string;
  room: string;
  notes: string;
};

type PacienteOption = {
  id: string;
  nome: string;
};

const initialAppointmentForm = {
  paciente_id: "",
  data: "",
  hora: "08:00",
  status: "pending" as keyof typeof statusLabels,
  observacoes: "",
};

function getAppointmentType(status: keyof typeof statusLabels, modality: AppointmentModality | null) {
  if (modality === "presencial") {
    if (status === "requested") return "Solicitacao presencial";
    if (status === "counterproposal") return "Contraproposta presencial";
    return "Atendimento presencial";
  }

  if (modality === "online") {
    if (status === "requested") return "Solicitacao online";
    if (status === "counterproposal") return "Contraproposta online";
    return "Atendimento online";
  }

  if (status === "requested") return "Solicitacao de horario";
  if (status === "counterproposal") return "Contraproposta de horario";
  return "Sessao Individual";
}

function getAppointmentRoom(status: keyof typeof statusLabels, modality: AppointmentModality | null) {
  if (modality === "presencial") return "Presencial";
  if (modality === "online") return "Online";
  if (status === "requested") return "A confirmar";
  if (status === "counterproposal") return "Aguardando paciente";
  return "Sala 1";
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return "Nao informado";

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "Nao informado";

  return `${parsedDate.toLocaleDateString("pt-BR")} as ${parsedDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function buildDateTimeInputValue(date: string, time: string) {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalizedTime}`;
}

function mapConsultaToForm(consulta: ConsultaDoDia) {
  return {
    paciente_id: consulta.patientId,
    data: consulta.date,
    hora: consulta.time,
    status: consulta.status,
    observacoes: consulta.notes,
  };
}

function parseDateKey(value: string | null) {
  if (!value) return null;
  const parsedDate = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export default function PsychologistAgenda() {
  const { isPreviewMode } = usePsychologistProfessionalPreview();
  const { data: profile } = useCurrentPsychologistProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(searchParams.get("data")) ?? new Date());
  const [appointments, setAppointments] = useState<ConsultaDoDia[]>([]);
  const [patients, setPatients] = useState<PacienteOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPatientsLoading, setIsPatientsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefusingRequest, setIsRefusingRequest] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSuggestingOtherTime, setIsSuggestingOtherTime] = useState(false);
  const [isCounterProposalOpen, setIsCounterProposalOpen] = useState(false);
  const [counterProposalForm, setCounterProposalForm] = useState({
    data: "",
    hora: "08:00",
  });
  const [appointmentForm, setAppointmentForm] = useState(initialAppointmentForm);
  const [selectedApt, setSelectedApt] = useState<ConsultaDoDia | null>(null);
  const [editingApt, setEditingApt] = useState<ConsultaDoDia | null>(null);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const visibleAppointments = useMemo(
    () => appointments.filter((appointment) => !["cancelled", "refused"].includes(appointment.status)),
    [appointments],
  );
  const requestedAppointments = useMemo(
    () => visibleAppointments.filter((appointment) => appointment.status === "requested"),
    [visibleAppointments],
  );
  const requestedConsultaId = searchParams.get("consultaId")?.trim() || "";
  const requestedDateKey = searchParams.get("data")?.trim() || "";

  function mapConsultaFromApi(consulta: Record<string, unknown>): ConsultaDoDia {
    const rawDateTime = typeof consulta.data_consulta === "string" ? consulta.data_consulta : "";
    const dataConsulta = new Date(rawDateTime);
    const normalizedStatus = statusMap[String(consulta.status || "").trim().toLowerCase()] ?? "pending";
    const modality = normalizeAppointmentModality(
      typeof consulta.modalidade_consulta === "string" ? consulta.modalidade_consulta : typeof consulta.modalidade === "string" ? consulta.modalidade : null,
    );
    const resolvedDuration =
      typeof consulta.duracao_consulta_min === "number"
        ? consulta.duracao_consulta_min
        : Number(consulta.duracao_consulta_min || 50) || 50;

    const pacientes =
      consulta.pacientes && typeof consulta.pacientes === "object" && !Array.isArray(consulta.pacientes)
        ? (consulta.pacientes as Record<string, unknown>)
        : null;

    return {
      id: String(consulta.id || ""),
      patientId: String(consulta.paciente_id || ""),
      patientName: typeof pacientes?.nome === "string" && pacientes.nome.trim() ? pacientes.nome.trim() : "Paciente",
      date: formatDateKey(dataConsulta),
      time: dataConsulta.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      requestedDateTimeOriginal:
        typeof consulta.data_consulta_solicitada_original === "string" && consulta.data_consulta_solicitada_original.trim()
          ? consulta.data_consulta_solicitada_original
          : rawDateTime || null,
      respondedAt:
        typeof consulta.respondida_em === "string" && consulta.respondida_em.trim()
          ? consulta.respondida_em
          : null,
      duration: resolvedDuration,
      status: normalizedStatus,
      modality,
      type: getAppointmentType(normalizedStatus, modality),
      room: getAppointmentRoom(normalizedStatus, modality),
      notes: typeof consulta.observacoes === "string" ? consulta.observacoes : "",
    };
  }

  async function carregarConsultas() {
    if (view !== "day") {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const consultas = await listarConsultasDoDia(selectedDateKey, {
        syncStatuses: !isPreviewMode,
      });
      setAppointments(((consultas as Record<string, unknown>[]) ?? []).map(mapConsultaFromApi));
    } catch (error) {
      console.error("Erro ao carregar consultas:", error);
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void carregarConsultas();
  }, [isPreviewMode, selectedDateKey, view]);

  useEffect(() => {
    const targetDate = parseDateKey(requestedDateKey);
    if (!targetDate) return;

    if (view !== "day") {
      setView("day");
    }

    if (formatDateKey(targetDate) !== selectedDateKey) {
      setSelectedDate(targetDate);
    }
  }, [requestedDateKey, selectedDateKey, view]);

  useEffect(() => {
    async function carregarPacientes() {
      try {
        const data = await listarPacientes();
        setPatients(((data as PacienteOption[]) ?? []).map((patient) => ({
          id: patient.id,
          nome: patient.nome,
        })));
      } catch (error) {
        console.error("Erro ao carregar pacientes:", error);
        setPatients([]);
      } finally {
        setIsPatientsLoading(false);
      }
    }

    void carregarPacientes();
  }, []);

  useEffect(() => {
    if (!requestedConsultaId) return;
    if (requestedDateKey && requestedDateKey !== selectedDateKey) return;
    if (isLoading) return;

    const requestedAppointment = appointments.find((appointment) => appointment.id === requestedConsultaId);

    if (requestedAppointment) {
      setIsCreateOpen(false);
      setIsEditOpen(false);
      setEditingApt(null);
      setSelectedApt(requestedAppointment);
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("consultaId");
    nextSearchParams.delete("data");
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    appointments,
    isLoading,
    requestedConsultaId,
    requestedDateKey,
    searchParams,
    selectedDateKey,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!selectedApt || selectedApt.status !== "requested") {
      setIsCounterProposalOpen(false);
      return;
    }

    setCounterProposalForm({
      data: selectedApt.date,
      hora: selectedApt.time,
    });
    setIsCounterProposalOpen(false);
  }, [selectedApt]);

  function goToPreviousDay() {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() - 1);
      return next;
    });
  }

  function goToNextDay() {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + 1);
      return next;
    });
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

  function openCreateModal() {
    setIsEditOpen(false);
    setEditingApt(null);
    setSelectedApt(null);
    setAppointmentForm({
      ...initialAppointmentForm,
      data: selectedDateKey,
    });
    setIsCreateOpen(true);
  }

  function openEditModal() {
    if (!selectedApt) return;

    setAppointmentForm(mapConsultaToForm(selectedApt));
    setIsCreateOpen(false);
    setEditingApt(selectedApt);
    setIsEditOpen(true);
    setSelectedApt(null);
  }

  function closeDetailsModal() {
    setSelectedApt(null);
    setIsCounterProposalOpen(false);
  }

  async function handleCreateAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!appointmentForm.paciente_id) {
      toast.error("Selecione um paciente.");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await cadastrarConsulta({
        paciente_id: appointmentForm.paciente_id,
        data_consulta: `${appointmentForm.data}T${appointmentForm.hora}:00`,
        status: reverseStatusMap[appointmentForm.status],
        observacoes: appointmentForm.observacoes.trim() || null,
      });

      const selectedPatient = patients.find((patient) => patient.id === appointmentForm.paciente_id);
      const createdAppointment: ConsultaDoDia | null = created?.[0]
        ? {
            id: created[0].id,
            patientId: created[0].paciente_id,
            patientName: selectedPatient?.nome ?? "Paciente",
            date: appointmentForm.data,
            time: appointmentForm.hora,
            requestedDateTimeOriginal: `${appointmentForm.data}T${appointmentForm.hora}:00`,
            respondedAt: null,
            duration: 50,
            status: appointmentForm.status,
            modality: null,
            type: getAppointmentType(appointmentForm.status, null),
            room: getAppointmentRoom(appointmentForm.status, null),
            notes: appointmentForm.observacoes.trim(),
          }
        : null;

      if (createdAppointment && createdAppointment.date === selectedDateKey) {
        setAppointments((current) =>
          [...current.filter((item) => item.id !== createdAppointment.id), createdAppointment].sort((a, b) =>
            `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
          ),
        );
      }

      toast.success("Consulta cadastrada com sucesso.");
      setIsCreateOpen(false);
      setAppointmentForm(initialAppointmentForm);
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel cadastrar a consulta.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingApt) return;

    setIsSubmitting(true);

    try {
      await atualizarConsulta(editingApt.id, {
        data_consulta: `${appointmentForm.data}T${appointmentForm.hora}:00`,
        status: reverseStatusMap[appointmentForm.status],
        observacoes: appointmentForm.observacoes.trim() || null,
      });

      setAppointments((current) =>
        current
          .map((item) =>
            item.id === editingApt.id
              ? {
                  ...item,
                  date: appointmentForm.data,
                  time: appointmentForm.hora,
                  status: appointmentForm.status,
                  type: getAppointmentType(appointmentForm.status, item.modality),
                  room: getAppointmentRoom(appointmentForm.status, item.modality),
                  notes: appointmentForm.observacoes.trim(),
                }
              : item,
          )
          .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
      );

      toast.success("Consulta atualizada com sucesso.");
      setIsEditOpen(false);
      setEditingApt(null);
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel atualizar a consulta.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmAppointment() {
    if (!selectedApt) return;

    setIsConfirming(true);

    try {
      await responderSolicitacaoConsulta({
        consultaId: selectedApt.id,
        acao: "confirmar",
      });

      toast.success("Solicitacao confirmada com sucesso.");
      closeDetailsModal();
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel confirmar a solicitacao.";
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleRefuseRequest() {
    if (!selectedApt) return;

    setIsRefusingRequest(true);

    try {
      await responderSolicitacaoConsulta({
        consultaId: selectedApt.id,
        acao: "recusar",
      });

      toast.success("Solicitacao recusada com sucesso.");
      closeDetailsModal();
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel recusar a solicitacao.";
      toast.error(message);
    } finally {
      setIsRefusingRequest(false);
    }
  }

  async function handleSuggestOtherTime() {
    if (!selectedApt) return;

    if (!counterProposalForm.data || !counterProposalForm.hora) {
      toast.error("Informe a nova data e o novo horario da contraproposta.");
      return;
    }

    setIsSuggestingOtherTime(true);

    try {
      await responderSolicitacaoConsulta({
        consultaId: selectedApt.id,
        acao: "sugerir_outro_horario",
        novaDataConsulta: buildDateTimeInputValue(counterProposalForm.data, counterProposalForm.hora),
      });

      toast.success("Contraproposta registrada com sucesso.");
      closeDetailsModal();
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel registrar a contraproposta.";
      toast.error(message);
    } finally {
      setIsSuggestingOtherTime(false);
    }
  }

  async function handleCancelAppointment() {
    if (!selectedApt) return;

    setIsCancelling(true);

    try {
      await atualizarConsulta(selectedApt.id, {
        status: "cancelada",
      });

      setAppointments((current) =>
        current.map((item) =>
          item.id === selectedApt.id ? { ...item, status: "cancelled" } : item,
        ),
      );

      toast.success("Consulta cancelada com sucesso.");
      closeDetailsModal();
      await carregarConsultas();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel cancelar a consulta.";
      toast.error(message);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Agenda</h1>
            <p className="mt-1 text-muted-foreground">Gerencie seus horarios e consultas.</p>
          </div>
          <button
            onClick={openCreateModal}
            {...getProfessionalPreviewActionProps({
              description:
                "Para criar agendamentos reais na sua agenda profissional, escolha um plano e libere o acesso completo.",
            })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold gradient-primary text-primary-foreground transition-all hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo Agendamento
          </button>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <button onClick={goToPreviousDay} className="rounded-lg p-2 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="font-heading font-semibold capitalize text-foreground">{formatDisplayDate(selectedDate)}</h2>
            <button onClick={goToNextDay} className="rounded-lg p-2 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={goToToday} className="ml-2 text-sm font-medium text-primary hover:underline">
              Hoje
            </button>
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            {(["day", "week", "month"] as const).map((currentView) => (
              <button
                key={currentView}
                onClick={() => setView(currentView)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                  view === currentView ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {currentView === "day" ? "Dia" : currentView === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {view !== "day" ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">A visualizacao atual esta disponivel apenas com a agenda do dia.</div>
          ) : isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">Carregando consultas...</div>
          ) : (
            <div className="divide-y divide-border">
              {hours.map((hour) => {
                const apt = visibleAppointments.find((appointment) => appointment.time === hour && appointment.date === selectedDateKey);
                return (
                  <div key={hour} className="flex min-h-[64px]">
                    <div className="flex w-20 flex-shrink-0 items-start justify-center border-r border-border bg-muted/30 p-3 text-sm font-medium text-muted-foreground">
                      {hour}
                    </div>
                    <div className="flex-1 p-2">
                      {apt ? (
                        <button
                          onClick={() => {
                            setIsCreateOpen(false);
                            setIsEditOpen(false);
                            setSelectedApt(apt);
                          }}
                          className={`w-full rounded-lg border p-3 text-left transition-all hover:shadow-sm ${statusColors[apt.status]}`}
                        >
                          <p className="text-sm font-medium">{apt.patientName}</p>
                          <p className="mt-0.5 text-xs opacity-80">{apt.type} · {apt.duration}min · {apt.room}</p>
                          <span className="mt-1 inline-block text-xs font-medium">{statusLabels[apt.status]}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          {Object.entries(statusLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className={`h-3 w-3 rounded-full ${statusColors[key].split(" ")[0]}`} />
              {label}
            </div>
          ))}
        </div>

        {requestedAppointments.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Solicitacoes de Horario</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pedidos recebidos para {formatDisplayDate(selectedDate)}.</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {requestedAppointments.length} solicitacao{requestedAppointments.length > 1 ? "es" : ""}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {requestedAppointments.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                    setSelectedApt(appointment);
                  }}
                  className="flex w-full items-start justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-left transition-all hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{appointment.patientName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(`${appointment.date}T00:00:00`).toLocaleDateString("pt-BR")} as {appointment.time}
                      {appointment.modality ? ` · ${getConsultationModalityLabel(appointment.modality)}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {appointment.notes || "Sem observacoes adicionais do paciente."}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {statusLabels.requested}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)}>
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-foreground">Novo Agendamento</h2>
              <button onClick={() => setIsCreateOpen(false)} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={handleCreateAppointment}
              {...getProfessionalPreviewActionProps({
                description:
                  "A criacao de agendamentos reais esta bloqueada no modo preview. Escolha um plano para liberar sua agenda profissional.",
              })}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Paciente</label>
                <select
                  value={appointmentForm.paciente_id}
                  onChange={(e) => setAppointmentForm((current) => ({ ...current, paciente_id: e.target.value }))}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  disabled={isPatientsLoading}
                >
                  <option value="">{isPatientsLoading ? "Carregando pacientes..." : "Selecione um paciente"}</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.nome}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Data</label>
                  <input
                    type="date"
                    value={appointmentForm.data}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, data: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Hora</label>
                  <select
                    value={appointmentForm.hora}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, hora: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    {hours.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                <select
                  value={appointmentForm.status}
                  onChange={(e) => setAppointmentForm((current) => ({ ...current, status: e.target.value as keyof typeof statusLabels }))}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                >
                  {manualStatusOptions.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Observacoes</label>
                <textarea
                  rows={3}
                  value={appointmentForm.observacoes}
                  onChange={(e) => setAppointmentForm((current) => ({ ...current, observacoes: e.target.value }))}
                  placeholder="Observacoes da consulta..."
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isEditOpen && editingApt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm" onClick={() => { setIsEditOpen(false); setEditingApt(null); }}>
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-foreground">Editar Consulta</h2>
              <button onClick={() => { setIsEditOpen(false); setEditingApt(null); }} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={handleEditAppointment}
              {...getProfessionalPreviewActionProps({
                description:
                  "A atualizacao de consultas reais fica disponivel assim que sua area profissional for liberada.",
              })}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Paciente</label>
                <input
                  type="text"
                  value={editingApt.patientName}
                  readOnly
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Data</label>
                  <input
                    type="date"
                    value={appointmentForm.data}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, data: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Hora</label>
                  <select
                    value={appointmentForm.hora}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, hora: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    {hours.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                <select
                  value={appointmentForm.status}
                  onChange={(e) => setAppointmentForm((current) => ({ ...current, status: e.target.value as keyof typeof statusLabels }))}
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                >
                  {manualStatusOptions.map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Observacoes</label>
                <textarea
                  rows={3}
                  value={appointmentForm.observacoes}
                  onChange={(e) => setAppointmentForm((current) => ({ ...current, observacoes: e.target.value }))}
                  placeholder="Observacoes da consulta..."
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => { setIsEditOpen(false); setEditingApt(null); }} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedApt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm" onClick={closeDetailsModal}>
          <div className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-foreground">Detalhes da Consulta</h2>
              <button onClick={closeDetailsModal} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                ["Paciente", selectedApt.patientName],
                ["Data", new Date(`${selectedApt.date}T00:00:00`).toLocaleDateString("pt-BR")],
                ["Horario", `${selectedApt.time} - ${selectedApt.duration}min`],
                ...(selectedApt.status === "counterproposal"
                  ? [["Horario solicitado", formatDateTimeLabel(selectedApt.requestedDateTimeOriginal)]]
                  : []),
                ["Modalidade", selectedApt.modality ? getConsultationModalityLabel(selectedApt.modality) : "A definir"],
                ["Tipo", selectedApt.type],
                ["Sala", selectedApt.room],
                ["Notas", selectedApt.notes || "Sem notas"],
              ].map(([label, value], index) => (
                <div key={`${label}-${index}`} className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-right text-sm font-medium text-foreground">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[selectedApt.status]}`}>
                  {statusLabels[selectedApt.status]}
                </span>
              </div>
            </div>

            {selectedApt.status === "requested" ? (
              <>
                {isCounterProposalOpen ? (
                  <div className="mt-6 space-y-4 rounded-xl border border-info/20 bg-info/5 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Sugerir outro horario</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        A contraproposta fica salva no banco com status proprio e prepara o fluxo para o paciente responder depois.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Nova data</label>
                        <input
                          type="date"
                          value={counterProposalForm.data}
                          onChange={(e) => setCounterProposalForm((current) => ({ ...current, data: e.target.value }))}
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Novo horario</label>
                        <input
                          type="time"
                          value={counterProposalForm.hora}
                          onChange={(e) => setCounterProposalForm((current) => ({ ...current, hora: e.target.value }))}
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleSuggestOtherTime}
                        disabled={isSuggestingOtherTime}
                        {...getProfessionalPreviewActionProps({
                          description:
                            "A contraproposta de horarios reais fica disponivel assim que sua area profissional for liberada.",
                        })}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isSuggestingOtherTime ? "Enviando..." : "Enviar contraproposta"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCounterProposalOpen(false)}
                        className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleConfirmAppointment}
                    disabled={isConfirming}
                    {...getProfessionalPreviewActionProps({
                      description:
                        "A confirmacao de solicitacoes reais fica disponivel assim que sua area profissional for liberada.",
                    })}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isConfirming ? "Confirmando..." : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCounterProposalOpen((current) => !current)}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    {isCounterProposalOpen ? "Ocultar sugestao" : "Sugerir outro horario"}
                  </button>
                </div>

                <button
                  onClick={handleRefuseRequest}
                  disabled={isRefusingRequest}
                  {...getProfessionalPreviewActionProps({
                    description:
                      "No modo preview, a agenda fica disponivel para exploracao visual. Para recusar solicitacoes reais, libere o acesso completo.",
                  })}
                  className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isRefusingRequest ? "Recusando..." : "Recusar solicitacao"}
                </button>

                <button onClick={closeDetailsModal} className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                  Fechar
                </button>
              </>
            ) : selectedApt.status === "counterproposal" ? (
              <>
                <div className="mt-6 rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
                  A contraproposta foi registrada e ja pode ser visualizada pelo paciente na area de agendamentos.
                </div>
                <button onClick={closeDetailsModal} className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                  Fechar
                </button>
              </>
            ) : (
              <>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={openEditModal}
                    {...getProfessionalPreviewActionProps({
                      description:
                        "A edicao de agendamentos fica disponivel depois da liberacao do plano. Enquanto isso, voce pode explorar a agenda em modo preview.",
                    })}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground"
                  >
                    Editar
                  </button>
                  <button onClick={closeDetailsModal} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                    Cancelar
                  </button>
                </div>
                <button
                  onClick={handleCancelAppointment}
                  disabled={isCancelling}
                  {...getProfessionalPreviewActionProps({
                    description:
                      "No modo preview, a agenda fica disponivel para exploracao visual. Para cancelar consultas reais, libere o acesso completo.",
                  })}
                  className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCancelling ? "Cancelando..." : "Cancelar consulta"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
