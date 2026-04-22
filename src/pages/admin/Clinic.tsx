import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, Camera, Loader2, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCurrentAdminClinic,
  currentAdminClinicQueryKey,
} from "@/hooks/use-current-admin-clinic";
import { formatCNPJ, formatPhone } from "@/lib/formatters";
import { adminDashboardQueryKey } from "@/services/adminDashboard";
import { adminUsersQueryKey } from "@/services/adminUsers";
import {
  saveCurrentAdminClinic,
  uploadCurrentAdminClinicLogo,
  type AdminClinicData,
} from "@/services/adminClinic";

type ClinicFormState = {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  workingHours: string;
  sessionDuration: string;
};

const initialFormState: ClinicFormState = {
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  address: "",
  workingHours: "",
  sessionDuration: "",
};

const INPUT_CLASS =
  "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20";
const DISABLED_INPUT_CLASS =
  "w-full cursor-not-allowed rounded-xl border border-input bg-muted/50 px-4 py-3 text-sm text-muted-foreground outline-none";
const READONLY_INPUT_CLASS =
  "w-full rounded-xl border border-input bg-muted/35 px-4 py-3 text-sm text-foreground outline-none";

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "CL";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function ClinicLoadingState({ userName }: { userName: string }) {
  return (
    <AppLayout role="admin" userName={userName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted/70" />
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="mb-6 mt-4 flex items-center gap-4">
            <div className="h-20 w-20 animate-pulse rounded-2xl bg-muted/70" />
            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-muted/70" />
              <div className="h-4 w-36 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={index === 4 ? "sm:col-span-2" : ""}>
                <div className="mb-1.5 h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mb-1.5 h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
            </div>
            <div>
              <div className="mb-1.5 h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
            </div>
          </div>
        </div>

        <div className="h-11 w-44 animate-pulse rounded-xl bg-primary/20" />
      </div>
    </AppLayout>
  );
}

export default function AdminClinic() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { appUser } = useAuth();
  const { data, isLoading, error } = useCurrentAdminClinic();
  const [form, setForm] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    if (!data) return;

    setForm({
      name: data.name,
      cnpj: formatCNPJ(data.cnpj),
      phone: formatPhone(data.phone),
      email: data.email,
      address: data.address,
      workingHours: data.workingHours,
      sessionDuration: data.sessionDuration != null ? String(data.sessionDuration) : "",
    });
  }, [data]);

  const adminName = data?.adminName || appUser?.fullName || "Administrador(a)";
  const clinicDisplayName = form.name.trim() || data?.clinicName || "Clinica";
  const clinicInitials = useMemo(() => getInitials(clinicDisplayName), [clinicDisplayName]);
  const canEditClinic = Boolean(data?.hasClinicScope && data?.hasClinicRecord);
  const unavailableSettingsFields = Boolean(
    data && (!data.availableFields.workingHours || !data.availableFields.sessionDuration),
  );

  if (isLoading) {
    return <ClinicLoadingState userName={adminName} />;
  }

  async function syncClinicAfterChange(nextClinic: AdminClinicData) {
    queryClient.setQueryData(currentAdminClinicQueryKey, nextClinic);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminUsersQueryKey }),
      queryClient.invalidateQueries({ queryKey: adminDashboardQueryKey }),
    ]);
  }

  function updateField<K extends keyof ClinicFormState>(field: K, value: ClinicFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]:
        field === "phone"
          ? formatPhone(String(value))
          : field === "cnpj"
            ? formatCNPJ(String(value))
            : field === "sessionDuration"
              ? String(value).replace(/[^\d]/g, "").slice(0, 3)
              : value,
    }));
  }

  function getFieldValue<K extends keyof ClinicFormState>(field: K, enabled: boolean) {
    return enabled ? form[field] : "";
  }

  function getFieldClassName(inputState: "enabled" | "disabled" | "readonly") {
    if (inputState === "enabled") return INPUT_CLASS;
    if (inputState === "readonly") return READONLY_INPUT_CLASS;
    return DISABLED_INPUT_CLASS;
  }

  function handleLogoButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIsUploadingLogo(true);

    try {
      const nextClinic = await uploadCurrentAdminClinicLogo(file);
      await syncClinicAfterChange(nextClinic);
      toast.success("Imagem da clinica atualizada com sucesso.");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Nao foi possivel atualizar a imagem da clinica.";
      toast.error(message);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const nextClinic = await saveCurrentAdminClinic(form);
      await syncClinicAfterChange(nextClinic);
      toast.success("Alteracoes da clinica salvas com sucesso.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Nao foi possivel salvar os dados da clinica.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-foreground">
            <Building2 className="h-6 w-6 text-primary" />
            Gestao da Clinica
          </h1>
          <p className="mt-1 text-muted-foreground">Informacoes e configuracoes da clinica.</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os dados reais da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Associe uma clinica ao admin autenticado para editar os dados reais em `public.clinicas`.
          </div>
        ) : null}

        {data?.hasClinicScope && !data.hasClinicRecord ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            A clinica vinculada foi identificada, mas nao foi encontrado um registro correspondente em `public.clinicas`.
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Dados da Clinica</h2>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />

            <div className="mb-6 flex items-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl gradient-seafoam text-2xl font-bold text-secondary-foreground">
                {data?.logoUrl ? (
                  <img src={data.logoUrl} alt={clinicDisplayName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  clinicInitials
                )}
                <button
                  type="button"
                  onClick={handleLogoButtonClick}
                  disabled={!canEditClinic || isUploadingLogo}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card disabled:cursor-not-allowed disabled:opacity-70"
                  aria-label="Adicionar imagem da clinica"
                  title="Adicionar imagem da clinica"
                >
                  {isUploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <Camera className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-foreground">{clinicDisplayName}</p>
                <p className="text-sm text-muted-foreground">
                  {form.cnpj || (data?.availableFields.cnpj ? "CNPJ nao informado" : "CNPJ indisponivel no schema atual")}
                </p>
                <p className="text-xs text-muted-foreground">Os dados abaixo refletem apenas o cadastro real da clinica vinculada.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  key: "name" as const,
                  label: "Nome da clinica",
                  type: "text",
                  available: data?.availableFields.name ?? false,
                  placeholder: "Nome da clinica",
                },
                {
                  key: "cnpj" as const,
                  label: "CNPJ",
                  type: "text",
                  available: data?.availableFields.cnpj ?? false,
                  placeholder: "00.000.000/0000-00",
                  readOnly: true,
                },
                {
                  key: "phone" as const,
                  label: "Telefone",
                  type: "tel",
                  available: data?.availableFields.phone ?? false,
                  placeholder: "(00) 00000-0000",
                },
                {
                  key: "email" as const,
                  label: "E-mail",
                  type: "email",
                  available: data?.availableFields.email ?? false,
                  placeholder: "contato@clinica.com",
                },
              ].map((field) => {
                const isReadOnly = Boolean(field.readOnly && field.available);
                const enabled = canEditClinic && field.available && !isReadOnly;
                const inputState = field.available
                  ? isReadOnly
                    ? "readonly"
                    : enabled
                      ? "enabled"
                      : "disabled"
                  : "disabled";

                return (
                  <div key={field.key}>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{field.label}</label>
                    <input
                      type={field.type}
                      value={getFieldValue(field.key, field.available)}
                      onChange={isReadOnly ? undefined : (event) => updateField(field.key, event.target.value)}
                      disabled={!field.available}
                      readOnly={isReadOnly}
                      aria-readonly={isReadOnly}
                      placeholder={field.available ? field.placeholder : "Nao disponivel no schema atual"}
                      className={getFieldClassName(inputState)}
                    />
                    {field.key === "cnpj" ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        CNPJ bloqueado para edicao. Esse dado permanece fixo conforme o cadastro inicial da clinica.
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Endereco</label>
                <input
                  type="text"
                  value={getFieldValue("address", data?.availableFields.address ?? false)}
                  onChange={(event) => updateField("address", event.target.value)}
                  disabled={!canEditClinic || !(data?.availableFields.address ?? false)}
                  placeholder={data?.availableFields.address ? "Endereco da clinica" : "Nao disponivel no schema atual"}
                  className={getFieldClassName(canEditClinic && (data?.availableFields.address ?? false) ? "enabled" : "disabled")}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 font-heading font-semibold text-foreground">Funcionamento</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-foreground">Horarios de funcionamento</label>
                <input
                  type="text"
                  value={getFieldValue("workingHours", data?.availableFields.workingHours ?? false)}
                  onChange={(event) => updateField("workingHours", event.target.value)}
                  disabled={!canEditClinic || !(data?.availableFields.workingHours ?? false)}
                  placeholder={data?.availableFields.workingHours ? "Ex.: Seg a Sex, 08:00 as 18:00" : "Nao disponivel no schema atual"}
                  className={getFieldClassName(canEditClinic && (data?.availableFields.workingHours ?? false) ? "enabled" : "disabled")}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Duracao padrao da sessao (min)</label>
                <input
                  type="number"
                  value={getFieldValue("sessionDuration", data?.availableFields.sessionDuration ?? false)}
                  onChange={(event) => updateField("sessionDuration", event.target.value)}
                  disabled={!canEditClinic || !(data?.availableFields.sessionDuration ?? false)}
                  placeholder={data?.availableFields.sessionDuration ? "50" : "Nao disponivel"}
                  className={getFieldClassName(canEditClinic && (data?.availableFields.sessionDuration ?? false) ? "enabled" : "disabled")}
                />
              </div>
            </div>

            {unavailableSettingsFields ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Campos sem coluna real em `public.clinicas` permanecem desativados para evitar dados fake.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canEditClinic || isSaving}
            className="inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Salvando..." : "Salvar Alteracoes"}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
