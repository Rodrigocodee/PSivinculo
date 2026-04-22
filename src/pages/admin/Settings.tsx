import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  FileText,
  Loader2,
  MessageSquare,
  Palette,
  Save,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { currentAdminClinicQueryKey } from "@/hooks/use-current-admin-clinic";
import {
  adminClinicSettingsQueryKey,
  fetchAdminClinicSettings,
  saveAdminClinicSettings,
  type AdminClinicSettingsData,
} from "@/services/adminSettings";

type SettingsFormState = {
  reminderNotification: boolean;
  bookingConfirmationNotification: boolean;
  cancellationNotification: boolean;
  weeklyReportNotification: boolean;
  confirmationMessageTemplate: string;
  reminderMessageTemplate: string;
  minimumCancellationHours: string;
  lateCancellationFeePercent: string;
  defaultSessionDurationMinutes: string;
};

const initialFormState: SettingsFormState = {
  reminderNotification: false,
  bookingConfirmationNotification: false,
  cancellationNotification: false,
  weeklyReportNotification: false,
  confirmationMessageTemplate: "",
  reminderMessageTemplate: "",
  minimumCancellationHours: "",
  lateCancellationFeePercent: "",
  defaultSessionDurationMinutes: "",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20";
const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`;
const DISABLED_INPUT_CLASS =
  "w-full cursor-not-allowed rounded-xl border border-input bg-muted/50 px-4 py-3 text-sm text-muted-foreground outline-none";

type SettingsToggleProps = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (nextValue: boolean) => void;
  label: string;
};

function SettingsToggle({
  checked,
  disabled = false,
  onCheckedChange,
  label,
}: SettingsToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`flex h-5 w-10 items-center rounded-full px-0.5 transition-all ${
        checked ? "bg-primary" : "bg-muted"
      } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
    >
      <div
        className={`h-4 w-4 rounded-full bg-card transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function SettingsLoadingState({ userName }: { userName: string }) {
  return (
    <AppLayout role="admin" userName={userName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted/70" />
        </div>

        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 h-6 w-44 animate-pulse rounded bg-muted" />
            <div className="space-y-4">
              {Array.from({ length: index === 1 ? 2 : 3 }).map((__, rowIndex) => (
                <div key={rowIndex} className="rounded-lg bg-muted/40 p-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted/70" />
                  <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted/50" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="h-11 w-52 animate-pulse rounded-xl bg-primary/20" />
      </div>
    </AppLayout>
  );
}

function buildNumericOptions(
  currentValue: string,
  baseOptions: number[],
  labelBuilder: (value: number) => string,
) {
  const options = [...baseOptions];
  const trimmedValue = currentValue.trim();

  if (trimmedValue) {
    const parsedValue = Number(trimmedValue.replace(",", "."));

    if (Number.isFinite(parsedValue) && !options.some((option) => option === parsedValue)) {
      options.unshift(parsedValue);
    }
  }

  return options.map((value) => ({
    value: String(value),
    label: labelBuilder(value),
  }));
}

function formatHourOption(value: number) {
  return `${value} ${value === 1 ? "hora" : "horas"} antes`;
}

function formatFeeOption(value: number) {
  if (value === 0) return "Sem cobranca";

  const formattedValue = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);

  return `${formattedValue}% do valor`;
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: adminClinicSettingsQueryKey,
    queryFn: fetchAdminClinicSettings,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [form, setForm] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;

    setForm({
      reminderNotification: data.notifications.reminderNotification,
      bookingConfirmationNotification: data.notifications.bookingConfirmationNotification,
      cancellationNotification: data.notifications.cancellationNotification,
      weeklyReportNotification: data.notifications.weeklyReportNotification,
      confirmationMessageTemplate: data.confirmationMessageTemplate,
      reminderMessageTemplate: data.reminderMessageTemplate,
      minimumCancellationHours:
        data.minimumCancellationHours != null ? String(data.minimumCancellationHours) : "",
      lateCancellationFeePercent:
        data.lateCancellationFeePercent != null ? String(data.lateCancellationFeePercent) : "",
      defaultSessionDurationMinutes:
        data.defaultSessionDurationMinutes != null
          ? String(data.defaultSessionDurationMinutes)
          : "",
    });
  }, [data]);

  const adminName = data?.adminName || "Administrador(a)";
  const canEditSettings = Boolean(data?.hasClinicScope && data?.hasClinicRecord);

  const cancellationHoursOptions = useMemo(
    () => buildNumericOptions(form.minimumCancellationHours, [12, 24, 48], formatHourOption),
    [form.minimumCancellationHours],
  );
  const cancellationFeeOptions = useMemo(
    () => buildNumericOptions(form.lateCancellationFeePercent, [0, 50, 100], formatFeeOption),
    [form.lateCancellationFeePercent],
  );

  if (isLoading) {
    return <SettingsLoadingState userName={adminName} />;
  }

  async function syncSettingsAfterSave(nextSettings: AdminClinicSettingsData) {
    queryClient.setQueryData(adminClinicSettingsQueryKey, nextSettings);
    await queryClient.invalidateQueries({ queryKey: currentAdminClinicQueryKey });
  }

  function updateField<K extends keyof SettingsFormState>(
    field: K,
    value: SettingsFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]:
        field === "minimumCancellationHours" ||
        field === "defaultSessionDurationMinutes"
          ? String(value).replace(/[^\d]/g, "").slice(0, 3)
          : value,
    }));
  }

  function getInputClassName(enabled: boolean, multiline = false) {
    if (!enabled) return DISABLED_INPUT_CLASS;
    return multiline ? TEXTAREA_CLASS : INPUT_CLASS;
  }

  function getFieldValue<K extends keyof SettingsFormState>(field: K, enabled: boolean) {
    return enabled ? form[field] : field.includes("Notification") ? false : "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditSettings) {
      toast.error("Nao foi possivel localizar a clinica vinculada a este admin.");
      return;
    }

    setIsSaving(true);

    try {
      const nextSettings = await saveAdminClinicSettings({
        notifications: {
          reminderNotification: form.reminderNotification,
          bookingConfirmationNotification: form.bookingConfirmationNotification,
          cancellationNotification: form.cancellationNotification,
          weeklyReportNotification: form.weeklyReportNotification,
        },
        confirmationMessageTemplate: form.confirmationMessageTemplate,
        reminderMessageTemplate: form.reminderMessageTemplate,
        minimumCancellationHours: form.minimumCancellationHours,
        lateCancellationFeePercent: form.lateCancellationFeePercent,
        defaultSessionDurationMinutes: form.defaultSessionDurationMinutes,
      });

      await syncSettingsAfterSave(nextSettings);
      toast.success("Configuracoes da clinica salvas com sucesso.");
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel salvar as configuracoes da clinica.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Configuracoes Gerais</h1>
          <p className="mt-1 text-muted-foreground">Preferencias e regras do sistema.</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar as configuracoes reais da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Associe uma clinica ao admin autenticado para carregar as configuracoes reais da
            clinica.
          </div>
        ) : null}

        {data?.hasClinicScope && !data.hasClinicRecord ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            A clinica vinculada foi identificada, mas nao foi encontrado um registro correspondente
            em `public.clinicas`.
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading font-semibold text-foreground">
              <Bell className="h-5 w-5 text-primary" />
              Notificacoes
            </h2>
            <div className="space-y-4">
              {[
                {
                  key: "reminderNotification" as const,
                  label: "Lembrete de consulta para paciente",
                  desc: "Controla o envio futuro de lembretes antes da consulta.",
                },
                {
                  key: "bookingConfirmationNotification" as const,
                  label: "Confirmacao de agendamento",
                  desc: "Controla a automacao futura de confirmacao de consultas.",
                },
                {
                  key: "cancellationNotification" as const,
                  label: "Notificacao de cancelamento",
                  desc: "Controla os avisos futuros quando a consulta for cancelada.",
                },
                {
                  key: "weeklyReportNotification" as const,
                  label: "Relatorio semanal",
                  desc: "Controla o envio futuro do resumo semanal da clinica.",
                },
              ].map((notification) => {
                const enabled =
                  canEditSettings && (data?.availableFields[notification.key] ?? false);

                return (
                  <div
                    key={notification.key}
                    className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {notification.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {notification.desc}
                      </p>
                    </div>
                    <SettingsToggle
                      checked={Boolean(form[notification.key])}
                      disabled={!enabled}
                      onCheckedChange={(checked) => updateField(notification.key, checked)}
                      label={notification.label}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading font-semibold text-foreground">
              <MessageSquare className="h-5 w-5 text-primary" />
              Mensagens Automaticas
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Mensagem de confirmacao
                </label>
                <textarea
                  rows={3}
                  value={String(
                    getFieldValue(
                      "confirmationMessageTemplate",
                      data?.availableFields.confirmationMessageTemplate ?? false,
                    ),
                  )}
                  onChange={(event) =>
                    updateField("confirmationMessageTemplate", event.target.value)
                  }
                  disabled={
                    !canEditSettings ||
                    !(data?.availableFields.confirmationMessageTemplate ?? false)
                  }
                  placeholder={
                    data?.availableFields.confirmationMessageTemplate
                      ? "Digite o template oficial de confirmacao da clinica."
                      : "Nao disponivel no schema atual"
                  }
                  className={getInputClassName(
                    canEditSettings &&
                      (data?.availableFields.confirmationMessageTemplate ?? false),
                    true,
                  )}
                />
                {data?.availableFields.confirmationMessageTemplate &&
                !form.confirmationMessageTemplate.trim() ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nenhum template salvo ainda.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Mensagem de lembrete
                </label>
                <textarea
                  rows={3}
                  value={String(
                    getFieldValue(
                      "reminderMessageTemplate",
                      data?.availableFields.reminderMessageTemplate ?? false,
                    ),
                  )}
                  onChange={(event) =>
                    updateField("reminderMessageTemplate", event.target.value)
                  }
                  disabled={
                    !canEditSettings ||
                    !(data?.availableFields.reminderMessageTemplate ?? false)
                  }
                  placeholder={
                    data?.availableFields.reminderMessageTemplate
                      ? "Digite o template oficial de lembrete da clinica."
                      : "Nao disponivel no schema atual"
                  }
                  className={getInputClassName(
                    canEditSettings &&
                      (data?.availableFields.reminderMessageTemplate ?? false),
                    true,
                  )}
                />
                {data?.availableFields.reminderMessageTemplate &&
                !form.reminderMessageTemplate.trim() ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nenhum template salvo ainda.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading font-semibold text-foreground">
              <FileText className="h-5 w-5 text-primary" />
              Regras de Cancelamento
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Prazo minimo para cancelamento
                </label>
                <select
                  value={String(
                    getFieldValue(
                      "minimumCancellationHours",
                      data?.availableFields.minimumCancellationHours ?? false,
                    ),
                  )}
                  onChange={(event) =>
                    updateField("minimumCancellationHours", event.target.value)
                  }
                  disabled={
                    !canEditSettings ||
                    !(data?.availableFields.minimumCancellationHours ?? false)
                  }
                  className={getInputClassName(
                    canEditSettings &&
                      (data?.availableFields.minimumCancellationHours ?? false),
                  )}
                >
                  <option value="">
                    {data?.availableFields.minimumCancellationHours
                      ? "Selecione"
                      : "Nao disponivel no schema atual"}
                  </option>
                  {cancellationHoursOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Cobranca por cancelamento tardio
                </label>
                <select
                  value={String(
                    getFieldValue(
                      "lateCancellationFeePercent",
                      data?.availableFields.lateCancellationFeePercent ?? false,
                    ),
                  )}
                  onChange={(event) =>
                    updateField("lateCancellationFeePercent", event.target.value)
                  }
                  disabled={
                    !canEditSettings ||
                    !(data?.availableFields.lateCancellationFeePercent ?? false)
                  }
                  className={getInputClassName(
                    canEditSettings &&
                      (data?.availableFields.lateCancellationFeePercent ?? false),
                  )}
                >
                  <option value="">
                    {data?.availableFields.lateCancellationFeePercent
                      ? "Selecione"
                      : "Nao disponivel no schema atual"}
                  </option>
                  {cancellationFeeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading font-semibold text-foreground">
              <Palette className="h-5 w-5 text-primary" />
              Configuracoes Operacionais
            </h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Tempo padrao da sessao (min)
              </label>
              <input
                type="number"
                min="1"
                value={String(
                  getFieldValue(
                    "defaultSessionDurationMinutes",
                    data?.availableFields.defaultSessionDurationMinutes ?? false,
                  ),
                )}
                onChange={(event) =>
                  updateField("defaultSessionDurationMinutes", event.target.value)
                }
                disabled={
                  !canEditSettings ||
                  !(data?.availableFields.defaultSessionDurationMinutes ?? false)
                }
                placeholder={
                  data?.availableFields.defaultSessionDurationMinutes
                    ? "Ex.: 50"
                    : "Nao disponivel no schema atual"
                }
                className={getInputClassName(
                  canEditSettings &&
                    (data?.availableFields.defaultSessionDurationMinutes ?? false),
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Esta configuracao passa a ser a base oficial da clinica para automacoes futuras e
                fluxos operacionais.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canEditSettings || isSaving}
            className="inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Salvando..." : "Salvar Configuracoes"}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
