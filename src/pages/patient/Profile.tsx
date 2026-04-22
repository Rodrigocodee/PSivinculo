import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Camera, LoaderCircle, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatCPF, formatPhone } from "@/lib/formatters";
import {
  fetchCurrentPatientProfile,
  patientProfileQueryKey,
  saveCurrentPatientProfile,
  uploadCurrentPatientAvatar,
} from "@/services/patientProfile";

type ProfileFormState = {
  fullName: string;
  email: string;
  birthDate: string;
  cpf: string;
  phone: string;
  address: string;
};

const initialFormState: ProfileFormState = {
  fullName: "",
  email: "",
  birthDate: "",
  cpf: "",
  phone: "",
  address: "",
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "P";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export default function PatientProfile() {
  const queryClient = useQueryClient();
  const { refreshAuth } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<ProfileFormState>(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: patientProfileQueryKey,
    queryFn: fetchCurrentPatientProfile,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;

    setForm({
      fullName: data.fullName,
      email: data.email,
      birthDate: data.birthDate,
      cpf: data.cpf,
      phone: data.phone,
      address: data.address,
    });
  }, [data]);

  const patientName = form.fullName || data?.fullName || "Paciente";
  const initials = useMemo(() => getInitials(patientName), [patientName]);

  function updateField<K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function syncProfileAfterChange(nextProfile: Awaited<ReturnType<typeof fetchCurrentPatientProfile>>) {
    queryClient.setQueryData(patientProfileQueryKey, nextProfile);

    await Promise.all([
      refreshAuth(),
      queryClient.invalidateQueries({ queryKey: ["patient-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["patient-appointments"] }),
      queryClient.invalidateQueries({ queryKey: ["patient-documents"] }),
    ]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const savedProfile = await saveCurrentPatientProfile({
        fullName: form.fullName,
        birthDate: form.birthDate,
        cpf: form.cpf,
        phone: form.phone,
        address: form.address,
      });

      await syncProfileAfterChange(savedProfile);
      toast.success("Perfil atualizado com sucesso.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Nao foi possivel salvar suas alteracoes agora.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleAvatarButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) return;

    setIsUploadingAvatar(true);

    try {
      const savedProfile = await uploadCurrentPatientAvatar(selectedFile);
      await syncProfileAfterChange(savedProfile);
      toast.success("Foto de perfil atualizada com sucesso.");
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : "Nao foi possivel atualizar sua foto agora.",
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  return (
    <AppLayout role="patient" userName={patientName}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="mt-1 text-muted-foreground">Gerencie seus dados pessoais.</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar seus dados de perfil agora."}
              </p>
            </div>
          </div>
        ) : null}

        <form className="space-y-4 rounded-xl border border-border bg-card p-6" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
          />

          <div className="mb-4 flex items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-xl font-bold text-primary">
              {data?.avatarUrl ? (
                <img src={data.avatarUrl} alt={patientName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                initials
              )}

              <button
                type="button"
                onClick={handleAvatarButtonClick}
                disabled={isUploadingAvatar || isLoading}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card disabled:cursor-not-allowed disabled:opacity-70"
                aria-label="Adicionar foto de perfil"
                title="Adicionar foto de perfil"
              >
                {isUploadingAvatar ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                {isLoading ? "Carregando perfil..." : patientName}
              </p>
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Sincronizando seus dados reais..." : form.email || "Email indisponivel"}
              </p>
              {!isLoading ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Clinica: {data?.clinicName || "Nao informada"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Psicologo: {data?.psychologistName || "Nao informado"}
                  </p>
                </>
              ) : null}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-12 w-full animate-pulse rounded-xl bg-muted/70" />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-12 w-full animate-pulse rounded-xl bg-muted/70" />
              </div>
              <div className="h-11 w-44 animate-pulse rounded-xl bg-primary/20" />
            </div>
          ) : data?.row ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Nome completo</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) => updateField("fullName", event.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    readOnly
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-muted-foreground outline-none transition-all"
                  />
                </div>

                {data.availableFields.phone ? (
                  <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Telefone</label>
                    <input
                      type="text"
                      value={formatPhone(form.phone)}
                      onChange={(event) =>
                        updateField("phone", event.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ) : null}

                {data.availableFields.birthDate ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Data de nascimento</label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(event) => updateField("birthDate", event.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ) : null}

                {data.availableFields.cpf ? (
                  <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">CPF</label>
                    <input
                      type="text"
                      value={formatCPF(form.cpf)}
                      onChange={(event) =>
                        updateField("cpf", event.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ) : null}

                {data.availableFields.address ? (
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Endereco</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(event) => updateField("address", event.target.value)}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold gradient-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? "Salvando..." : "Salvar Alteracoes"}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4 py-5 text-sm text-muted-foreground">
              Nao foi possivel localizar um cadastro valido em pacientes para editar seu perfil.
            </div>
          )}
        </form>
      </div>
    </AppLayout>
  );
}
