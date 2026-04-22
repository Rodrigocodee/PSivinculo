import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import {
  adminUsersQueryKey,
  fetchAdminUsersData,
} from "@/services/adminUsers";

async function copyValue(value: string, label: string) {
  if (!value) {
    toast.error("O convite da clinica ainda nao esta disponivel.");
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

    toast.success(`${label} copiado com sucesso.`);
  } catch {
    toast.error(`Nao foi possivel copiar ${label.toLowerCase()}.`);
  }
}

export default function AdminUserRegister() {
  const { data, isLoading, error } = useQuery({
    queryKey: [...adminUsersQueryKey, "invite"],
    queryFn: fetchAdminUsersData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const adminName = data?.adminName || "Administrador(a)";

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link to="/admin/usuarios" className="p-2 rounded-lg hover:bg-muted">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Convite de Psicologos</h1>
            <p className="text-muted-foreground mt-1">
              Compartilhe o acesso da clinica sem cadastro manual fake.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.15fr,1fr]">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Link2 className="h-3.5 w-3.5" />
              Convite da clinica
            </div>
            <h2 className="mt-3 font-heading text-xl font-bold text-foreground">Convide psicologos para entrarem ja vinculados</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O codigo e o link abaixo usam o contexto real da clinica logada e podem ser enviados diretamente para a equipe.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {data?.hasClinicScope
                ? `Clinica atual: ${data.clinicName || "Nao informada"}`
                : "Associe uma clinica ao admin para liberar o convite fixo."}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Codigo da clinica</label>
              <div className="flex gap-2">
                <div className="flex min-h-12 flex-1 items-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold tracking-[0.16em] text-foreground">
                  {isLoading
                    ? "Carregando..."
                    : data?.inviteCode || "Clinica nao vinculada"}
                </div>
                <button
                  type="button"
                  disabled={!data?.inviteCode}
                  onClick={() => void copyValue(data?.inviteCode || "", "Codigo")}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title="Copiar codigo"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Link de convite</label>
              <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground break-all">
                {isLoading
                  ? "Preparando link..."
                  : data?.inviteLink || "O link aparecera aqui quando a clinica estiver vinculada."}
              </div>
            </div>

            <button
              type="button"
              disabled={!data?.inviteLink}
              onClick={() => void copyValue(data?.inviteLink || "", "Link")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Copiar link de convite
            </button>

            {error ? (
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os dados de convite agora."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
