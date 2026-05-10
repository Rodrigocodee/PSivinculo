import { isValidEmail, normalizeEmail, normalizePhoneDigits } from "@/services/auth";
import { normalizeOnlineSessionLinkInput } from "@/services/onlineSessionLinks";
import { assertProfessionalAccessFromScope } from "@/services/professionalAccessGuard";
import { getPsychologistServiceScope } from "@/services/psychologistScope";
import {
    buildAuthenticatedJsonRequestHeaders,
    buildServerApiUrl,
    readServerJsonResponse,
} from "@/services/serverApi";
import { supabase } from "../lib/supabase";

const PATIENT_ROOM_LINKS_SELECT =
    "link_sessao_online, link_sessao_online_paciente, link_sessao_online_psicologo, link_sessao_online_atualizado_em";
const PATIENT_DETAILS_SELECT =
    `id, nome, email, telefone, endereco, contato_emergencia, cpf, data_nascimento, observacoes, ativo, ${PATIENT_ROOM_LINKS_SELECT}`;

export type NovoPaciente = {
    nome: string;
    data_nascimento?: string | null;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
    contato_emergencia?: string | null;
    observacoes?: string | null;
};

export type VinculoPaciente = {
    clinicId?: string | null;
    psychologistId?: string | null;
};

export type SalaOnlinePacienteInput = {
    patientLink?: string | null;
    psychologistLink?: string | null;
};

type PacienteCriado = {
    id?: string | null;
    email?: string | null;
};

export function normalizeCpfDigits(value: string) {
    return value.replace(/\D/g, "").slice(0, 11);
}

async function resolveVinculoPaciente(vinculo?: VinculoPaciente) {
    const explicitClinicId = vinculo?.clinicId?.trim() || null;
    const explicitPsychologistId = vinculo?.psychologistId?.trim() || null;
    const scope = await getPsychologistServiceScope();
    const clinicId = explicitClinicId || scope.clinicId;
    const psychologistId = explicitPsychologistId || scope.psychologistId;

    if (!psychologistId) {
        throw new Error("Nao foi possivel determinar o psicologo autenticado.");
    }

    if (explicitPsychologistId && !scope.psychologistIds.includes(explicitPsychologistId)) {
        throw new Error("Nao foi possivel cadastrar paciente para outro psicologo.");
    }

    if (explicitClinicId && explicitClinicId !== scope.clinicId) {
        throw new Error("Nao foi possivel cadastrar paciente para outra clinica.");
    }

    return {
        clinicId: clinicId || null,
        psychologistId,
        hasProfessionalAccess: scope.hasProfessionalAccess,
    };
}

async function enviarEmailCadastroManualPaciente(paciente: PacienteCriado | null | undefined) {
    const patientId = paciente?.id?.trim();
    const email = normalizeEmail(paciente?.email || "");

    if (!patientId || !email || !isValidEmail(email)) {
        return null;
    }

    const response = await fetch(buildServerApiUrl("/api/pacientes/manual-registration-email"), {
        method: "POST",
        headers: await buildAuthenticatedJsonRequestHeaders(),
        body: JSON.stringify({ patientId }),
    });

    return readServerJsonResponse<{ success: true; email: unknown }>(
        response,
        "Nao foi possivel enviar o e-mail de cadastro do paciente.",
    );
}

export async function cadastrarPaciente(paciente: NovoPaciente, vinculo?: VinculoPaciente) {
    const resolvedVinculo = await resolveVinculoPaciente(vinculo);
    assertProfessionalAccessFromScope(resolvedVinculo);
    const { data, error } = await supabase
        .from("pacientes")
        .insert([
            {
                clinica_id: resolvedVinculo.clinicId,
                psicologo_id: resolvedVinculo.psychologistId,
                nome: paciente.nome.trim(),
                data_nascimento: paciente.data_nascimento || null,
                cpf: paciente.cpf ? normalizeCpfDigits(paciente.cpf) || null : null,
                telefone: paciente.telefone ? normalizePhoneDigits(paciente.telefone) || null : null,
                email: paciente.email ? normalizeEmail(paciente.email) : null,
                endereco: paciente.endereco?.trim() || null,
                contato_emergencia: paciente.contato_emergencia?.trim() || null,
                observacoes: paciente.observacoes?.trim() || null,
                ativo: true,
            },
        ])
        .select();

    if (error) throw error;

    try {
        await enviarEmailCadastroManualPaciente(data?.[0] as PacienteCriado | null | undefined);
    } catch (emailError) {
        console.error("Erro ao enviar e-mail do cadastro manual do paciente:", emailError);
    }

    return data;
}

export async function listarPacientes() {
    const scope = await getPsychologistServiceScope();
    let query = supabase
        .from("pacientes")
        .select("id, nome, email, telefone, ativo, data_nascimento, cpf, endereco, contato_emergencia, observacoes, created_at")
        .in("psicologo_id", scope.psychologistIds)
        .order("created_at", { ascending: false });

    if (scope.clinicId) {
        query = query.eq("clinica_id", scope.clinicId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}

export async function buscarPacientePorId(id: string) {
    const scope = await getPsychologistServiceScope();
    let query = supabase
        .from("pacientes")
        .select(PATIENT_DETAILS_SELECT)
        .eq("id", id)
        .in("psicologo_id", scope.psychologistIds)
        .maybeSingle();

    if (scope.clinicId) {
        query = query.eq("clinica_id", scope.clinicId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}

export async function salvarLinksSalaOnlinePaciente(
    id: string,
    input: SalaOnlinePacienteInput,
) {
    const normalizedPatientId = id.trim();

    if (!normalizedPatientId) {
        throw new Error("Nao foi possivel identificar o paciente para salvar os links da sala online.");
    }

    const scope = await getPsychologistServiceScope();
    assertProfessionalAccessFromScope(scope);
    const normalizedPatientLink = normalizeOnlineSessionLinkInput(input?.patientLink);
    const normalizedPsychologistLink = normalizeOnlineSessionLinkInput(input?.psychologistLink);
    const payload = {
        link_sessao_online_paciente: normalizedPatientLink,
        link_sessao_online_psicologo: normalizedPsychologistLink,
        link_sessao_online_atualizado_em: new Date().toISOString(),
    };

    let query = supabase
        .from("pacientes")
        .update(payload)
        .eq("id", normalizedPatientId)
        .in("psicologo_id", scope.psychologistIds);

    if (scope.clinicId) {
        query = query.eq("clinica_id", scope.clinicId);
    }

    const { data, error } = await query
        .select(PATIENT_DETAILS_SELECT)
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw new Error("Nao foi possivel localizar o paciente para salvar os links da sala online.");
    }

    return data;
}
