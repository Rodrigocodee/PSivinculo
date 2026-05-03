import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Camera, CheckCircle, CreditCard, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { PsychologistSpecialtySelect } from "@/components/psychologist/PsychologistSpecialtySelect";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentPsychologistProfile, currentPsychologistProfileQueryKey } from "@/hooks/use-current-psychologist-profile";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatCPF } from "@/lib/formatters";
import {
  getDefaultWorkingHours,
  mergeWorkingHoursSchedule,
  serializeWorkingHoursSchedule,
  timeToMinutes,
  type ScheduleDay,
  type ScheduleDayKey,
} from "@/services/psychologistAvailability";
import {
  assertCurrentPsychologistPhoneAvailable,
  CRP_VALIDATION_MESSAGE,
  getCrpDigits,
  getCurrentPsychologistContext,
  isValidCrp,
  uploadCurrentPsychologistAvatar,
} from "@/services/currentPsychologist";
import {
  cancelPsychologistSubscription,
  fetchPsychologistSubscription,
  psychologistSubscriptionQueryKey,
} from "@/services/psychologistSubscription";
import {
  getCurrentPsychologistProfessionalProfileCompletion,
  hasPsychologistProfileCpfField,
} from "@/services/psychologistProfessionalProfile";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import { Link, useLocation } from "react-router-dom";

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  cpf: string;
  crp: string;
  specialty: string;
  clinicName: string;
};

type NotificationsForm = {
  appointmentReminder: boolean;
  patientConfirmation: boolean;
  payments: boolean;
  weeklyReports: boolean;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type VisibilityState = {
  currentPassword: boolean;
  newPassword: boolean;
  confirmPassword: boolean;
};

type ResolvedProfileRecord = {
  table: string;
  row: Record<string, unknown>;
  matchColumn: string;
  matchValue: string;
};

type PersistedSettings = {
  profile?: Partial<ProfileForm>;
  schedule?: ScheduleDay[];
  notifications?: Partial<NotificationsForm>;
};

type NotificationPreferencesPayload = {
  appointment_reminder: boolean;
  patient_confirmation: boolean;
  payments: boolean;
  weekly_reports: boolean;
};

const FALLBACK_ID = "anonymous-psychologist";
const FALLBACK_NAME = "Profissional";
const FALLBACK_EMAIL = "";
const FALLBACK_CRP = "";
const USUARIOS_PROFILE_SELECT = "*";
const INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all";

const defaultProfile: ProfileForm = {
  fullName: FALLBACK_NAME,
  email: FALLBACK_EMAIL,
  phone: "",
  cpf: "",
  crp: "",
  specialty: "",
  clinicName: "",
};

const defaultNotifications: NotificationsForm = {
  appointmentReminder: true,
  patientConfirmation: true,
  payments: true,
  weeklyReports: false,
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function storageKey(userId?: string | null) {
  return `mindflow:psychologist-settings:${userId || FALLBACK_ID}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CR";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function loadLocalSettings(userId?: string | null): PersistedSettings | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSettings;
  } catch {
    return null;
  }
}

function saveLocalSettings(userId: string | null | undefined, data: PersistedSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(data));
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickObject(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return null;
}

function pickBoolean(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function toNotificationPreferencesPayload(form: NotificationsForm): NotificationPreferencesPayload {
  return {
    appointment_reminder: form.appointmentReminder,
    patient_confirmation: form.patientConfirmation,
    payments: form.payments,
    weekly_reports: false,
  };
}

function normalizeNotificationPreferences(source: Record<string, unknown> | null | undefined): NotificationsForm | null {
  if (!source) return null;

  const appointmentReminder = pickBoolean(source, ["appointment_reminder", "appointmentReminder"]);
  const patientConfirmation = pickBoolean(source, ["patient_confirmation", "patientConfirmation"]);
  const payments = pickBoolean(source, ["payments"]);
  const weeklyReports = pickBoolean(source, ["weekly_reports", "weeklyReports"]);

  if (
    appointmentReminder === null &&
    patientConfirmation === null &&
    payments === null &&
    weeklyReports === null
  ) {
    return null;
  }

  return {
    appointmentReminder: appointmentReminder ?? defaultNotifications.appointmentReminder,
    patientConfirmation: patientConfirmation ?? defaultNotifications.patientConfirmation,
    payments: payments ?? defaultNotifications.payments,
    weeklyReports: false,
  };
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Nao informado";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao informado";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Nao informado";

  return date.toLocaleDateString("pt-BR");
}

function formatSubscriptionStatus(value: string | null | undefined, active: boolean) {
  if (active) return "Ativa";

  const normalizedValue = (value || "").trim().toUpperCase();
  if (!normalizedValue) return "Nao informado";

  const labels: Record<string, string> = {
    ACTIVE: "Ativa",
    PENDING: "Pendente",
    OVERDUE: "Vencida",
    CANCELLED: "Cancelada",
    INACTIVE: "Inativa",
    DELETED: "Cancelada",
    EXPIRED: "Expirada",
  };

  return labels[normalizedValue] || normalizedValue;
}

async function loadCurrentUsuariosProfileRecord(
  user: User | null,
  fallbackRecord: ResolvedProfileRecord | null,
): Promise<ResolvedProfileRecord | null> {
  if (!user) return fallbackRecord;

  for (const candidate of [
    { column: "auth_id", value: user.id },
    { column: "id", value: user.id },
  ]) {
    const { data, error } = await supabase
      .from("usuarios")
      .select(USUARIOS_PROFILE_SELECT)
      .eq(candidate.column, candidate.value)
      .limit(1)
      .maybeSingle();

    if (error || !data) continue;

    const row = data as Record<string, unknown>;
    const authId = pickString(row, ["auth_id"]);
    const rowId = pickString(row, ["id"]);

    return {
      table: "usuarios",
      row,
      matchColumn: authId ? "auth_id" : "id",
      matchValue: authId || rowId || candidate.value,
    };
  }

  return fallbackRecord;
}

function validateSchedule(schedule: ScheduleDay[]) {
  const errors: Record<string, string> = {};
  schedule.forEach((day) => {
    if (!day.enabled) return;
    const start = timeToMinutes(day.start);
    const end = timeToMinutes(day.end);
    if (start == null || end == null) {
      errors[day.key] = "Informe um horario valido.";
      return;
    }
    if (start >= end) {
      errors[day.key] = "O horario final deve ser maior que o inicial.";
    }
  });
  return errors;
}

export default function PsychologistSettings() {
  const location = useLocation();
  const { appUser } = useAuth();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isPostPaymentProfileFlow = searchParams.get("origem") === "pagamento";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileSectionRef = useRef<HTMLDivElement | null>(null);
  const { data: sharedProfile } = useCurrentPsychologistProfile();
  const [profile, setProfile] = useState(defaultProfile);
  const [schedule, setSchedule] = useState(getDefaultWorkingHours());
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [visibility, setVisibility] = useState<VisibilityState>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [resolvedUser, setResolvedUser] = useState<User | null>(null);
  const [resolvedRecord, setResolvedRecord] = useState<ResolvedProfileRecord | null>(null);
  const [usingFallbackStorage, setUsingFallbackStorage] = useState(false);
  const [isCancelSubscriptionDialogOpen, setIsCancelSubscriptionDialogOpen] = useState(false);
  const [postPaymentProfileCompleted, setPostPaymentProfileCompleted] = useState(false);
  const {
    data: subscriptionData,
    error: subscriptionError,
    isFetching: isSubscriptionFetching,
    isLoading: isSubscriptionLoading,
  } = useQuery({
    queryKey: psychologistSubscriptionQueryKey,
    queryFn: fetchPsychologistSubscription,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const cancelSubscriptionMutation = useMutation({
    mutationFn: () => cancelPsychologistSubscription(subscriptionData?.currentPlan.subscriptionId),
    onSuccess: async (result) => {
      setIsCancelSubscriptionDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: psychologistSubscriptionQueryKey });

      if (result.cancellationMode === "end_of_cycle") {
        toast.success(
          `Renovacao cancelada. O acesso segue ate ${formatDate(result.accessUntil)}.`,
        );
      } else {
        toast.success("Assinatura cancelada com sucesso.");
      }

      if (result.warning) {
        toast.warning(result.warning);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Nao foi possivel cancelar a assinatura agora.";
      toast.error(message);
    },
  });

  const resolvedName = profile.fullName || sharedProfile?.fullName || FALLBACK_NAME;
  const initials = useMemo(() => getInitials(resolvedName), [resolvedName]);
  const avatarUrl = sharedProfile?.avatarUrl || null;
  const currentSubscriptionPlan = subscriptionData?.currentPlan || null;
  const subscriptionConflict = subscriptionData?.conflict || null;
  const hasSubscription = Boolean(subscriptionData?.hasSubscription && currentSubscriptionPlan);
  const canCancelSubscription = Boolean(
    !subscriptionConflict &&
      subscriptionData?.canCancel &&
      currentSubscriptionPlan?.subscriptionId,
  );
  const hasProfileCpfField = hasPsychologistProfileCpfField(resolvedRecord?.row || null);
  const hasClinicNameField = Boolean(
    resolvedRecord?.row &&
      ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"].some(
        (key) => key in resolvedRecord.row,
      ),
  );

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const context = await getCurrentPsychologistContext();
        const user = context.user;
        const record = await loadCurrentUsuariosProfileRecord(user, context.usuariosRecord || context.record);
        const local = loadLocalSettings(user?.id);
        if (!active) return;
        setResolvedUser(user);
        setResolvedRecord(record);
        hydrateForms(user, record, local);
      } catch (error) {
        console.error("[Psivinculo][settings][load_error]", error);
        if (!active) return;
        hydrateForms(null, null, loadLocalSettings(null));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    function hydrateForms(user: User | null, record: ResolvedProfileRecord | null, local: PersistedSettings | null) {
      const metadata = (user?.user_metadata || {}) as Record<string, unknown>;
      const row = record?.row || null;
      const profileFromData: ProfileForm = {
        fullName: pickString(metadata, ["full_name", "name"]) || pickString(row, ["nome", "name"]) || local?.profile?.fullName || defaultProfile.fullName,
        email: user?.email || pickString(row, ["email"]) || local?.profile?.email || defaultProfile.email,
        phone: formatPhone(pickString(metadata, ["phone", "telefone"]) || pickString(row, ["telefone", "phone"]) || local?.profile?.phone || ""),
        cpf: formatCPF(pickString(metadata, ["cpf"]) || pickString(row, ["cpf"]) || local?.profile?.cpf || ""),
        crp: getCrpDigits(pickString(metadata, ["crp"]) || pickString(row, ["crp", "registro"]) || local?.profile?.crp || defaultProfile.crp),
        specialty: pickString(metadata, ["specialty", "especialidade"]) || pickString(row, ["especialidade", "specialty"]) || local?.profile?.specialty || defaultProfile.specialty,
        clinicName: pickString(metadata, ["clinic_name", "clinicName", "nome_clinica", "nome_consultorio", "consultorio"]) || pickString(row, ["nome_clinica", "clinic_name", "clinicName", "nome_consultorio", "consultorio"]) || local?.profile?.clinicName || defaultProfile.clinicName,
      };

      const rowSettings = pickObject(row, ["configuracoes", "settings", "preferences"]);
      const metadataNotifications = pickObject(metadata, ["notification_preferences", "notifications"]);
      const rowNotifications = pickObject(row, ["notification_preferences"]);
      const legacyNotifications = normalizeNotificationPreferences(metadataNotifications) ||
        normalizeNotificationPreferences(pickObject(rowSettings, ["notification_preferences", "notifications"])) ||
        (local?.notifications ? { ...defaultNotifications, ...local.notifications } : null);

      setProfile(profileFromData);
      setSchedule(
        mergeWorkingHoursSchedule(
          metadata.working_hours ||
            row?.working_hours ||
            row?.horarios_atendimento ||
            rowSettings?.working_hours ||
            local?.schedule ||
            null,
        ),
      );
      setNotifications(normalizeNotificationPreferences(rowNotifications) || legacyNotifications || defaultNotifications);
      setUsingFallbackStorage(!user && !record);
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.hash !== "#perfil") return;

    const frame = window.requestAnimationFrame(() => {
      profileSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, isLoading]);
  function updateProfile(field: keyof ProfileForm, value: string) {
    setProfile((current) => ({
      ...current,
      [field]: field === "phone" ? formatPhone(value) : field === "cpf" ? formatCPF(value) : value,
    }));
  }

  function updateSchedule(dayKey: ScheduleDayKey, changes: Partial<ScheduleDay>) {
    setSchedule((current) => current.map((day) => (day.key === dayKey ? { ...day, ...changes } : day)));
    setScheduleErrors((current) => {
      if (!current[dayKey]) return current;
      const next = { ...current };
      delete next[dayKey];
      return next;
    });
  }

  function updateNotification(field: keyof NotificationsForm, value: boolean) {
    setNotifications((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updatePassword(field: keyof PasswordForm, value: string) {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleVisibility(field: keyof VisibilityState) {
    setVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  function hasPasswordChanges() {
    return Boolean(passwordForm.currentPassword || passwordForm.newPassword || passwordForm.confirmPassword);
  }

  async function persistRecord(nextProfile: ProfileForm) {
    if (!resolvedRecord) return;

    const row = resolvedRecord.row;
    const payload: Record<string, unknown> = {};
    const serializedSchedule = serializeWorkingHoursSchedule(schedule);

    if ("nome" in row) payload.nome = nextProfile.fullName;
    if ("name" in row) payload.name = nextProfile.fullName;
    if ("full_name" in row) payload.full_name = nextProfile.fullName;
    if ("email" in row) payload.email = nextProfile.email;
    if ("telefone" in row) payload.telefone = normalizePhone(nextProfile.phone) || null;
    if ("phone" in row) payload.phone = normalizePhone(nextProfile.phone) || null;
    if ("celular" in row) payload.celular = normalizePhone(nextProfile.phone) || null;
    if ("cpf" in row) payload.cpf = normalizeCpf(nextProfile.cpf) || null;
    if ("crp" in row) payload.crp = getCrpDigits(nextProfile.crp) || null;
    if ("registro" in row) payload.registro = getCrpDigits(nextProfile.crp) || null;
    if ("especialidade" in row) payload.especialidade = nextProfile.specialty || null;
    if ("specialty" in row) payload.specialty = nextProfile.specialty || null;
    if ("nome_clinica" in row) payload.nome_clinica = nextProfile.clinicName || null;
    if ("clinic_name" in row) payload.clinic_name = nextProfile.clinicName || null;
    if ("clinicName" in row) payload.clinicName = nextProfile.clinicName || null;
    if ("nome_consultorio" in row) payload.nome_consultorio = nextProfile.clinicName || null;
    if ("consultorio" in row) payload.consultorio = nextProfile.clinicName || null;
    if (isPostPaymentProfileFlow && "profile_setup_completed" in row) {
      payload.profile_setup_completed = true;
    }
    if (isPostPaymentProfileFlow && "onboarding_completed" in row) {
      payload.onboarding_completed = true;
    }
    if ("working_hours" in row || resolvedRecord.table === "usuarios") {
      payload.working_hours = serializedSchedule;
    }
    if ("horarios_atendimento" in row) payload.horarios_atendimento = serializedSchedule;
    if (resolvedRecord.table === "usuarios") {
      payload.notification_preferences = toNotificationPreferencesPayload(notifications);
    }

    if ("configuracoes" in row) {
      const currentSettings = pickObject(row, ["configuracoes"]) || {};
      payload.configuracoes = {
        ...currentSettings,
        working_hours: serializedSchedule,
      };
    }

    if ("settings" in row) {
      const currentSettings = pickObject(row, ["settings"]) || {};
      payload.settings = {
        ...currentSettings,
        working_hours: serializedSchedule,
      };
    }

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase
      .from(resolvedRecord.table)
      .update(payload)
      .eq(resolvedRecord.matchColumn, resolvedRecord.matchValue);

    if (error) throw error;
  }

  async function savePassword() {
    if (!hasPasswordChanges()) return;

    if (!passwordForm.currentPassword.trim()) throw new Error("Informe a senha atual.");
    if (!passwordForm.newPassword.trim()) throw new Error("Informe a nova senha.");
    if (passwordForm.newPassword.length < 8) throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
    if (passwordForm.newPassword === passwordForm.currentPassword) throw new Error("A nova senha precisa ser diferente da atual.");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) throw new Error("A confirmacao da senha nao confere.");
    if (!resolvedUser?.email) throw new Error("Nao foi possivel validar a senha sem uma sessao autenticada.");

    const reauth = await supabase.auth.signInWithPassword({
      email: resolvedUser.email,
      password: passwordForm.currentPassword,
    });

    if (reauth.error) throw new Error("A senha atual esta incorreta.");

    const update = await supabase.auth.updateUser({ password: passwordForm.newPassword });
    if (update.error) throw update.error;

    setPasswordForm(emptyPasswordForm);
  }

  function handleAvatarButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem valido.");
      return;
    }

    setIsUploadingAvatar(true);

    try {
      await uploadCurrentPsychologistAvatar(file);
      await queryClient.invalidateQueries({ queryKey: currentPsychologistProfileQueryKey });
      toast.success("Foto de perfil atualizada com sucesso.");
    } catch (error) {
      console.error("[Psivinculo][settings][avatar_upload_error]", error);
      const message = error instanceof Error ? error.message : "Nao foi possivel atualizar a foto de perfil.";
      toast.error(message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleSave() {
    if (!isPostPaymentProfileFlow && appUser?.role === "psychologist" && appUser.hasProfessionalAccess === false) {
      toast.error(PREVIEW_FEATURE_LOCK_MESSAGE);
      return;
    }

    const nextProfile: ProfileForm = {
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      phone: formatPhone(profile.phone),
      cpf: formatCPF(profile.cpf),
      crp: profile.crp.trim(),
      specialty: profile.specialty.trim(),
      clinicName: profile.clinicName.trim(),
    };

    if (!nextProfile.fullName) {
      toast.error("Informe seu nome completo.");
      return;
    }

    if (!nextProfile.email || !isValidEmail(nextProfile.email)) {
      toast.error("Informe um e-mail valido.");
      return;
    }

    const normalizedPhoneValue = normalizePhone(nextProfile.phone);
    if (!normalizedPhoneValue || ![10, 11].includes(normalizedPhoneValue.length)) {
      toast.error("Informe um telefone valido com DDD.");
      return;
    }

    if (isPostPaymentProfileFlow) {
      if (hasProfileCpfField && normalizeCpf(nextProfile.cpf).length !== 11) {
        toast.error("Informe um CPF valido.");
        return;
      }

      if (!nextProfile.crp) {
        toast.error("Informe seu CRP.");
        return;
      }

      if (!isValidCrp(nextProfile.crp)) {
        toast.error(CRP_VALIDATION_MESSAGE);
        return;
      }

      if (!nextProfile.specialty) {
        toast.error("Informe sua especialidade.");
        return;
      }
    }

    const timeErrors = validateSchedule(schedule);
    setScheduleErrors(timeErrors);
    if (Object.keys(timeErrors).length > 0) {
      toast.error("Corrija os horarios de atendimento antes de salvar.");
      return;
    }

    setIsSaving(true);

    try {
      let emailChanged = false;
      const serializedSchedule = serializeWorkingHoursSchedule(schedule);

      await assertCurrentPsychologistPhoneAvailable(normalizedPhoneValue);

      if (hasPasswordChanges()) {
        await savePassword();
      }

      if (resolvedUser) {
        const payload: { data: Record<string, unknown>; email?: string } = {
          data: {
            ...(resolvedUser.user_metadata || {}),
            full_name: nextProfile.fullName,
            name: nextProfile.fullName,
            phone: normalizePhone(nextProfile.phone),
            telefone: normalizePhone(nextProfile.phone),
            ...(hasProfileCpfField ? { cpf: normalizeCpf(nextProfile.cpf) } : {}),
            crp: nextProfile.crp,
            specialty: nextProfile.specialty,
            especialidade: nextProfile.specialty,
            clinic_name: nextProfile.clinicName || null,
            clinicName: nextProfile.clinicName || null,
            nome_clinica: nextProfile.clinicName || null,
            ...(isPostPaymentProfileFlow
              ? { profile_setup_completed: true, onboarding_completed: true }
              : {}),
            working_hours: serializedSchedule,
            notification_preferences: toNotificationPreferencesPayload(notifications),
          },
        };

        if (nextProfile.email !== resolvedUser.email) {
          payload.email = nextProfile.email;
          emailChanged = true;
        }

        const authUpdate = await supabase.auth.updateUser(payload);
        if (authUpdate.error) throw authUpdate.error;
      }

      await persistRecord(nextProfile);

      saveLocalSettings(resolvedUser?.id, {
        profile: nextProfile,
        schedule,
        notifications,
      });

      setProfile(nextProfile);
      setUsingFallbackStorage(!resolvedUser && !resolvedRecord);
      await queryClient.invalidateQueries({ queryKey: currentPsychologistProfileQueryKey });

      if (isPostPaymentProfileFlow) {
        const completion = await getCurrentPsychologistProfessionalProfileCompletion();
        if (completion.isComplete) {
          setPostPaymentProfileCompleted(true);
          toast.success("Perfil profissional completo. Voce ja pode ir para o Dashboard.");
        } else {
          toast.error("Ainda faltam dados do perfil profissional.");
        }
      } else {
        toast.success(
          emailChanged
            ? "Perfil salvo. Confira seu e-mail para confirmar a alteracao do endereco."
            : "Perfil salvo com sucesso.",
        );
      }
    } catch (error) {
      console.error("[Psivinculo][settings][save_error]", error);
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar as configuracoes.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout role="psychologist" userName={FALLBACK_NAME}>
        <div className="max-w-3xl space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Meu Perfil</h1>
            <p className="mt-1 text-muted-foreground">Carregando seus dados profissionais...</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dados do perfil.
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="psychologist" userName={resolvedName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus dados pessoais, profissionais e horarios de atendimento.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Nome, e-mail, telefone, especialidade e foto podem ser atualizados aqui. O CRP permanece somente leitura.
          </p>
          {usingFallbackStorage ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Sem sessao autenticada ativa. Quando nao houver origem remota disponivel, esta tela salva localmente para manter a experiencia funcional.
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading font-semibold text-foreground">Financeiro</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure se os recebimentos online ficarao ativos no Psivinculo e ajuste o split do Asaas.
              </p>
            </div>
            <Link
              to="/psi/configuracoes/financeiro"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
            >
              Abrir financeiro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-heading font-semibold text-foreground">Assinatura</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Consulte o plano do Psivinculo vinculado ao seu usuario profissional.
              </p>
            </div>
            {isSubscriptionFetching ? (
              <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atualizando
              </span>
            ) : null}
          </div>

          {isSubscriptionLoading ? (
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando assinatura.
            </div>
          ) : subscriptionError ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {subscriptionError instanceof Error
                ? subscriptionError.message
                : "Nao foi possivel carregar a assinatura agora."}
            </div>
          ) : subscriptionConflict ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="font-medium">Mais de uma assinatura ativa encontrada.</p>
                <p className="mt-1">
                  Foram encontradas {subscriptionConflict.activeCount} assinaturas ativas para o seu usuario. O cancelamento automatico foi bloqueado para evitar cancelar a recorrencia errada.
                </p>
              </div>

              <div className="space-y-2">
                {subscriptionConflict.subscriptions.map((subscription) => (
                  <div key={subscription.subscriptionId || subscription.createdAt || subscription.planSlug || "assinatura"} className="rounded-lg bg-muted/50 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {subscription.planSlug || "Plano nao identificado"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {subscription.status || "Status nao informado"}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ID Asaas: {subscription.subscriptionId || "Nao informado"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Valor: {formatCurrency(subscription.monthlyPrice)} · Proxima cobranca: {formatDate(subscription.nextDueDate)} · Origem: {subscription.paymentMethod || "Nao informado"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : hasSubscription && currentSubscriptionPlan ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { label: "Plano atual", value: currentSubscriptionPlan.name || "Nao informado" },
                  {
                    label: "Status",
                    value: formatSubscriptionStatus(
                      currentSubscriptionPlan.status,
                      currentSubscriptionPlan.subscriptionActive,
                    ),
                  },
                  { label: "Valor", value: formatCurrency(currentSubscriptionPlan.monthlyPrice) },
                  { label: "Proxima cobranca", value: formatDate(currentSubscriptionPlan.nextDueDate) },
                  { label: "Data de inicio", value: formatDate(currentSubscriptionPlan.startedAt) },
                  { label: "Origem de pagamento", value: currentSubscriptionPlan.paymentMethod || "Nao informado" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {!currentSubscriptionPlan.subscriptionActive ? (
                  <Link
                    to="/psi/planos"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
                  >
                    Ver planos
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={() => setIsCancelSubscriptionDialogOpen(true)}
                  disabled={!canCancelSubscription || cancelSubscriptionMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-semibold text-destructive transition-all hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelSubscriptionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {currentSubscriptionPlan.status === "CANCELLED" ? "Assinatura cancelada" : "Cancelar assinatura"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Sem assinatura ativa vinculada ao seu usuario profissional.</span>
              <Link
                to="/psi/planos"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
              >
                Ver planos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>

        <div
          id="perfil"
          ref={profileSectionRef}
          className={cn(
            "rounded-xl border border-border bg-card p-6",
            isPostPaymentProfileFlow && !postPaymentProfileCompleted
              ? "border-primary/40 ring-2 ring-primary/15"
              : "",
          )}
        >
          <h2 className="font-heading font-semibold text-foreground">Perfil</h2>
          {isPostPaymentProfileFlow && !postPaymentProfileCompleted ? (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-foreground">Complete seu perfil profissional</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Preencha telefone, CPF, CRP e especialidade para finalizar sua configuracao.
              </p>
            </div>
          ) : null}
          {postPaymentProfileCompleted ? (
            <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Perfil profissional completo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sua configuracao profissional foi finalizada.
                  </p>
                  <Link
                    to="/psi/dashboard"
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted"
                  >
                    Ir para Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
          <div className="mb-6 mt-4 flex items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl gradient-primary text-2xl font-bold text-primary-foreground">
              {avatarUrl ? (
                <img src={avatarUrl} alt={resolvedName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
              <button
                type="button"
                onClick={handleAvatarButtonClick}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card"
                aria-label="Adicionar foto de perfil"
                title="Adicionar foto de perfil"
              >
                {isUploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{resolvedName}</p>
              <p className="text-sm text-muted-foreground">
                {profile.crp || FALLBACK_CRP}
                {profile.specialty ? ` - ${profile.specialty}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">Atualize seus dados de contato e sua apresentacao profissional.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nome completo</label>
              <input
                type="text"
                value={profile.fullName}
                onChange={(event) => updateProfile("fullName", event.target.value)}
                className={INPUT_CLASS}
                placeholder="Seu nome completo"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">E-mail</label>
              <input
                type="email"
                value={profile.email}
                onChange={(event) => updateProfile("email", event.target.value)}
                className={INPUT_CLASS}
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Telefone</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(event) => updateProfile("phone", event.target.value)}
                className={INPUT_CLASS}
                placeholder="(00) 00000-0000"
              />
            </div>

            {hasProfileCpfField ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">CPF</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={profile.cpf}
                  onChange={(event) => updateProfile("cpf", event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="000.000.000-00"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">CRP</label>
              {isPostPaymentProfileFlow ? (
                <input
                  type="text"
                  inputMode="numeric"
                  value={profile.crp}
                  onChange={(event) => updateProfile("crp", getCrpDigits(event.target.value))}
                  className={INPUT_CLASS}
                  placeholder="000000"
                />
              ) : (
                <>
                  <input
                    type="text"
                    value={profile.crp}
                    readOnly
                    aria-readonly="true"
                    className="w-full cursor-not-allowed rounded-xl border border-input bg-muted/50 px-4 py-3 text-sm text-muted-foreground outline-none"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Registro profissional mantido como somente leitura.</p>
                </>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Especialidade</label>
              <PsychologistSpecialtySelect
                value={profile.specialty}
                onChange={(value) => updateProfile("specialty", value)}
                selectClassName={INPUT_CLASS}
                customInputClassName={INPUT_CLASS}
              />
            </div>

            {hasClinicNameField ? (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Nome da clinica</label>
                <input
                  type="text"
                  value={profile.clinicName}
                  onChange={(event) => updateProfile("clinicName", event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Nome da clinica, se possuir"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="font-heading font-semibold text-foreground">Horarios de Atendimento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ative cada dia individualmente e informe um intervalo valido sem mudar o visual da agenda.
            </p>
          </div>

          <div className="space-y-3">
            {schedule.map((day) => (
              <div key={day.key} className="rounded-lg bg-muted/50 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_88px_1fr_28px_1fr] md:items-center">
                  <div className="flex items-center justify-between gap-3 md:justify-start">
                    <span className="text-sm font-medium text-foreground">{day.label}</span>
                    <Switch
                      checked={day.enabled}
                      onCheckedChange={(checked) => updateSchedule(day.key, { enabled: checked })}
                      aria-label={`Ativar ${day.label}`}
                    />
                  </div>

                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {day.enabled ? "Ativo" : "Folga"}
                  </span>

                  <input
                    type="time"
                    value={day.start}
                    onChange={(event) => updateSchedule(day.key, { start: event.target.value })}
                    disabled={!day.enabled}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  <span className="hidden text-center text-muted-foreground md:block">as</span>

                  <input
                    type="time"
                    value={day.end}
                    onChange={(event) => updateSchedule(day.key, { end: event.target.value })}
                    disabled={!day.enabled}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {scheduleErrors[day.key] ? (
                  <p className="mt-2 text-xs text-destructive">{scheduleErrors[day.key]}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="font-heading font-semibold text-foreground">Seguranca da Conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Validamos senha atual, nova senha e confirmacao antes de atualizar.
            </p>
          </div>

          <div className="max-w-md space-y-4">
            {[
              { key: "currentPassword" as const, label: "Senha atual" },
              { key: "newPassword" as const, label: "Nova senha" },
              { key: "confirmPassword" as const, label: "Confirmar nova senha" },
            ].map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-foreground">{field.label}</label>
                <div className="relative">
                  <input
                    type={visibility[field.key] ? "text" : "password"}
                    value={passwordForm[field.key]}
                    onChange={(event) => updatePassword(field.key, event.target.value)}
                    className={`${INPUT_CLASS} pr-12`}
                    placeholder="********"
                    autoComplete={field.key === "currentPassword" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={visibility[field.key] ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {visibility[field.key] ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">A nova senha deve ter pelo menos 8 caracteres.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="font-heading font-semibold text-foreground">Notificacoes Profissionais</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Os toggles refletem o estado atual e sao salvos junto com o restante das configuracoes.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                key: "appointmentReminder" as const,
                label: "Lembrete de consulta",
                desc: "Receber notificacao antes do horario agendado.",
              },
              {
                key: "patientConfirmation" as const,
                label: "Solicitacoes de consulta",
                desc: "Avisar quando houver solicitacoes ou respostas de agendamento.",
              },
              {
                key: "payments" as const,
                label: "Pagamentos",
                desc: "Avisar quando pagamentos forem recebidos, pendentes ou vencidos.",
              },
              {
                key: "weeklyReports" as const,
                label: "Relatorios semanais",
                desc: "Em breve",
                disabled: true,
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={item.disabled ? false : notifications[item.key]}
                  onCheckedChange={(checked) => updateNotification(item.key, checked)}
                  disabled={item.disabled}
                  aria-label={item.label}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            {...getProfessionalPreviewActionProps({
              title: "Ative sua assinatura para salvar alteracoes profissionais.",
              description: PREVIEW_FEATURE_LOCK_MESSAGE,
            })}
            className="inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Salvando..." : "Salvar Perfil"}
          </button>
        </div>

        <AlertDialog
          open={isCancelSubscriptionDialogOpen}
          onOpenChange={setIsCancelSubscriptionDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja cancelar sua assinatura? Voce podera perder acesso aos recursos pagos ao final do periodo vigente.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelSubscriptionMutation.isPending}>
                Manter assinatura
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  cancelSubscriptionMutation.mutate();
                }}
                disabled={cancelSubscriptionMutation.isPending || !canCancelSubscription}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  "Confirmar cancelamento"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
