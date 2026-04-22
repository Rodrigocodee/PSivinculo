import { normalizeEmail, normalizePhoneDigits } from "@/services/auth";
import { getPsychologistServiceScope } from "@/services/psychologistScope";
import { supabase } from "../lib/supabase";

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

export function normalizeCpfDigits(value: string) {
    return value.replace(/\D/g, "").slice(0, 11);
}

async function resolveVinculoPaciente(vinculo?: VinculoPaciente) {
    const explicitClinicId = vinculo?.clinicId?.trim() || null;
    const explicitPsychologistId = vinculo?.psychologistId?.trim() || null;
    const scope =
        explicitClinicId && explicitPsychologistId
            ? null
            : await getPsychologistServiceScope();
    const clinicId = explicitClinicId || scope?.clinicId;
    const psychologistId = explicitPsychologistId || scope?.psychologistId;

    if (!clinicId) {
        throw new Error("Nao foi possivel determinar a clinica do psicologo autenticado.");
    }

    return {
        clinicId,
        psychologistId,
    };
}

export async function cadastrarPaciente(paciente: NovoPaciente, vinculo?: VinculoPaciente) {
    const resolvedVinculo = await resolveVinculoPaciente(vinculo);
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
    return data;
}

export async function listarPacientes() {
    const scope = await getPsychologistServiceScope();
    let query = supabase
        .from("pacientes")
        .select("id, nome, email, telefone, ativo, data_nascimento, cpf, endereco, contato_emergencia, observacoes, created_at")
        .eq("psicologo_id", scope.psychologistId)
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
        .select("id, nome, email, telefone, endereco, contato_emergencia, cpf, data_nascimento, observacoes, ativo")
        .eq("id", id)
        .eq("psicologo_id", scope.psychologistId)
        .maybeSingle();

    if (scope.clinicId) {
        query = query.eq("clinica_id", scope.clinicId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}
