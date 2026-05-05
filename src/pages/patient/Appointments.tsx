import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Calendar, Clock, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import {
  getAvailableModalities,
  getConsultationModalityLabel,
  type AppointmentModality,
} from "@/services/psychologistConsultationSettings";
import {
  buildAvailableTimeSlots,
  formatDateKey,
  getDefaultWorkingHours,
  getNextActiveDate,
  getScheduleDayByDate,
} from "@/services/psychologistAvailability";
import {
  fetchPatientAppointmentsData,
  patientAppointmentsQueryKey,
  respondPatientCounterproposal,
  requestPatientAppointment,
  type PatientAppointment,
} from "@/services/patientAppointments";

const statusColors: Record<string, string> = {
  solicitada: "bg-primary/10 text-primary",
  confirmada: "bg-success/10 text-success",
  pendente: "bg-warning/10 text-warning",
  contraproposta: "bg-info/10 text-info",
  reagendada: "bg-info/10 text-info",
  realizada: "bg-muted text-muted-foreground",
  recusada: "bg-destructive/10 text-destructive",
  cancelada: "bg-destructive/10 text-destructive",
  faltou: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  solicitada: "Solicitada",
  confirmada: "Confirmada",
  pendente: "Pendente",
  contraproposta: "Contraproposta",
  reagendada: "Reagendada",
  realizada: "Realizada",
  recusada: "Recusada",
  cancelada: "Cancelada",
  faltou: "Nao compareceu",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return { date: "Data indisponivel", time: "Horario indisponivel" };
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return { date: "Data indisponivel", time: "Horario indisponivel" };
  }

  return {
    date: parsedDate.toLocaleDateString("pt-BR"),
    time: parsedDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Valor nao informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getInitialRequestModality(availableModalities: AppointmentModality[]): AppointmentModality | null {
  return availableModalities[0] ?? null;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase();
}

function findAppointmentById(appointments: PatientAppointment[], appointmentId: string) {
  const normalizedAppointmentId = appointmentId.trim();

  if (!normalizedAppointmentId) {
    return null;
  }

  return appointments.find((appointment) => appointment.id === normalizedAppointmentId) ?? null;
}

function canPatientRespondToScheduleChange(appointment: PatientAppointment) {
  const status = normalizeStatus(appointment.status);

  return status === "contraproposta" || status === "reagendada";
}

function canPayAppointment(appointment: PatientAppointment) {
  return (
    normalizeStatus(appointment.paymentStatus || "") === "aguardando_pagamento" &&
    Boolean(appointment.paymentUrl)
  );
}

function getPaymentStatusLabel(appointment: PatientAppointment) {
  if (normalizeStatus(appointment.paymentStatus || "") === "aguardando_pagamento") {
    return "Pagamento pendente";
  }

  if (normalizeStatus(appointment.paymentStatus || "") === "pago") {
    return "Pago";
  }

  return "";
}

function getScheduleChangeResponseVariant(appointment: PatientAppointment) {
  return normalizeStatus(appointment.status) === "reagendada" ? "reagendamento" : "contraproposta";
}

function getActionLabel(appointment: PatientAppointment) {
  const status = normalizeStatus(appointment.status);

  if (status === "solicitada") {
    return "Aguardando analise";
  }

  if (status === "contraproposta") {
    return "Responder contraproposta";
  }

  if (status === "reagendada" && canPatientRespondToScheduleChange(appointment)) {
    return "Responder reagendamento";
  }

  if (appointment.isUpcoming && ["confirmada", "pendente", "reagendada"].includes(status)) {
    return "Agendada";
  }

  if (status === "realizada") {
    return "Concluida";
  }

  if (status === "faltou") {
    return "Nao compareceu";
  }

  if (status === "cancelada") {
    return "Cancelada";
  }

  if (status === "recusada") {
    return "Solicitacao recusada";
  }

  return "Sem acoes";
}

function getDefaultRequestDateFromSchedule() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateInputValue(getNextActiveDate(getDefaultWorkingHours(), tomorrow));
}

function getMinRequestDate() {
  return formatDateInputValue(new Date());
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shouldShowOriginalRequestedDate(appointment: PatientAppointment) {
  const currentDateTime = appointment.dateTime?.trim() || "";
  const originalDateTime = appointment.requestedDateTimeOriginal?.trim() || "";
  return Boolean(originalDateTime) && originalDateTime !== currentDateTime;
}

function logAppointmentSubmitDebug(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Psivinculo][patient-appointments-modal][${label}]`, payload);
}

export default function PatientAppointments() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestDate, setRequestDate] = useState(getDefaultRequestDateFromSchedule);
  const [requestTime, setRequestTime] = useState("");
  const [requestModality, setRequestModality] = useState<AppointmentModality | null>("presencial");
  const [requestNotes, setRequestNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAcceptingCounterproposal, setIsAcceptingCounterproposal] = useState(false);
  const [isRefusingCounterproposal, setIsRefusingCounterproposal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<PatientAppointment | null>(null);

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: patientAppointmentsQueryKey,
    queryFn: fetchPatientAppointmentsData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const patientName = data?.patient.fullName || "Paciente";
  const appointments = useMemo(() => data?.appointments ?? [], [data?.appointments]);
  const consultationSettings = data?.consultationSettings || null;
  const availabilitySettings = data?.availabilitySettings || null;
  const availableModalities = useMemo(
    () => getAvailableModalities(consultationSettings?.consultationModality ?? null),
    [consultationSettings?.consultationModality],
  );
  const allowsChoice = availableModalities.length > 1;
  const requestedConsultaId = searchParams.get("consultaId")?.trim() || "";
  const requestSchedule = useMemo(
    () => availabilitySettings?.schedule ?? getDefaultWorkingHours(),
    [availabilitySettings?.schedule],
  );
  const requestDurationMinutes =
    availabilitySettings?.consultationDurationMinutes ??
    consultationSettings?.consultationDurationMinutes ??
    50;
  const selectedRequestDay = useMemo(
    () => getScheduleDayByDate(requestSchedule, requestDate),
    [requestDate, requestSchedule],
  );
  const requestTimeOptions = useMemo(
    () =>
      buildAvailableTimeSlots({
        dateKey: requestDate,
        schedule: requestSchedule,
        consultationDurationMinutes: requestDurationMinutes,
      }),
    [requestDate, requestDurationMinutes, requestSchedule],
  );
  const isRequestDayActive = selectedRequestDay?.enabled ?? false;

  async function openAppointmentDetails(appointmentId: string) {
    const fallbackAppointment = findAppointmentById(appointments, appointmentId);

    try {
      const refreshedResult = await refetch();
      const refreshedAppointments = refreshedResult.data?.appointments ?? [];
      const refreshedAppointment =
        findAppointmentById(refreshedAppointments, appointmentId) ?? fallbackAppointment;

      if (refreshedAppointment) {
        setSelectedAppointment(refreshedAppointment);
      }
    } catch {
      if (fallbackAppointment) {
        setSelectedAppointment(fallbackAppointment);
      }
    }
  }

  useEffect(() => {
    if (!requestedConsultaId || isLoading) return;

    const requestedAppointmentId = requestedConsultaId;
    const fallbackAppointment = findAppointmentById(appointments, requestedAppointmentId);
    const nextSearchParams = new URLSearchParams(searchParams);
    let isActive = true;

    nextSearchParams.delete("consultaId");
    setSearchParams(nextSearchParams, { replace: true });

    void refetch()
      .then((refreshedResult) => {
        if (!isActive) return;

        const refreshedAppointments = refreshedResult.data?.appointments ?? [];
        const refreshedAppointment =
          findAppointmentById(refreshedAppointments, requestedAppointmentId) ?? fallbackAppointment;

        if (refreshedAppointment) {
          setSelectedAppointment(refreshedAppointment);
        }
      })
      .catch(() => {
        if (!isActive || !fallbackAppointment) return;
        setSelectedAppointment(fallbackAppointment);
      });

    return () => {
      isActive = false;
    };
  }, [appointments, isLoading, refetch, requestedConsultaId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedAppointment) return;

    const refreshedAppointment = appointments.find((appointment) => appointment.id === selectedAppointment.id);

    if (refreshedAppointment) {
      setSelectedAppointment(refreshedAppointment);
      return;
    }

    if (!isLoading) {
      setSelectedAppointment(null);
    }
  }, [appointments, isLoading, selectedAppointment]);

  useEffect(() => {
    if (!isRequestOpen) return;

    if (!requestModality || !availableModalities.includes(requestModality)) {
      setRequestModality(getInitialRequestModality(availableModalities));
    }
  }, [availableModalities, isRequestOpen, requestModality]);

  useEffect(() => {
    if (!isRequestOpen) return;

    if (!isRequestDayActive) {
      setRequestTime("");
      return;
    }

    if (!requestTimeOptions.includes(requestTime)) {
      setRequestTime(requestTimeOptions[0] || "");
    }
  }, [isRequestDayActive, isRequestOpen, requestTime, requestTimeOptions]);

  function openRequestModal() {
    if (data && !data.canRequestAppointment) {
      toast.error("Sua conta ainda nao esta vinculada ao psicologo responsavel.");
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextActiveDate = getNextActiveDate(requestSchedule, tomorrow);
    const nextDateKey = formatDateKey(nextActiveDate);
    const nextTimeOptions = buildAvailableTimeSlots({
      dateKey: nextDateKey,
      schedule: requestSchedule,
      consultationDurationMinutes: requestDurationMinutes,
    });

    setRequestDate(nextDateKey);
    setRequestTime(nextTimeOptions[0] || "");
    setRequestModality(getInitialRequestModality(availableModalities));
    setRequestNotes("");
    setIsRequestOpen(true);
  }

  async function handleRequestAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const trimmedNotes = requestNotes.trim();

    logAppointmentSubmitDebug("submit", {
      requestedDate: requestDate,
      requestedTime: requestTime,
      hasNotes: Boolean(trimmedNotes),
      notesLength: trimmedNotes.length,
    });

    try {
      const resolvedRequestModality =
        requestModality && availableModalities.includes(requestModality)
          ? requestModality
          : getInitialRequestModality(availableModalities);

      if (resolvedRequestModality !== requestModality) {
        setRequestModality(resolvedRequestModality);
      }

      const result = await requestPatientAppointment({
        requestedDate: requestDate,
        requestedTime: requestTime,
        modality: resolvedRequestModality,
        notes: requestNotes,
      });

      logAppointmentSubmitDebug("submit_success", {
        appointmentId:
          result && typeof result === "object" && result.appointment && typeof result.appointment === "object"
            ? String((result.appointment as Record<string, unknown>).id || "")
            : "",
        dataConsulta:
          result && typeof result === "object" && result.appointment && typeof result.appointment === "object"
            ? String((result.appointment as Record<string, unknown>).data_consulta || "")
            : "",
      });

      toast.success("Solicitacao enviada com sucesso.");
      setIsRequestOpen(false);
      setRequestNotes("");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: patientAppointmentsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["patient-dashboard"] }),
      ]);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Nao foi possivel solicitar este horario agora.",
      );
      logAppointmentSubmitDebug("submit_error", {
        requestedDate: requestDate,
        requestedTime: requestTime,
        message: requestError instanceof Error ? requestError.message : String(requestError),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRespondToCounterproposal(action: "aceitar" | "recusar") {
    if (!selectedAppointment) return;

    const setSubmittingState =
      action === "aceitar" ? setIsAcceptingCounterproposal : setIsRefusingCounterproposal;
    const responseVariant = getScheduleChangeResponseVariant(selectedAppointment);

    setSubmittingState(true);

    try {
      await respondPatientCounterproposal({
        consultaId: selectedAppointment.id,
        acao: action,
      });

      toast.success(
        action === "aceitar"
          ? responseVariant === "reagendamento"
            ? "Reagendamento confirmado com sucesso."
            : "Contraproposta aceita com sucesso."
          : responseVariant === "reagendamento"
            ? "Reagendamento recusado com sucesso."
            : "Contraproposta recusada com sucesso.",
      );
      setSelectedAppointment(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: patientAppointmentsQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["patient-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["patient-notifications"] }),
      ]);
    } catch (responseError) {
      toast.error(
        responseError instanceof Error
          ? responseError.message
          : responseVariant === "reagendamento"
            ? "Nao foi possivel responder ao reagendamento agora."
            : "Nao foi possivel responder a contraproposta agora.",
      );
    } finally {
      setSubmittingState(false);
    }
  }

  return (
    <AppLayout role="patient" userName={patientName}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Meus Agendamentos</h1>
            <p className="mt-1 text-muted-foreground">Consultas passadas, futuras e solicitacoes em andamento.</p>
          </div>
          <button
            type="button"
            onClick={openRequestModal}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold gradient-primary text-primary-foreground"
          >
            <Calendar className="h-4 w-4" />
            Solicitar Horario
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar seus agendamentos agora."}
              </p>
            </div>
          </div>
        ) : null}

        {data?.hasLinkedPatientRecord === false ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Sua conta ainda esta sendo vinculada aos atendimentos. Assim que o vinculo for concluido, os agendamentos aparecerao aqui.
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Horario</th>
                  <th className="hidden px-4 py-3 text-left font-semibold text-muted-foreground md:table-cell">Profissional</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Carregando agendamentos...
                    </td>
                  </tr>
                ) : appointments.length > 0 ? (
                  appointments.map((appointment) => {
                    const { date, time } = formatDateTime(appointment.dateTime);
                    const normalizedStatus = normalizeStatus(appointment.status);
                    const statusClassName =
                      statusColors[normalizedStatus] || "bg-muted text-muted-foreground";
                    const statusLabel =
                      statusLabels[normalizedStatus] || appointment.status || "Atualizada";
                    const paymentStatusLabel = getPaymentStatusLabel(appointment);

                    return (
                      <tr key={appointment.id} className="border-b border-border transition-colors hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{time}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          <div className="space-y-1">
                            <p>{appointment.psychologistName}</p>
                            {typeof appointment.consultationPrice === "number" ? (
                              <p className="text-xs text-muted-foreground">
                                Valor: {formatCurrency(appointment.consultationPrice)}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName}`}>
                              {statusLabel}
                            </span>
                            {paymentStatusLabel ? (
                              <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                                {paymentStatusLabel}
                              </span>
                            ) : null}
                            <span className="text-xs text-muted-foreground md:hidden">
                              {appointment.psychologistName}
                              {typeof appointment.consultationPrice === "number"
                                ? ` - ${formatCurrency(appointment.consultationPrice)}`
                                : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-2">
                            {canPayAppointment(appointment) ? (
                              <a
                                href={appointment.paymentUrl || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-foreground gradient-primary"
                              >
                                Pagar consulta
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void openAppointmentDetails(appointment.id)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Detalhes
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {getActionLabel(appointment)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Nenhum agendamento encontrado. Quando houver consultas ou solicitacoes, elas aparecerao aqui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isFetching && !isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Atualizando agendamentos...
          </div>
        ) : null}
      </div>

      {isRequestOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!isSubmitting) setIsRequestOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 animate-scale-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Solicitar Horario</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha a data e o horario desejados para enviar sua solicitacao ao psicologo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestOpen(false)}
                className="rounded-lg p-1 hover:bg-muted"
                disabled={isSubmitting}
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleRequestAppointment}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Data desejada</label>
                  <input
                    type="date"
                    value={requestDate}
                    min={getMinRequestDate()}
                    onChange={(event) => setRequestDate(event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Horario desejado</label>
                  <select
                    value={requestTime}
                    onChange={(event) => setRequestTime(event.target.value)}
                    disabled={!isRequestDayActive || requestTimeOptions.length === 0}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">
                      {!isRequestDayActive
                        ? "Dia sem atendimento configurado"
                        : requestTimeOptions.length === 0
                          ? "Sem horarios disponiveis"
                          : "Selecione um horario"}
                    </option>
                    {requestTimeOptions.map((timeOption) => (
                      <option key={timeOption} value={timeOption}>
                        {timeOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isRequestDayActive ? (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Dia sem atendimento configurado.
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Modalidade</label>
                {allowsChoice ? (
                  <select
                    value={requestModality || ""}
                    onChange={(event) =>
                      setRequestModality((event.target.value || null) as AppointmentModality | null)
                    }
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    {availableModalities.map((modality) => (
                      <option key={modality} value={modality}>
                        {getConsultationModalityLabel(modality)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-input bg-muted/40 px-4 py-3 text-sm text-foreground">
                    {getConsultationModalityLabel(requestModality)}
                  </div>
                )}

                {requestModality === "presencial" && consultationSettings?.presentialLocation ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Local informado pelo psicologo: {consultationSettings.presentialLocation}
                  </p>
                ) : null}

                {requestModality === "online" && consultationSettings?.onlineSessionLink ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Link da sala informado pelo psicologo: {consultationSettings.onlineSessionLink}
                  </p>
                ) : null}

                {consultationSettings?.consultationDurationMinutes ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Duracao prevista: {consultationSettings.consultationDurationMinutes} min
                    {typeof consultationSettings.consultationPrice === "number"
                      ? ` · Valor: R$ ${consultationSettings.consultationPrice.toFixed(2).replace(".", ",")}`
                      : ""}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Observacao opcional</label>
                <textarea
                  rows={4}
                  value={requestNotes}
                  onChange={(event) => setRequestNotes(event.target.value)}
                  placeholder="Se quiser, conte algo importante sobre sua disponibilidade ou preferencia."
                  className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !isRequestDayActive || !requestTime}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Enviando..." : "Enviar solicitacao"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRequestOpen(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedAppointment ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
          onClick={() => setSelectedAppointment(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 animate-scale-in"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-foreground">Detalhes do agendamento</h2>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                className="rounded-lg p-1 hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              {(() => {
                const canRespondToScheduleChange = canPatientRespondToScheduleChange(selectedAppointment);
                const responseVariant = getScheduleChangeResponseVariant(selectedAppointment);

                return (
                  <>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">Profissional</span>
                <span className="text-right text-sm font-medium text-foreground">
                  {selectedAppointment.psychologistName}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">Data</span>
                <span className="text-right text-sm font-medium text-foreground">
                  {formatDateTime(selectedAppointment.dateTime).date}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">Horario</span>
                <span className="text-right text-sm font-medium text-foreground">
                  {formatDateTime(selectedAppointment.dateTime).time}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">Status</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    statusColors[normalizeStatus(selectedAppointment.status)] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {statusLabels[normalizeStatus(selectedAppointment.status)] ||
                    selectedAppointment.status ||
                    "Atualizada"}
                </span>
              </div>
              {selectedAppointment.sessionType ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Modalidade</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {getConsultationModalityLabel(selectedAppointment.sessionType)}
                  </span>
                </div>
              ) : null}
              {typeof selectedAppointment.consultationPrice === "number" ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Valor da consulta</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {formatCurrency(selectedAppointment.consultationPrice)}
                  </span>
                </div>
              ) : null}
              {getPaymentStatusLabel(selectedAppointment) ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Pagamento</span>
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                    {getPaymentStatusLabel(selectedAppointment)}
                  </span>
                </div>
              ) : null}
              {canRespondToScheduleChange && shouldShowOriginalRequestedDate(selectedAppointment) ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    {responseVariant === "reagendamento" ? "Horario anterior" : "Horario solicitado"}
                  </span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {formatDateTime(selectedAppointment.requestedDateTimeOriginal).date} as{" "}
                    {formatDateTime(selectedAppointment.requestedDateTimeOriginal).time}
                  </span>
                </div>
              ) : null}
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Observacao
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {selectedAppointment.notes || "Nenhuma observacao registrada para este agendamento."}
                </p>
              </div>
              {normalizeStatus(selectedAppointment.status) === "contraproposta" ? (
                <div className="rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
                  O psicologo sugeriu esse novo horario. Voce pode aceitar para confirmar a consulta ou recusar para encerrar esta solicitacao.
                </div>
              ) : null}
              {normalizeStatus(selectedAppointment.status) === "reagendada" && canRespondToScheduleChange ? (
                <div className="rounded-xl border border-info/20 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
                  O psicologo registrou um reagendamento para este novo horario. Voce pode confirmar para manter a consulta reagendada ou recusar para encerrar esta solicitacao.
                </div>
              ) : null}
              {selectedAppointment.status.trim().toLowerCase() === "recusada" ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
                  Essa solicitacao foi recusada pelo psicologo e nao ocupa mais um horario confirmado da sua agenda.
                </div>
              ) : null}
              {canPayAppointment(selectedAppointment) ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                  Esta consulta possui uma cobranca aguardando pagamento. Voce pode abrir o link de pagamento em uma nova aba.
                </div>
              ) : null}
                   </>
                 );
               })()}
             </div>

            {canPatientRespondToScheduleChange(selectedAppointment) ? (
              <div className="mt-6 space-y-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleRespondToCounterproposal("aceitar")}
                    disabled={isAcceptingCounterproposal || isRefusingCounterproposal}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isAcceptingCounterproposal
                      ? "Confirmando..."
                      : getScheduleChangeResponseVariant(selectedAppointment) === "reagendamento"
                        ? "Confirmar reagendamento"
                        : "Aceitar contraproposta"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRespondToCounterproposal("recusar")}
                    disabled={isAcceptingCounterproposal || isRefusingCounterproposal}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isRefusingCounterproposal
                      ? "Recusando..."
                      : getScheduleChangeResponseVariant(selectedAppointment) === "reagendamento"
                        ? "Recusar reagendamento"
                        : "Recusar contraproposta"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                  disabled={isAcceptingCounterproposal || isRefusingCounterproposal}
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {canPayAppointment(selectedAppointment) ? (
                  <a
                    href={selectedAppointment.paymentUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl py-2.5 text-center text-sm font-semibold gradient-primary text-primary-foreground"
                  >
                    Pagar consulta
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedAppointment(null)}
                  className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
