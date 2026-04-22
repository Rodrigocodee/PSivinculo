import { AppLayout } from "@/components/layout/AppLayout";
import { getProfessionalPreviewActionProps } from "@/components/psychologist/ProfessionalPreview";
import { useCurrentPsychologistProfile } from "@/hooks/use-current-psychologist-profile";
import { toast } from "@/components/ui/sonner";
import { cadastrarPaciente } from "@/services/pacientes";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const initialForm = {
  nome: "",
  data_nascimento: "",
  cpf: "",
  telefone: "",
  email: "",
  endereco: "",
  contato_emergencia: "",
  observacoes: "",
};

export default function PatientRegister() {
  const navigate = useNavigate();
  const { data: profile } = useCurrentPsychologistProfile();
  const [formData, setFormData] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const psychologistName = profile?.fullName?.trim() || "Profissional";

  function updateField(field: keyof typeof initialForm, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!formData.nome.trim()) {
      toast.error("Informe o nome do paciente.");
      return;
    }

    setIsSubmitting(true);

    try {
      await cadastrarPaciente({
        nome: formData.nome.trim(),
        data_nascimento: formData.data_nascimento || null,
        cpf: formData.cpf.trim() || null,
        telefone: formData.telefone.trim() || null,
        email: formData.email.trim() || null,
        endereco: formData.endereco.trim() || null,
        contato_emergencia: formData.contato_emergencia.trim() || null,
        observacoes: formData.observacoes.trim() || null,
      });

      toast.success("Paciente cadastrado com sucesso.");
      setFormData(initialForm);
      navigate("/psi/pacientes");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível cadastrar o paciente.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout role="psychologist" userName={psychologistName}>
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link to="/psi/pacientes" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-5 h-5 text-muted-foreground" /></Link>
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Novo Paciente</h1>
            <p className="text-muted-foreground mt-1">Preencha os dados para cadastrar um novo paciente.</p>
          </div>
        </div>

        <form
          className="bg-card rounded-xl border border-border p-6 space-y-6"
          onSubmit={handleSubmit}
          {...getProfessionalPreviewActionProps({
            description:
              "O cadastro de pacientes fica liberado assim que sua area profissional for ativada. Escolha um plano para seguir sem bloqueios.",
          })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "Nome completo", type: "text", placeholder: "Nome do paciente", span: 2, key: "nome" },
              { label: "Data de nascimento", type: "date", placeholder: "", key: "data_nascimento" },
              { label: "CPF", type: "text", placeholder: "000.000.000-00", key: "cpf" },
              { label: "Telefone", type: "tel", placeholder: "(00) 00000-0000", key: "telefone" },
              { label: "E-mail", type: "email", placeholder: "email@exemplo.com", key: "email" },
            ].map((f) => (
              <div key={f.key} className={f.span === 2 ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium text-foreground mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={formData[f.key as keyof typeof initialForm]}
                  onChange={(e) => updateField(f.key as keyof typeof initialForm, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Endereço</label>
            <input
              type="text"
              placeholder="Rua, número, bairro, cidade - UF"
              value={formData.endereco}
              onChange={(e) => updateField("endereco", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Contato de emergência</label>
            <input
              type="text"
              placeholder="Nome - Telefone"
              value={formData.contato_emergencia}
              onChange={(e) => updateField("contato_emergencia", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Observações gerais</label>
            <textarea
              rows={4}
              placeholder="Observações iniciais sobre o paciente..."
              value={formData.observacoes}
              onChange={(e) => updateField("observacoes", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Salvando..." : "Salvar Paciente"}
            </button>
            <Link to="/psi/pacientes" className="px-6 py-2.5 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all">
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
