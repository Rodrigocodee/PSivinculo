import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { usePsychologistProfessionalPreview } from "@/components/psychologist/ProfessionalPreview";
import { toast } from "@/components/ui/sonner";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { formatPhone } from "@/lib/formatters";
import { listarConsultasPacientes } from "@/services/consultas";
import { listarPacientes } from "@/services/pacientes";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Eye, FileText, Copy, Link2 } from "lucide-react";
import { Link } from "react-router-dom";

type Paciente = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  contato_emergencia?: string | null;
  observacoes?: string | null;
  created_at?: string | null;
};

type ConsultaPaciente = {
  id: string;
  paciente_id: string;
  data_consulta: string;
  status: string;
};

type PacienteComSessoes = Paciente & {
  ultimaSessao: string | null;
  proximaSessao: string | null;
};

function getConsultaTimestamp(dataConsulta: string) {
  const timestamp = new Date(dataConsulta).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export default function PsychologistPatients() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [consultas, setConsultas] = useState<ConsultaPaciente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { data: profile } = useCurrentPsychologistProfile();
  const { isPreviewMode } = usePsychologistProfessionalPreview();
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  useEffect(() => {
    async function carregarDados() {
      try {
        const [patientsData, consultasData] = await Promise.all([
          listarPacientes(),
          listarConsultasPacientes(),
        ]);

        setPatients((patientsData as Paciente[]) ?? []);
        setConsultas((consultasData as ConsultaPaciente[]) ?? []);
      } catch (error) {
        console.error("Erro ao carregar pacientes:", error);
        setPatients([]);
        setConsultas([]);
      } finally {
        setIsLoading(false);
      }
    }

    carregarDados();
  }, []);

  const inviteCode = profile?.inviteCode || "";
  const invitePath = inviteCode ? `/cadastro/paciente?codigo=${encodeURIComponent(inviteCode)}` : "/cadastro/paciente";
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}${invitePath}` : invitePath;

  async function copyInviteValue(value: string, label: string) {
    if (!value) {
      toast.error("O convite ainda esta sendo preparado.");
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

  const patientsWithSessions = useMemo(() => {
    const nowTimestamp = Date.now();

    return patients.map((patient) => {
      const consultasPaciente = consultas
        .filter(
          (consulta) =>
            consulta.paciente_id === patient.id &&
            consulta.status !== "cancelada" &&
            consulta.status !== "recusada",
        )
        .map((consulta) => ({
          ...consulta,
          timestamp: getConsultaTimestamp(consulta.data_consulta),
        }))
        .filter((consulta) => consulta.timestamp !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      const consultasPassadas = consultasPaciente.filter((consulta) => consulta.timestamp < nowTimestamp);
      const consultasFuturas = consultasPaciente.filter((consulta) => consulta.timestamp >= nowTimestamp);

      const ultimaSessao = consultasPassadas.length > 0
        ? consultasPassadas[consultasPassadas.length - 1].data_consulta
        : null;

      const proximaSessao = consultasFuturas.length > 0
        ? consultasFuturas[0].data_consulta
        : null;

      return {
        ...patient,
        ultimaSessao,
        proximaSessao,
      } satisfies PacienteComSessoes;
    });
  }, [patients, consultas]);

  const filtered = patientsWithSessions.filter((p) => {
    const status = p.ativo ? "active" : "inactive";

    if (filter === "active" && status !== "active") return false;
    if (filter === "inactive" && status !== "inactive") return false;
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Pacientes</h1>
            <p className="text-muted-foreground mt-1">{patients.length} pacientes cadastrados</p>
          </div>
          <Link
            to="/psi/pacientes/novo"
            {...getProfessionalPreviewActionProps({
              description:
                "Para cadastrar pacientes reais e liberar a gestao completa da sua carteira, escolha um plano e libere sua area profissional.",
            })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> Novo Paciente
          </Link>
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.25fr,1fr]">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Link2 className="h-3.5 w-3.5" />
              Convite de pacientes
            </div>
            <h2 className="mt-3 font-heading text-xl font-bold text-foreground">Compartilhe seu codigo ou link de cadastro</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O paciente cria a propria conta e ja entra vinculado a voce e a sua clinica automaticamente.
            </p>
            {isPreviewMode ? (
              <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                Os convites ficam ativos assim que sua area profissional for liberada para uso completo.
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Seu codigo</label>
              <div className="flex gap-2">
                <div className="flex min-h-12 flex-1 items-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold tracking-[0.16em] text-foreground">
                  {inviteCode || "Gerando..."}
                </div>
                <button
                  type="button"
                  onClick={() => void copyInviteValue(inviteCode, "Codigo")}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                  title="Copiar codigo"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Link de convite</label>
              <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground break-all">
                {inviteLink}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void copyInviteValue(inviteLink, "Link")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Copiar link de convite
            </button>
          </div>
        </section>

        <div className="bg-card rounded-xl border border-border p-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 flex-1 bg-muted rounded-lg px-3 py-2 w-full sm:w-auto">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar paciente..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm outline-none w-full" />
          </div>
          <div className="flex bg-muted rounded-lg p-1">
            {[{ v: "all", l: "Todos" }, { v: "active", l: "Ativos" }, { v: "inactive", l: "Inativos" }].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${filter === f.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">Carregando pacientes...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Paciente</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Telefone</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Última Sessão</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Próxima Sessão</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length > 0 ? (
                    filtered.map((p) => (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                              {p.nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{p.nome}</p>
                              <p className="text-xs text-muted-foreground">{p.email || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatPhone(p.telefone)}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {p.ultimaSessao ? new Date(p.ultimaSessao).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {p.proximaSessao ? new Date(p.proximaSessao).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {p.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/psi/pacientes/${p.id}`} className="p-2 rounded-lg hover:bg-muted" title="Ver detalhes"><Eye className="w-4 h-4 text-muted-foreground" /></Link>
                            <Link to={`/psi/prontuarios/${p.id}`} className="p-2 rounded-lg hover:bg-muted" title="Prontuário"><FileText className="w-4 h-4 text-muted-foreground" /></Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum paciente encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
