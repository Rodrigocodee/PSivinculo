import { AppLayout } from "@/components/layout/AppLayout";
import {
  getProfessionalPreviewActionProps,
} from "@/components/psychologist/ProfessionalPreview";
import { toast } from "@/components/ui/sonner";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { useCurrentPsychologistPaymentSettings } from "@/hooks/use-current-psychologist-payment-settings";
import {
  atualizarConsulta,
  cadastrarConsulta,
  responderSolicitacaoConsulta,
  type ConsultationPaymentResult,
} from "@/services/consultas";
import { listarPacientes } from "@/services/pacientes";
import {
  getPsychologistAgendaData,
  type PsychologistConsultationPaymentStatus,
  type PsychologistConsultationRecord,
} from "@/services/psychologistFinancialData";
import {
  getConsultationModalityLabel,
  normalizeAppointmentModality,
  type AppointmentModality,
} from "@/services/psychologistConsultationSettings";
import { isPsychologistReceivablesEnabled } from "@/services/psychologistPaymentSettings";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import {
  buildAgendaHourRows,
  buildAvailableTimeSlots,
  getCurrentPsychologistAvailability,
  getDefaultWorkingHours,
  getNextActiveDate,
  getScheduleDayByDate,
  type PsychologistAvailabilitySettings,
} from "@/services/psychologistAvailability";
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

const paymentStatusLabels: Record<string, string> = {
  nao_gerado: "Nao gerado",
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
  erro: "Erro",
};

type ConsultationPaymentStatus = PsychologistConsultationPaymentStatus;

const appointmentFinancialStatusPresentation: Record<
  ConsultationPaymentStatus,
  {
    label: string;
    badgeClassName: string;
    dotClassName: string;
    accentClassName: string;
  }
> = {
  pago: {
    label: "Pago",
    badgeClassName: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
    accentClassName: "border-l-emerald-400",
  },
  aguardando_pagamento: {
    label: "Pagamento pendente",
    badgeClassName: "border border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
    accentClassName: "border-l-amber-400",
  },
  vencido: {
    label: "Pagamento vencido",
    badgeClassName: "border border-rose-200 bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
    accentClassName: "border-l-rose-400",
  },
  cancelado: {
    label: "Pagamento cancelado",
    badgeClassName: "border border-slate-200 bg-slate-100 text-slate-600",
    dotClassName: "bg-slate-400",
    accentClassName: "border-l-slate-300",
  },
  erro: {
    label: "Erro no pagamento",
    badgeClassName: "border border-red-200 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
    accentClassName: "border-l-red-400",
  },
  nao_gerado: {
    label: "Sem cobranca",
    badgeClassName: "border border-slate-200 bg-slate-50 text-slate-600",
    dotClassName: "bg-slate-400",
    accentClassName: "border-l-slate-300",
  },
};

const agendaFinancialLegend: ConsultationPaymentStatus[] = [
  "pago",
  "aguardando_pagamento",
  "vencido",
  "nao_gerado",
];

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
  consultationValue: number | null;
  paymentStatus: ConsultationPaymentStatus;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
};

type PacienteOption = {
  id: string;
  nome: string;
};

type ConsultationPaymentFeedback = {
  patientName: string;
  payment: ConsultationPaymentResult;
};

const initialAppointmentForm = {
  paciente_id: "",
  data: "",
  hora: "08:00",
  status: "confirmed" as keyof typeof statusLabels,
  observacoes: "",
  chargeMode: "none" as "none" | "site",
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

function getAppointmentRoom(
  status: keyof typeof statusLabels,
  modality: AppointmentModality | null,
  presentialLocation?: string | null,
) {
  if (modality === "presencial" && presentialLocation?.trim()) {
    return presentialLocation.trim();
  }
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

function getStartOfWeek(referenceDate: Date) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getEndOfWeek(referenceDate: Date) {
  const end = getStartOfWeek(referenceDate);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function formatWeekRangeLabel(referenceDate: Date) {
  const start = getStartOfWeek(referenceDate);
  const end = getEndOfWeek(referenceDate);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  });
  const endLabel = end.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });

  return `${startLabel} a ${endLabel}`;
}

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getStartOfMonth(referenceDate: Date) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0);
}

function getEndOfMonth(referenceDate: Date) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatDaySectionLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
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

function formatCurrency(value: number | null) {
  if (value === null) return "Valor nao informado";

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function mapConsultaToForm(consulta: ConsultaDoDia) {
  return {
    paciente_id: consulta.patientId,
    data: consulta.date,
    hora: consulta.time,
    status: consulta.status,
    observacoes: consulta.notes,
    chargeMode: "none" as const,
  };
}

function parseDateKey(value: string | null) {
  if (!value) return null;
  const parsedDate = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getConsultationPaymentLink(payment: ConsultationPaymentResult) {
  return payment.invoiceUrl || payment.bankSlipUrl || "";
}

function getAppointmentPaymentLink(
  appointment: Pick<ConsultaDoDia, "invoiceUrl" | "bankSlipUrl">,
) {
  return appointment.invoiceUrl || appointment.bankSlipUrl || "";
}

function getConsultationPaymentTitle(payment: ConsultationPaymentResult) {
  if (payment.paymentMode === "external") {
    return "Consulta confirmada";
  }

  if (!payment.success) {
    return "Consulta confirmada, mas a cobranca falhou";
  }

  if (payment.reusedExisting) {
    return "Cobranca ja vinculada";
  }

  return "Cobranca gerada com sucesso";
}

function getConsultationPaymentDescription(payment: ConsultationPaymentResult) {
  if (payment.paymentMode === "external") {
    return (
      payment.message || "Pagamento combinado diretamente entre paciente e psicologo."
    );
  }

  if (!payment.success) {
    return (
      payment.message ||
      "A consulta foi confirmada, mas a cobranca nao foi gerada automaticamente."
    );
  }

  if (payment.reusedExisting) {
    return payment.message || "Esta consulta ja possuia uma cobranca vinculada.";
  }

  return payment.message || "A cobranca foi criada e ja pode ser compartilhada com o paciente.";
}

export default function PsychologistAgenda() {
  const { data: profile } = useCurrentPsychologistProfile();
  const { data: paymentSettings } = useCurrentPsychologistPaymentSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [selectedDate, setSelectedDate] = useState(() => parseDateKey(searchParams.get("data")) ?? new Date());
  const [appointments, setAppointments] = useState<ConsultaDoDia[]>([]);
  const [availabilitySettings, setAvailabilitySettings] = useState<PsychologistAvailabilitySettings | null>(null);
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
  const [paymentFeedback, setPaymentFeedback] = useState<ConsultationPaymentFeedback | null>(null);
  const [appointmentForm, setAppointmentForm] = useState(initialAppointmentForm);
  const [selectedApt, setSelectedApt] = useState<ConsultaDoDia | null>(null);
  const [editingApt, setEditingApt] = useState<ConsultaDoDia | null>(null);
  const psychologistName = profile?.fullName?.trim() || "Profissional";
  const canChargeThroughSite = isPsychologistReceivablesEnabled(paymentSettings);
  const agendaSchedule = useMemo(
    () => availabilitySettings?.schedule ?? getDefaultWorkingHours(),
    [availabilitySettings?.schedule],
  );
  const consultationDurationMinutes =
    availabilitySettings?.consultationDurationMinutes ?? 50;

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const visibleAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status !== "refused"),
    [appointments],
  );
  const requestedAppointments = useMemo(
    () => visibleAppointments.filter((appointment) => appointment.status === "requested"),
    [visibleAppointments],
  );
  const requestedConsultaId = searchParams.get("consultaId")?.trim() || "";
  const requestedDateKey = searchParams.get("data")?.trim() || "";
  const selectedScheduleDay = useMemo(
    () => getScheduleDayByDate(agendaSchedule, selectedDateKey),
    [agendaSchedule, selectedDateKey],
  );
  const appointmentAvailabilityItems = useMemo(
    () =>
      visibleAppointments.map((appointment) => ({
        id: appointment.id,
        dateTime: buildDateTimeInputValue(appointment.date, appointment.time),
        durationMinutes: appointment.duration,
        status: reverseStatusMap[appointment.status],
      })),
    [visibleAppointments],
  );
  const appointmentTimeOptions = useMemo(
    () =>
      buildAvailableTimeSlots({
        dateKey: appointmentForm.data,
        schedule: agendaSchedule,
        consultationDurationMinutes,
        existingAppointments: appointmentAvailabilityItems,
        ignoreAppointmentId: editingApt?.id || null,
        includeTime: editingApt?.time || null,
      }),
    [
      agendaSchedule,
      appointmentAvailabilityItems,
      appointmentForm.data,
      consultationDurationMinutes,
      editingApt?.id,
      editingApt?.time,
    ],
  );
  const counterProposalTimeOptions = useMemo(
    () =>
      buildAvailableTimeSlots({
        dateKey: counterProposalForm.data,
        schedule: agendaSchedule,
        consultationDurationMinutes,
        existingAppointments: appointmentAvailabilityItems,
        ignoreAppointmentId: selectedApt?.id || null,
        includeTime: counterProposalForm.hora || null,
      }),
    [
      agendaSchedule,
      appointmentAvailabilityItems,
      consultationDurationMinutes,
      counterProposalForm.data,
      counterProposalForm.hora,
      selectedApt?.id,
    ],
  );
  const dayHourRows = useMemo(
    () =>
      buildAgendaHourRows({
        dateKey: selectedDateKey,
        schedule: agendaSchedule,
        appointmentTimes: visibleAppointments
          .filter((appointment) => appointment.date === selectedDateKey)
          .map((appointment) => appointment.time),
      }),
    [agendaSchedule, selectedDateKey, visibleAppointments],
  );

  function mapConsultaFromService(
    consulta: PsychologistConsultationRecord,
  ): ConsultaDoDia {
    const normalizedStatus = statusMap[consulta.consultationStatus] ?? "pending";

    return {
      id: consulta.id,
      patientId: consulta.patientId,
      patientName: consulta.patientName,
      date: consulta.consultationDateKey,
      time: consulta.consultationTimeLabel,
      requestedDateTimeOriginal: consulta.requestedDateTimeOriginal,
      respondedAt: consulta.respondedAt,
      duration: consulta.durationMinutes,
      status: normalizedStatus,
      modality: consulta.modality,
      type: getAppointmentType(normalizedStatus, consulta.modality),
      room: consulta.roomLabel,
      notes: consulta.notes,
      consultationValue: consulta.consultationValue,
      paymentStatus: consulta.paymentStatus,
      invoiceUrl: consulta.invoiceUrl,
      bankSlipUrl: consulta.bankSlipUrl,
    };
  }

  async function carregarConsultas() {
    setIsLoading(true);

    try {
      const [data, availability] = await Promise.all([
        getPsychologistAgendaData({
          mode: view,
          referenceDate: selectedDateKey,
        }),
        getCurrentPsychologistAvailability(),
      ]);
      setAppointments(data.consultations.map(mapConsultaFromService));
      setAvailabilitySettings(availability);
    } catch (error) {
      console.error("Erro ao carregar consultas:", error);
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void carregarConsultas();
  }, [selectedDateKey, view]);

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

  useEffect(() => {
    if (!isCreateOpen && !isEditOpen) return;

    if (!appointmentTimeOptions.includes(appointmentForm.hora)) {
      setAppointmentForm((current) => ({
        ...current,
        hora: appointmentTimeOptions[0] || "",
      }));
    }
  }, [appointmentForm.hora, appointmentTimeOptions, isCreateOpen, isEditOpen]);

  useEffect(() => {
    if (!selectedApt || !isCounterProposalOpen) return;

    if (!counterProposalTimeOptions.includes(counterProposalForm.hora)) {
      setCounterProposalForm((current) => ({
        ...current,
        hora: counterProposalTimeOptions[0] || "",
      }));
    }
  }, [
    counterProposalForm.hora,
    counterProposalTimeOptions,
    isCounterProposalOpen,
    selectedApt,
  ]);

  const selectedPeriodLabel = useMemo(() => {
    if (view === "week") return formatWeekRangeLabel(selectedDate);
    if (view === "month") return formatMonthLabel(selectedDate);
    return formatDisplayDate(selectedDate);
  }, [selectedDate, view]);

  const weekSections = useMemo(() => {
    const weekStart = getStartOfWeek(selectedDate);

    return Array.from({ length: 7 }, (_, index) => {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + index);
      const dateKey = formatDateKey(currentDate);
      const scheduleDay = getScheduleDayByDate(agendaSchedule, dateKey);

      return {
        dateKey,
        label: formatDaySectionLabel(dateKey),
        isWorkingDay: scheduleDay?.enabled ?? false,
        appointments: visibleAppointments
          .filter((appointment) => appointment.date === dateKey)
          .sort((left, right) => left.time.localeCompare(right.time)),
      };
    });
  }, [agendaSchedule, selectedDate, visibleAppointments]);

  const monthSections = useMemo(() => {
    const monthStart = getStartOfMonth(selectedDate);
    const monthEnd = getEndOfMonth(selectedDate);

    return Array.from({ length: monthEnd.getDate() }, (_, index) => {
      const currentDate = new Date(monthStart);
      currentDate.setDate(index + 1);
      const dateKey = formatDateKey(currentDate);
      const scheduleDay = getScheduleDayByDate(agendaSchedule, dateKey);
      const grouped = visibleAppointments
        .filter((appointment) => appointment.date === dateKey)
        .sort((left, right) => left.time.localeCompare(right.time));

      return {
        dateKey,
        label: formatDaySectionLabel(dateKey),
        isWorkingDay: scheduleDay?.enabled ?? false,
        appointments: grouped,
      };
    });
  }, [agendaSchedule, selectedDate, visibleAppointments]);

  function goToPreviousPeriod() {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (view === "month") {
        const currentDay = next.getDate();
        next.setDate(1);
        next.setMonth(current.getMonth() - 1);
        const lastDayOfTargetMonth = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0,
        ).getDate();
        next.setDate(Math.min(currentDay, lastDayOfTargetMonth));
      } else if (view === "week") {
        next.setDate(current.getDate() - 7);
      } else {
        next.setDate(current.getDate() - 1);
      }
      return next;
    });
  }

  function goToNextPeriod() {
    setSelectedDate((current) => {
      const next = new Date(current);
      if (view === "month") {
        const currentDay = next.getDate();
        next.setDate(1);
        next.setMonth(current.getMonth() + 1);
        const lastDayOfTargetMonth = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0,
        ).getDate();
        next.setDate(Math.min(currentDay, lastDayOfTargetMonth));
      } else if (view === "week") {
        next.setDate(current.getDate() + 7);
      } else {
        next.setDate(current.getDate() + 1);
      }
      return next;
    });
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

  function openAppointmentDetails(appointment: ConsultaDoDia) {
    setIsCreateOpen(false);
    setIsEditOpen(false);
    setSelectedApt(appointment);
  }

  function renderAppointmentCard(
    appointment: ConsultaDoDia,
    options?: { compact?: boolean },
  ) {
    const compact = options?.compact ?? false;
    const paymentPresentation =
      appointmentFinancialStatusPresentation[appointment.paymentStatus];
    const paymentLink = getAppointmentPaymentLink(appointment);
    const canManagePendingCharge =
      appointment.paymentStatus === "aguardando_pagamento" && Boolean(paymentLink);

    return (
      <div
        className={`rounded-2xl border border-border/80 border-l-4 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${paymentPresentation.accentClassName}`}
      >
        <button
          type="button"
          onClick={() => openAppointmentDetails(appointment)}
          className="w-full text-left"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground">
                {appointment.patientName}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {appointment.type}
              </p>
            </div>
            <div className="rounded-xl bg-primary/5 px-3 py-2 text-right shadow-sm ring-1 ring-primary/10">
              <p className="text-lg font-semibold leading-none text-foreground">
                {appointment.time}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {appointment.duration} min
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>
              {appointment.modality
                ? getConsultationModalityLabel(appointment.modality)
                : "Modalidade a definir"}
            </span>
            <span>{formatCurrency(appointment.consultationValue)}</span>
            <span>{appointment.room}</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[appointment.status]}`}
            >
              {statusLabels[appointment.status]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${paymentPresentation.badgeClassName}`}
            >
              {paymentPresentation.label}
            </span>
          </div>
        </button>

        {canManagePendingCharge ? (
          <div
            className={`mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3 ${compact ? "sm:justify-start" : ""}`}
          >
            <button
              type="button"
              onClick={() => void copyPaymentLink(paymentLink)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Copiar link
            </button>
            <button
              type="button"
              onClick={() => openPaymentLink(paymentLink)}
              className="rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/80"
            >
              Abrir cobranca
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function openCreateModal() {
    setIsEditOpen(false);
    setEditingApt(null);
    setSelectedApt(null);
    const referenceDate = new Date(`${selectedDateKey}T12:00:00`);
    const nextActiveDate = getNextActiveDate(
      agendaSchedule,
      Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate,
    );
    const nextDateKey = formatDateKey(nextActiveDate);
    const nextTimeOptions = buildAvailableTimeSlots({
      dateKey: nextDateKey,
      schedule: agendaSchedule,
      consultationDurationMinutes,
      existingAppointments: appointmentAvailabilityItems,
    });
    setAppointmentForm({
      ...initialAppointmentForm,
      data: nextDateKey,
      hora: nextTimeOptions[0] || "",
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

  async function copyPaymentLink(value: string) {
    if (!value) {
      toast.error("O link de pagamento nao esta disponivel.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "absolute";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      toast.success("Link de pagamento copiado com sucesso.");
    } catch {
      toast.error("Nao foi possivel copiar o link de pagamento.");
    }
  }

  function openPaymentLink(value: string) {
    if (!value || typeof window === "undefined") {
      toast.error("O link de pagamento nao esta disponivel.");
      return;
    }

    window.open(value, "_blank", "noopener,noreferrer");
  }

  function handleConsultationPaymentFeedback(
    patientName: string,
    payment: ConsultationPaymentResult | null,
    fallbackSuccessMessage: string,
  ) {
    if (!payment) {
      toast.success(fallbackSuccessMessage);
      return;
    }

    if (payment.paymentMode === "asaas_split" && !payment.success) {
      toast.error("Consulta confirmada, mas a cobranca nao foi gerada.");
    } else if (payment.paymentMode === "asaas_split" && payment.reusedExisting) {
      toast.success("Consulta confirmada. A cobranca ja estava vinculada.");
    } else if (payment.paymentMode === "asaas_split") {
      toast.success("Consulta confirmada e cobranca gerada com sucesso.");
    } else {
      toast.success(fallbackSuccessMessage);
    }

    setPaymentFeedback({
      patientName,
      payment,
    });
  }

  async function handleCreateAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!appointmentForm.paciente_id) {
      toast.error("Selecione um paciente.");
      return;
    }

    if (!appointmentForm.data || !appointmentForm.hora) {
      toast.error("Este horario esta fora da sua disponibilidade configurada.");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await cadastrarConsulta({
        paciente_id: appointmentForm.paciente_id,
        data_consulta: `${appointmentForm.data}T${appointmentForm.hora}:00`,
        status: "confirmada",
        observacoes: appointmentForm.observacoes.trim() || null,
        chargeMode: canChargeThroughSite && appointmentForm.chargeMode === "site" ? "site" : "none",
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
            duration: created[0].duracao_consulta_min ?? consultationDurationMinutes,
            status: "confirmed",
            modality: null,
            type: getAppointmentType("confirmed", null),
            room: getAppointmentRoom("confirmed", null),
            notes: appointmentForm.observacoes.trim(),
            consultationValue:
              typeof created[0].valor_consulta === "number" ? created[0].valor_consulta : null,
            paymentStatus:
              (typeof created[0].status_pagamento === "string"
                ? created[0].status_pagamento
                : "nao_gerado") as ConsultationPaymentStatus,
            invoiceUrl:
              typeof created[0].asaas_invoice_url === "string" ? created[0].asaas_invoice_url : null,
            bankSlipUrl:
              typeof created[0].asaas_bank_slip_url === "string" ? created[0].asaas_bank_slip_url : null,
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

    if (!appointmentForm.data || !appointmentForm.hora) {
      toast.error("Este horario esta fora da sua disponibilidade configurada.");
      return;
    }

    setIsSubmitting(true);

    try {
      const patientName = editingApt.patientName;
      const result = await atualizarConsulta(editingApt.id, {
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

      setIsEditOpen(false);
      setEditingApt(null);
      await carregarConsultas();
      handleConsultationPaymentFeedback(
        patientName,
        result.payment,
        "Consulta atualizada com sucesso.",
      );
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
      const patientName = selectedApt.patientName;
      const result = await responderSolicitacaoConsulta({
        consultaId: selectedApt.id,
        acao: "confirmar",
      });

      closeDetailsModal();
      await carregarConsultas();
      handleConsultationPaymentFeedback(
        patientName,
        result.payment,
        "Solicitacao confirmada com sucesso.",
      );
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
      toast.error("Este horario esta fora da sua disponibilidade configurada.");
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
              description: PREVIEW_FEATURE_LOCK_MESSAGE,
            })}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold gradient-primary text-primary-foreground transition-all hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo Agendamento
          </button>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <button onClick={goToPreviousPeriod} className="rounded-lg p-2 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="font-heading font-semibold capitalize text-foreground">{selectedPeriodLabel}</h2>
            <button onClick={goToNextPeriod} className="rounded-lg p-2 hover:bg-muted">
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

        <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Legenda financeira</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A agenda destaca rapidamente as consultas pagas, pendentes e sem cobranca gerada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {agendaFinancialLegend.map((statusKey) => {
                const presentation = appointmentFinancialStatusPresentation[statusKey];
                return (
                  <span
                    key={statusKey}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${presentation.dotClassName}`} />
                    {presentation.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">Carregando consultas...</div>
          ) : view === "day" ? (
            !selectedScheduleDay?.enabled ? (
              <div className="space-y-4 px-4 py-8">
                <div className="rounded-2xl border border-border bg-muted/40 px-5 py-4 text-center text-sm text-muted-foreground">
                  Dia sem atendimento configurado
                </div>
                {visibleAppointments
                  .filter((appointment) => appointment.date === selectedDateKey)
                  .sort((left, right) => left.time.localeCompare(right.time))
                  .map((appointment) => (
                    <div key={appointment.id}>
                      {renderAppointmentCard(appointment)}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dayHourRows.map((hour) => {
                  const hourPrefix = `${hour.slice(0, 2)}:`;
                  const hourAppointments = visibleAppointments.filter(
                    (appointment) =>
                      appointment.date === selectedDateKey &&
                      appointment.time.startsWith(hourPrefix),
                  );

                  return (
                    <div key={hour} className="flex min-h-[96px]">
                      <div className="flex w-20 flex-shrink-0 items-start justify-center border-r border-border bg-muted/30 p-3 text-sm font-medium text-muted-foreground">
                        {hour}
                      </div>
                      <div className="flex-1 p-2">
                        {hourAppointments.length > 0 ? (
                          <div className="space-y-2">
                            {hourAppointments.map((appointment) => (
                              <div key={appointment.id}>
                                {renderAppointmentCard(appointment)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-full items-center rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                            Horario livre
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : view === "week" ? (
            <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
              {weekSections.map((section) => (
                <div key={section.dateKey} className="rounded-2xl border border-border bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <p className="text-sm font-semibold capitalize text-foreground">
                        {section.label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {section.appointments.length} consulta
                        {section.appointments.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {section.dateKey.slice(8, 10)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {!section.isWorkingDay && section.appointments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                        Folga
                      </div>
                    ) : section.appointments.length > 0 ? (
                      <>
                        {!section.isWorkingDay ? (
                          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                            Folga
                          </div>
                        ) : null}
                        {section.appointments.map((appointment) => (
                          <div key={appointment.id}>
                            {renderAppointmentCard(appointment, { compact: true })}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                        Sem consultas neste dia.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {monthSections.length > 0 ? (
                monthSections.map((section) => (
                  <div key={section.dateKey} className="rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <p className="text-sm font-semibold capitalize text-foreground">
                          {section.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {section.appointments.length} consulta
                          {section.appointments.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {section.dateKey.slice(8, 10)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {!section.isWorkingDay && section.appointments.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                          Folga
                        </div>
                      ) : section.appointments.length > 0 ? (
                        <>
                          {!section.isWorkingDay ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                              Folga
                            </div>
                          ) : null}
                          {section.appointments.map((appointment) => (
                            <div key={appointment.id}>
                              {renderAppointmentCard(appointment, { compact: true })}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                          Sem consultas neste dia.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-sm text-muted-foreground">
                  Nenhuma consulta encontrada no mes selecionado.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Status da consulta
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`h-3 w-3 rounded-full ${statusColors[key].split(" ")[0]}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {requestedAppointments.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Solicitacoes de Horario</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pedidos recebidos para {selectedPeriodLabel}.</p>
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
                  onClick={() => openAppointmentDetails(appointment)}
                  className="flex w-full items-start justify-between gap-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-left transition-all hover:shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{appointment.patientName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(`${appointment.date}T00:00:00`).toLocaleDateString("pt-BR")} as {appointment.time}
                      {appointment.modality ? ` - ${getConsultationModalityLabel(appointment.modality)}` : ""}
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
                description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                    disabled={!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled || appointmentTimeOptions.length === 0}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">
                      {!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled
                        ? "Dia sem atendimento configurado"
                        : appointmentTimeOptions.length === 0
                          ? "Sem horarios disponiveis"
                          : "Selecione um horario"}
                    </option>
                    {appointmentTimeOptions.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                </div>
              </div>

              {!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled ? (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Dia sem atendimento configurado.
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                <div className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm font-medium text-foreground">
                  Confirmada
                </div>
              </div>

              {canChargeThroughSite ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Cobranca</label>
                  <select
                    value={appointmentForm.chargeMode}
                    onChange={(e) =>
                      setAppointmentForm((current) => ({
                        ...current,
                        chargeMode: e.target.value === "site" ? "site" : "none",
                      }))
                    }
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="none">Sem cobranca pelo site</option>
                    <option value="site">Cobrar pelo site</option>
                  </select>
                </div>
              ) : null}

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
                <button type="submit" disabled={isSubmitting || !appointmentForm.hora} className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70">
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
                description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                    disabled={!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled || appointmentTimeOptions.length === 0}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  >
                    <option value="">
                      {!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled
                        ? "Dia sem atendimento configurado"
                        : appointmentTimeOptions.length === 0
                          ? "Sem horarios disponiveis"
                          : "Selecione um horario"}
                    </option>
                    {appointmentTimeOptions.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                </div>
              </div>

              {!getScheduleDayByDate(agendaSchedule, appointmentForm.data)?.enabled ? (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Dia sem atendimento configurado.
                </div>
              ) : null}

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
                <button type="submit" disabled={isSubmitting || !appointmentForm.hora} className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70">
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
                ["Valor", formatCurrency(selectedApt.consultationValue)],
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
                <span className="text-sm text-muted-foreground">Status da consulta</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[selectedApt.status]}`}>
                  {statusLabels[selectedApt.status]}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Status financeiro</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${appointmentFinancialStatusPresentation[selectedApt.paymentStatus].badgeClassName}`}
                >
                  {appointmentFinancialStatusPresentation[selectedApt.paymentStatus].label}
                </span>
              </div>
            </div>

            {selectedApt.paymentStatus === "aguardando_pagamento" &&
            getAppointmentPaymentLink(selectedApt) ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-foreground">Cobranca pendente</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compartilhe ou abra o link para acompanhar o pagamento desta consulta.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void copyPaymentLink(getAppointmentPaymentLink(selectedApt))}
                    className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() => openPaymentLink(getAppointmentPaymentLink(selectedApt))}
                    className="rounded-xl py-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Abrir cobranca
                  </button>
                </div>
              </div>
            ) : null}

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
                        <select
                          value={counterProposalForm.hora}
                          onChange={(e) => setCounterProposalForm((current) => ({ ...current, hora: e.target.value }))}
                          disabled={!getScheduleDayByDate(agendaSchedule, counterProposalForm.data)?.enabled || counterProposalTimeOptions.length === 0}
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                        >
                          <option value="">
                            {!getScheduleDayByDate(agendaSchedule, counterProposalForm.data)?.enabled
                              ? "Dia sem atendimento configurado"
                              : counterProposalTimeOptions.length === 0
                                ? "Sem horarios disponiveis"
                                : "Selecione um horario"}
                          </option>
                          {counterProposalTimeOptions.map((hour) => (
                            <option key={hour} value={hour}>{hour}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {!getScheduleDayByDate(agendaSchedule, counterProposalForm.data)?.enabled ? (
                      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        Dia sem atendimento configurado.
                      </div>
                    ) : null}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleSuggestOtherTime}
                        disabled={isSuggestingOtherTime || !counterProposalForm.hora}
                        {...getProfessionalPreviewActionProps({
                          description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                      description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                    description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                      description: PREVIEW_FEATURE_LOCK_MESSAGE,
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
                    description: PREVIEW_FEATURE_LOCK_MESSAGE,
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

      {paymentFeedback ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
          onClick={() => setPaymentFeedback(null)}
        >
          <div
            className="w-full max-w-md animate-scale-in rounded-2xl border border-border bg-card p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {getConsultationPaymentTitle(paymentFeedback.payment)}
              </h2>
              <button
                type="button"
                onClick={() => setPaymentFeedback(null)}
                className="rounded-lg p-1 hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Paciente: {paymentFeedback.patientName}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {getConsultationPaymentDescription(paymentFeedback.payment)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Modo de pagamento</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {paymentFeedback.payment.paymentMode === "asaas_split"
                      ? "Psivinculo com Asaas Split"
                      : "Pagamento externo"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Status do pagamento</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {paymentStatusLabels[paymentFeedback.payment.paymentStatus || ""] ||
                      paymentFeedback.payment.paymentStatus ||
                      "Nao informado"}
                  </span>
                </div>
                {paymentFeedback.payment.asaasPaymentId ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Cobranca Asaas</span>
                    <span className="text-right text-sm font-medium text-foreground">
                      {paymentFeedback.payment.asaasPaymentId}
                    </span>
                  </div>
                ) : null}
              </div>

              {getConsultationPaymentLink(paymentFeedback.payment) ? (
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <p className="mb-2 text-sm font-medium text-foreground">Link de pagamento</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {getConsultationPaymentLink(paymentFeedback.payment)}
                  </p>
                </div>
              ) : null}

              {getConsultationPaymentLink(paymentFeedback.payment) ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => openPaymentLink(getConsultationPaymentLink(paymentFeedback.payment))}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold gradient-primary text-primary-foreground"
                  >
                    Abrir link
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyPaymentLink(getConsultationPaymentLink(paymentFeedback.payment))}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                  >
                    Copiar link
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setPaymentFeedback(null)}
                className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
