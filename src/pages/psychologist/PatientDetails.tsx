import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { toast } from "@/components/ui/sonner";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { formatCpf, formatPhone } from "@/lib/formatters";
import { listarConsultasPorPaciente } from "@/services/consultas";
import { isValidOnlineSessionLinkInput } from "@/services/onlineSessionLinks";
import { buscarPacientePorId, salvarLinksSalaOnlinePaciente } from "@/services/pacientes";
import { PREVIEW_FEATURE_LOCK_MESSAGE } from "@/services/professionalAccessGuard";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  Video,
  Loader2,
} from "lucide-react";

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
  link_sessao_online: string | null;
  link_sessao_online_paciente: string | null;
  link_sessao_online_psicologo: string | null;
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
  const [patientRoomLink, setPatientRoomLink] = useState("");
  const [psychologistRoomLink, setPsychologistRoomLink] = useState("");
  const [hasEditedRoomLinks, setHasEditedRoomLinks] = useState(false);
  const [isSavingRoomLinks, setIsSavingRoomLinks] = useState(false);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  function resolveInitialRoomLinks(currentPatient: PacienteDetalhe | null) {
    const legacyRoomLink = currentPatient?.link_sessao_online?.trim() || "";
    const resolvedPatientRoomLink =
      currentPatient?.link_sessao_online_paciente?.trim() || legacyRoomLink;
    const resolvedPsychologistRoomLink =
      currentPatient?.link_sessao_online_psicologo?.trim() ||
      resolvedPatientRoomLink ||
      legacyRoomLink;

    return {
      patientLink: resolvedPatientRoomLink,
      psychologistLink: resolvedPsychologistRoomLink,
    };
  }

  useEffect(() => {
    async function carregarPaciente() {
      setIsLoading(true);
      setHasEditedRoomLinks(false);

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

  useEffect(() => {
    if (hasEditedRoomLinks) {
      return;
    }

    const initialRoomLinks = resolveInitialRoomLinks(patient);
    setPatientRoomLink(initialRoomLinks.patientLink);
    setPsychologistRoomLink(initialRoomLinks.psychologistLink);
  }, [
    patient?.link_sessao_online,
    patient?.link_sessao_online_paciente,
    patient?.link_sessao_online_psicologo,
    hasEditedRoomLinks,
  ]);

  async function handleSaveRoomLinks() {
    if (!patient) {
      toast.error("Nao foi possivel localizar o paciente para salvar os links da sala online.");
      return;
    }

    const trimmedPatientRoomLink = patientRoomLink.trim();
    const trimmedPsychologistRoomLink = psychologistRoomLink.trim();

    if (!isValidOnlineSessionLinkInput(trimmedPatientRoomLink)) {
      toast.error("Informe um link valido com http:// ou https://.");
      return;
    }

    if (!isValidOnlineSessionLinkInput(trimmedPsychologistRoomLink)) {
      toast.error("Informe um link valido com http:// ou https://.");
      return;
    }

    setIsSavingRoomLinks(true);

    try {
      const savedPatient = await salvarLinksSalaOnlinePaciente(
        patient.id,
        {
          patientLink: trimmedPatientRoomLink,
          psychologistLink: trimmedPsychologistRoomLink,
        },
      );

      setPatient(savedPatient as PacienteDetalhe);
      const savedRoomLinks = resolveInitialRoomLinks(savedPatient as PacienteDetalhe);
      setPatientRoomLink(savedRoomLinks.patientLink);
      setPsychologistRoomLink(savedRoomLinks.psychologistLink);
      setHasEditedRoomLinks(false);
      toast.success("Links da sala online deste paciente salvos com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel salvar os links da sala online.";
      toast.error(message);
    } finally {
      setIsSavingRoomLinks(false);
    }
  }

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

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading font-semibold text-foreground">Sala online privada deste paciente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Esses links sao privados e serao usados apenas nos lembretes enviados 1h antes da consulta online.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Link do paciente/convidado
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={patientRoomLink}
                    onChange={(event) => {
                      setPatientRoomLink(event.target.value);
                      setHasEditedRoomLinks(true);
                    }}
                    placeholder="Cole aqui o link que o paciente recebera 1h antes da consulta"
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                  {patientRoomLink.trim() && !isValidOnlineSessionLinkInput(patientRoomLink) ? (
                    <p className="mt-2 text-xs text-destructive">
                      Informe um link valido com http:// ou https://.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Link do psicologo/admin
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={psychologistRoomLink}
                    onChange={(event) => {
                      setPsychologistRoomLink(event.target.value);
                      setHasEditedRoomLinks(true);
                    }}
                    placeholder="Cole aqui o link de criador/host que o psicologo recebera 1h antes da consulta"
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                  {psychologistRoomLink.trim() && !isValidOnlineSessionLinkInput(psychologistRoomLink) ? (
                    <p className="mt-2 text-xs text-destructive">
                      Informe um link valido com http:// ou https://.
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveRoomLinks}
                    disabled={
                      isSavingRoomLinks ||
                      (
                        patientRoomLink.trim().length > 0 &&
                        !isValidOnlineSessionLinkInput(patientRoomLink)
                      ) ||
                      (
                        psychologistRoomLink.trim().length > 0 &&
                        !isValidOnlineSessionLinkInput(psychologistRoomLink)
                      )
                    }
                    {...getProfessionalPreviewActionProps({
                      title: "Ative sua assinatura para salvar links da sala.",
                      description: PREVIEW_FEATURE_LOCK_MESSAGE,
                    })}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70 gradient-primary"
                  >
                    {isSavingRoomLinks ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Video className="w-4 h-4" />
                    )}
                    {isSavingRoomLinks ? "Salvando..." : "Salvar links da sala"}
                  </button>
                </div>
              </div>
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
