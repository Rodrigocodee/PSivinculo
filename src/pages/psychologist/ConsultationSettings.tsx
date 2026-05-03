import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { useCurrentPsychologistConsultationSettings } from "@/hooks/use-current-psychologist-consultation-settings";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE } from "@/services/consultaReminder";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import {
  currentPsychologistConsultationSettingsQueryKey,
  resolvePsychologistConsultationSettingsSnapshot,
  saveCurrentPsychologistConsultationSettings,
  type ConsultationModality,
} from "@/services/psychologistConsultationSettings";

type ConsultationForm = {
  consultationPrice: string;
  consultationDurationMinutes: string;
  consultationModality: ConsultationModality;
  presentialLocation: string;
  sessionReminderMessage: string;
};

const INPUT_CLASS =
  "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20";

const defaultForm: ConsultationForm = {
  consultationPrice: "",
  consultationDurationMinutes: "50",
  consultationModality: "hibrido",
  presentialLocation: "",
  sessionReminderMessage: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

export default function PsychologistConsultationSettings() {
  const { appUser, isLoading: isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const authMetadata = isRecord(appUser?.user.user_metadata) ? appUser.user.user_metadata : null;
  const usuariosRecord = appUser?.recordTable === "usuarios" ? appUser.record || null : null;
  const isQueryEnabled = !isLoadingAuth && Boolean(appUser?.user);
  const cachedSettings = useMemo(
    () =>
      resolvePsychologistConsultationSettingsSnapshot({
        psychologistId: appUser?.user.id || "",
        sourceTable: appUser?.recordTable || null,
        record: usuariosRecord,
      }),
    [appUser?.recordTable, appUser?.user.id, usuariosRecord],
  );
  const { data, error, isFetching, isLoading } = useCurrentPsychologistConsultationSettings(
    isQueryEnabled,
    usuariosRecord ? cachedSettings : undefined,
  );
  const [form, setForm] = useState<ConsultationForm>(defaultForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;

    setForm({
      consultationPrice:
        typeof data.consultationPrice === "number" ? data.consultationPrice.toFixed(2).replace(".", ",") : "",
      consultationDurationMinutes: String(data.consultationDurationMinutes || 50),
      consultationModality: data.consultationModality,
      presentialLocation: data.presentialLocation,
      sessionReminderMessage: data.sessionReminderMessage,
    });
  }, [data]);

  useEffect(() => {
    if (!error) return;

    console.error("[Psivinculo][consulta-config][load_error]", {
      error,
      message:
        error instanceof Error
          ? error.message
          : "Falha sem mensagem detalhada ao carregar preferencias da consulta.",
      authUserId: appUser?.user.id || null,
      recordTable: appUser?.recordTable || null,
      hasUsuariosRecord: Boolean(usuariosRecord),
    });
  }, [appUser?.recordTable, appUser?.user.id, error, usuariosRecord]);

  function updateForm<Field extends keyof ConsultationForm>(field: Field, value: ConsultationForm[Field]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      const savedSettings = await saveCurrentPsychologistConsultationSettings({
        consultationPrice: form.consultationPrice,
        consultationDurationMinutes: form.consultationDurationMinutes,
        consultationModality: form.consultationModality,
        presentialLocation: form.presentialLocation,
        sessionReminderMessage: form.sessionReminderMessage,
      });

      queryClient.setQueryData(currentPsychologistConsultationSettingsQueryKey, savedSettings);

      toast.success("Preferencias da consulta salvas em public.usuarios.");
    } catch (error) {
      console.error("[Psivinculo][consulta-config][save_error]", {
        error,
        message:
          error instanceof Error
            ? error.message
            : "Falha sem mensagem detalhada ao salvar preferencias da consulta.",
        authUserId: appUser?.user.id || null,
      });
      const message =
        error instanceof Error
          ? error.message
          : "O Supabase nao retornou uma mensagem de erro para o salvamento.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  const userName = appUser?.fullName?.trim() || "Profissional";
  const specialty =
    pickString(authMetadata, ["specialty", "especialidade"]) ||
    pickString(appUser?.record || null, ["especialidade", "specialty"]);
  const showsPresentialFields = form.consultationModality !== "online";
  const isInitialLoad = (isLoadingAuth && !appUser?.user) || (isQueryEnabled && isLoading && !data);
  const loadErrorMessage =
    error instanceof Error
      ? error.message
      : !isLoadingAuth && !appUser?.user
        ? "Nao foi possivel localizar o psicologo autenticado para carregar as preferencias."
        : "";

  return (
    <AppLayout role="psychologist" userName={userName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Consulta</h1>
          <p className="mt-1 text-muted-foreground">
            Defina as preferencias que serao usadas no agendamento do paciente.
          </p>
          {specialty ? (
            <p className="mt-2 text-xs text-muted-foreground">Especialidade: {specialty}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="font-heading font-semibold text-foreground">Configuracoes da consulta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Essas informacoes orientam a solicitacao de horario e ajudam o paciente a escolher a modalidade correta.
            </p>
          </div>

          {isInitialLoad ? (
            <div className="space-y-3">
              <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
                <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
              </div>
              <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
            </div>
          ) : loadErrorMessage && !data ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadErrorMessage}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Valor da consulta</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.consultationPrice}
                  onChange={(event) => updateForm("consultationPrice", event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="150,00"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Duracao da consulta (min)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.consultationDurationMinutes}
                  onChange={(event) => updateForm("consultationDurationMinutes", event.target.value)}
                  className={INPUT_CLASS}
                  placeholder="50"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Modalidade de atendimento</label>
                <select
                  value={form.consultationModality}
                  onChange={(event) =>
                    updateForm("consultationModality", event.target.value as ConsultationModality)
                  }
                  className={INPUT_CLASS}
                >
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                  <option value="hibrido">Presencial e online</option>
                </select>
              </div>

              {showsPresentialFields ? (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Endereco ou local presencial
                  </label>
                  <textarea
                    rows={3}
                    value={form.presentialLocation}
                    onChange={(event) => updateForm("presentialLocation", event.target.value)}
                    className={`${INPUT_CLASS} resize-none`}
                    placeholder="Opcional. Ex.: Rua, numero, sala ou ponto de referencia."
                  />
                </div>
              ) : null}

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Mensagem de lembrete para o paciente
                </label>
                <textarea
                  rows={5}
                  value={form.sessionReminderMessage}
                  onChange={(event) => updateForm("sessionReminderMessage", event.target.value)}
                  className={`${INPUT_CLASS} resize-none`}
                  placeholder={DEFAULT_MENSAGEM_LEMBRETE_CONSULTA_TEMPLATE}
                />
              </div>
            </div>
          )}

          {isFetching && !isInitialLoad ? (
            <p className="mt-4 text-xs text-muted-foreground">Atualizando configuracoes salvas...</p>
          ) : null}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            {...getProfessionalPreviewActionProps({
              title: "Ative sua assinatura para salvar preferencias de consulta.",
              description: PREVIEW_FEATURE_LOCK_MESSAGE,
            })}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 gradient-primary"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Salvando..." : "Salvar Preferencias"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
