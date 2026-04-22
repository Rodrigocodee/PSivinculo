import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Copy, Edit, Link2, Plus, Search, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { toast } from "@/components/ui/sonner";
import {
  adminUsersQueryKey,
  fetchAdminUsersData,
} from "@/services/adminUsers";

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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

function UsersLoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="h-11 w-40 animate-pulse rounded-xl bg-muted" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr,1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-muted/70" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
          <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
          <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-10 max-w-md animate-pulse rounded-lg bg-muted/70" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="space-y-3 px-4 py-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const inviteSectionRef = useRef<HTMLElement | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: adminUsersQueryKey,
    queryFn: fetchAdminUsersData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const adminName = data?.adminName || "Administrador(a)";
  const totalUsers = data?.users.length ?? 0;
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const users = data?.users || [];

    if (!query) return users;
    return users.filter((user) => user.searchText.includes(query));
  }, [data?.users, search]);

  function handleScrollToInvite() {
    inviteSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (isLoading) {
    return (
      <AppLayout role="admin" userName={adminName}>
        <UsersLoadingState />
      </AppLayout>
    );
  }

  const subtitle = data?.hasClinicScope
    ? `${totalUsers} usuario${totalUsers === 1 ? "" : "s"} vinculado${totalUsers === 1 ? "" : "s"} a ${data.clinicName || "sua clinica"}`
    : "Associe este acesso administrativo a uma clinica para listar os usuarios reais.";
  const emptyMessage = data?.hasClinicScope
    ? search.trim()
      ? "Nenhum usuario encontrado para este filtro."
      : "Nenhum usuario vinculado a esta clinica ainda."
    : "Vincule uma clinica ao admin logado para visualizar a equipe.";

  return (
    <AppLayout role="admin" userName={adminName}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Gestao de Usuarios</h1>
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleScrollToInvite}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm"
          >
            <Plus className="w-4 h-4" /> Novo Usuario
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {error instanceof Error
                  ? error.message
                  : "Nao foi possivel carregar os usuarios da clinica agora."}
              </p>
            </div>
          </div>
        ) : null}

        {!data?.hasClinicScope ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            Vincule uma clinica ao usuario administrativo para liberar a equipe real e o convite dos psicologos.
          </div>
        ) : null}

        <section ref={inviteSectionRef} className="grid gap-4 xl:grid-cols-[1.25fr,1fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Link2 className="h-3.5 w-3.5" />
              Convite da clinica
            </div>
            <h2 className="mt-3 font-heading text-xl font-bold text-foreground">Compartilhe o acesso com os psicologos da equipe</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use o codigo fixo ou o link da clinica para convidar novos psicologos e manter o cadastro ja vinculado ao ambiente administrativo correto.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {data?.hasClinicScope
                ? `Clinica atual: ${data.clinicName || "Nao informada"}`
                : "O convite sera liberado assim que o admin estiver vinculado a uma clinica."}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Codigo fixo da clinica</label>
              <div className="flex gap-2">
                <div className="flex min-h-12 flex-1 items-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold tracking-[0.16em] text-foreground">
                  {data?.inviteCode || "Clinica nao vinculada"}
                </div>
                <button
                  type="button"
                  onClick={() => void copyValue(data?.inviteCode || "", "Codigo")}
                  disabled={!data?.inviteCode}
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
                {data?.inviteLink || "O link de convite aparecera aqui quando a clinica estiver vinculada."}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void copyValue(data?.inviteLink || "", "Link")}
              disabled={!data?.inviteLink}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Copiar link de convite
            </button>

            {data?.hasClinicScope && !data.inviteCodePersisted ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                O codigo foi preparado para esta clinica, mas ainda nao foi persistido em `clinicas.codigo_convite`.
              </p>
            ) : null}
          </div>
        </section>

        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 max-w-md">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuario</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">E-mail</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cargo</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{user.name}</p>
                            {user.specialty ? (
                              <p className="text-xs text-muted-foreground">{user.specialty}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {user.roleLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            user.statusTone === "success"
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {user.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled
                            title="Edicao disponivel em breve"
                            className="p-2 rounded-lg text-muted-foreground opacity-50 cursor-not-allowed"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled
                            title="Remocao disponivel em breve"
                            className="p-2 rounded-lg text-destructive/60 opacity-50 cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
