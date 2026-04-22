import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentPsychologistProfile, currentPsychologistProfileQueryKey } from "@/hooks/use-current-psychologist-profile";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import {
  assertCurrentPsychologistPhoneAvailable,
  getCrpDigits,
  getCurrentPsychologistContext,
  uploadCurrentPsychologistAvatar,
} from "@/services/currentPsychologist";
import { useLocation } from "react-router-dom";

type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  crp: string;
  specialty: string;
};

type ScheduleDayKey = "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado" | "domingo";

type ScheduleDay = {
  key: ScheduleDayKey;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
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

const FALLBACK_ID = "anonymous-psychologist";
const FALLBACK_NAME = "Profissional";
const FALLBACK_EMAIL = "";
const FALLBACK_CRP = "";
const INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all";

const defaultProfile: ProfileForm = {
  fullName: FALLBACK_NAME,
  email: FALLBACK_EMAIL,
  phone: "",
  crp: "",
  specialty: "",
};

const defaultSchedule: ScheduleDay[] = [
  { key: "segunda", label: "Segunda", enabled: true, start: "08:00", end: "18:00" },
  { key: "terca", label: "Terca", enabled: true, start: "08:00", end: "18:00" },
  { key: "quarta", label: "Quarta", enabled: true, start: "08:00", end: "18:00" },
  { key: "quinta", label: "Quinta", enabled: true, start: "08:00", end: "18:00" },
  { key: "sexta", label: "Sexta", enabled: true, start: "08:00", end: "18:00" },
  { key: "sabado", label: "Sabado", enabled: false, start: "08:00", end: "12:00" },
  { key: "domingo", label: "Domingo", enabled: false, start: "08:00", end: "12:00" },
];

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

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
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

function parseSchedule(value: unknown): ScheduleDay[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      if (
        typeof raw.key !== "string" ||
        typeof raw.label !== "string" ||
        typeof raw.enabled !== "boolean" ||
        typeof raw.start !== "string" ||
        typeof raw.end !== "string"
      ) {
        return null;
      }
      return raw as unknown as ScheduleDay;
    })
    .filter(Boolean) as ScheduleDay[];

  return parsed.length ? parsed : null;
}

function mergeSchedule(value?: ScheduleDay[] | null) {
  const override = value || [];
  const map = new Map(override.map((item) => [item.key, item]));
  return defaultSchedule.map((item) => map.get(item.key) || item);
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
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileSectionRef = useRef<HTMLDivElement | null>(null);
  const { data: sharedProfile } = useCurrentPsychologistProfile();
  const [profile, setProfile] = useState(defaultProfile);
  const [schedule, setSchedule] = useState(defaultSchedule);
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

  const resolvedName = profile.fullName || sharedProfile?.fullName || FALLBACK_NAME;
  const initials = useMemo(() => getInitials(resolvedName), [resolvedName]);
  const avatarUrl = sharedProfile?.avatarUrl || null;

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setIsLoading(true);
      try {
        const context = await getCurrentPsychologistContext();
        const user = context.user;
        const record = context.usuariosRecord || context.record;
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
        crp: getCrpDigits(pickString(metadata, ["crp"]) || pickString(row, ["crp", "registro"]) || local?.profile?.crp || defaultProfile.crp),
        specialty: pickString(metadata, ["specialty", "especialidade"]) || pickString(row, ["especialidade", "specialty"]) || local?.profile?.specialty || defaultProfile.specialty,
      };

      const rowSettings = pickObject(row, ["configuracoes", "settings", "preferences"]);
      const metadataSchedule = parseSchedule(metadata.working_hours);
      const rowSchedule = parseSchedule(row?.working_hours) || parseSchedule(row?.horarios_atendimento) || parseSchedule(rowSettings?.working_hours);
      const metadataNotifications = pickObject(metadata, ["notification_preferences", "notifications"]);
      const rowNotifications = pickObject(row, ["notification_preferences", "notifications", "notificacoes"]) || pickObject(rowSettings, ["notification_preferences", "notifications"]);

      setProfile(profileFromData);
      setSchedule(mergeSchedule(metadataSchedule || rowSchedule || local?.schedule || null));
      setNotifications({
        appointmentReminder:
          typeof metadataNotifications?.appointmentReminder === "boolean"
            ? metadataNotifications.appointmentReminder
            : typeof rowNotifications?.appointmentReminder === "boolean"
              ? rowNotifications.appointmentReminder
              : local?.notifications?.appointmentReminder ?? defaultNotifications.appointmentReminder,
        patientConfirmation:
          typeof metadataNotifications?.patientConfirmation === "boolean"
            ? metadataNotifications.patientConfirmation
            : typeof rowNotifications?.patientConfirmation === "boolean"
              ? rowNotifications.patientConfirmation
              : local?.notifications?.patientConfirmation ?? defaultNotifications.patientConfirmation,
        payments:
          typeof metadataNotifications?.payments === "boolean"
            ? metadataNotifications.payments
            : typeof rowNotifications?.payments === "boolean"
              ? rowNotifications.payments
              : local?.notifications?.payments ?? defaultNotifications.payments,
        weeklyReports:
          typeof metadataNotifications?.weeklyReports === "boolean"
            ? metadataNotifications.weeklyReports
            : typeof rowNotifications?.weeklyReports === "boolean"
              ? rowNotifications.weeklyReports
              : local?.notifications?.weeklyReports ?? defaultNotifications.weeklyReports,
      });
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
      [field]: field === "phone" ? formatPhone(value) : value,
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

    if ("nome" in row) payload.nome = nextProfile.fullName;
    if ("name" in row) payload.name = nextProfile.fullName;
    if ("full_name" in row) payload.full_name = nextProfile.fullName;
    if ("email" in row) payload.email = nextProfile.email;
    if ("telefone" in row) payload.telefone = normalizePhone(nextProfile.phone) || null;
    if ("phone" in row) payload.phone = normalizePhone(nextProfile.phone) || null;
    if ("celular" in row) payload.celular = normalizePhone(nextProfile.phone) || null;
    if ("especialidade" in row) payload.especialidade = nextProfile.specialty || null;
    if ("specialty" in row) payload.specialty = nextProfile.specialty || null;
    if ("working_hours" in row) payload.working_hours = schedule;
    if ("horarios_atendimento" in row) payload.horarios_atendimento = schedule;
    if ("notification_preferences" in row) payload.notification_preferences = notifications;
    if ("notifications" in row) payload.notifications = notifications;
    if ("notificacoes" in row) payload.notificacoes = notifications;

    if ("configuracoes" in row) {
      const currentSettings = pickObject(row, ["configuracoes"]) || {};
      payload.configuracoes = {
        ...currentSettings,
        working_hours: schedule,
        notification_preferences: notifications,
      };
    }

    if ("settings" in row) {
      const currentSettings = pickObject(row, ["settings"]) || {};
      payload.settings = {
        ...currentSettings,
        working_hours: schedule,
        notification_preferences: notifications,
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
    const nextProfile: ProfileForm = {
      fullName: profile.fullName.trim(),
      email: profile.email.trim(),
      phone: formatPhone(profile.phone),
      crp: profile.crp.trim(),
      specialty: profile.specialty.trim(),
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

    const timeErrors = validateSchedule(schedule);
    setScheduleErrors(timeErrors);
    if (Object.keys(timeErrors).length > 0) {
      toast.error("Corrija os horarios de atendimento antes de salvar.");
      return;
    }

    setIsSaving(true);

    try {
      let emailChanged = false;

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
            crp: nextProfile.crp,
            specialty: nextProfile.specialty,
            especialidade: nextProfile.specialty,
            working_hours: schedule,
            notification_preferences: notifications,
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

      toast.success(
        emailChanged
          ? "Perfil salvo. Confira seu e-mail para confirmar a alteracao do endereco."
          : "Perfil salvo com sucesso.",
      );
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

        <div id="perfil" ref={profileSectionRef} className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-heading font-semibold text-foreground">Perfil</h2>
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

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">CRP</label>
              <input
                type="text"
                value={profile.crp}
                readOnly
                aria-readonly="true"
                className="w-full cursor-not-allowed rounded-xl border border-input bg-muted/50 px-4 py-3 text-sm text-muted-foreground outline-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">Registro profissional mantido como somente leitura.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Especialidade</label>
              <input
                type="text"
                value={profile.specialty}
                onChange={(event) => updateProfile("specialty", event.target.value)}
                className={INPUT_CLASS}
                placeholder="Ex.: TCC"
              />
            </div>
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
                label: "Confirmacao de paciente",
                desc: "Notificar quando o paciente confirmar a consulta.",
              },
              {
                key: "payments" as const,
                label: "Pagamentos",
                desc: "Avisar sobre pagamentos recebidos ou pendentes.",
              },
              {
                key: "weeklyReports" as const,
                label: "Relatorios semanais",
                desc: "Receber um resumo semanal por e-mail.",
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={notifications[item.key]}
                  onCheckedChange={(checked) => updateNotification(item.key, checked)}
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
            className="inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Salvando..." : "Salvar Perfil"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
