import { AppLayout } from "@/components/layout/AppLayout";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { formatCpf, formatPhone } from "@/lib/formatters";
import { listarConsultasPorPaciente } from "@/services/consultas";
import { buscarPacientePorId } from "@/services/pacientes";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Calendar, DollarSign, Phone, Mail, MapPin, AlertCircle } from "lucide-react";

type PacienteDetalhe = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  contato_emergencia: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  observacoes: string | null;
  ativo: boolean | null;
};

type ConsultaPaciente = {
  id: string;
  data_consulta: string;
  status: string;
  observacoes: string | null;
};

export default function PatientDetails() {
  const { id } = useParams();
  const { data: profile } = useCurrentPsychologistProfile();
  const [patient, setPatient] = useState<PacienteDetalhe | null>(null);
  const [appointments, setAppointments] = useState<ConsultaPaciente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  useEffect(() => {
    async function carregarPaciente() {
      if (!id) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const [patientData, consultasData] = await Promise.all([
          buscarPacientePorId(id),
          listarConsultasPorPaciente(id),
        ]);

        if (!patientData) {
          setNotFound(true);
          setPatient(null);
          setAppointments([]);
          return;
        }

        setPatient(patientData as PacienteDetalhe);
        setAppointments((consultasData as ConsultaPaciente[]) ?? []);
        setNotFound(false);
      } catch (error) {
        console.error("Erro ao carregar paciente:", error);
        setNotFound(true);
        setPatient(null);
        setAppointments([]);
      } finally {
        setIsLoading(false);
      }
    }

    carregarPaciente();
  }, [id]);

  if (isLoading) {
    return (
      <AppLayout role="psychologist" userName={psychologistName}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/psi/pacientes" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div className="flex-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">Carregando paciente...</h1>
              <p className="text-muted-foreground mt-1">Buscando os dados do paciente.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (notFound || !patient) {
    return (
      <AppLayout role="psychologist" userName={psychologistName}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/psi/pacientes" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
            <div className="flex-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">Paciente não encontrado</h1>
              <p className="text-muted-foreground mt-1">Não foi possível localizar a ficha deste paciente.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const finances: Array<{ id: string; amount: number; date: string; status: "paid" | "pending" }> = [];
  const visibleAppointments = appointments.filter(
    (appointment) => appointment.status !== "cancelada" && appointment.status !== "recusada",
  );

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/psi/pacientes" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
          <div className="flex-1">
            <h1 className="font-heading text-2xl font-bold text-foreground">{patient.nome}</h1>
            <p className="text-muted-foreground mt-1">Ficha completa do paciente</p>
          </div>
          <Link to={`/psi/prontuarios/${patient.id}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm">
            <FileText className="w-4 h-4" /> Prontuário
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-4">Dados Pessoais</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                {patient.nome.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-foreground">{patient.nome}</p>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${patient.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {patient.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { icon: Mail, value: patient.email || "—" },
                { icon: Phone, value: formatPhone(patient.telefone) },
                { icon: MapPin, value: patient.endereco || "—" },
                { icon: AlertCircle, value: patient.contato_emergencia ? `Emergência: ${patient.contato_emergencia}` : "Emergência: —" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-muted-foreground">
                  <item.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{item.value}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-muted-foreground">CPF: {formatCpf(patient.cpf)}</p>
                <p className="text-muted-foreground">
                  Nascimento: {patient.data_nascimento ? new Date(patient.data_nascimento).toLocaleDateString("pt-BR") : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Consultas</h2>
            <div className="space-y-3">
              {visibleAppointments.length > 0 ? visibleAppointments.slice(0, 5).map((appointment) => {
                const date = new Date(appointment.data_consulta);
                return (
                  <div key={appointment.id} className="p-3 rounded-lg bg-muted/50">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-foreground">{date.toLocaleDateString("pt-BR")}</span>
                      <span className="text-xs text-muted-foreground">
                        {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Sessão Individual</p>
                  </div>
                );
              }) : <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-success" /> Pagamentos</h2>
            <div className="space-y-3">
              {finances.length > 0 ? finances.slice(0, 5).map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">R$ {f.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(f.date).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${f.status === "paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                    {f.status === "paid" ? "Pago" : "Pendente"}
                  </span>
                </div>
              )) : <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>}
            </div>
          </div>
        </div>

        {patient.observacoes && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-heading font-semibold text-foreground mb-3">Observações</h2>
            <p className="text-sm text-muted-foreground">{patient.observacoes}</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
