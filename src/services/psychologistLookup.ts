import { supabase } from "@/lib/supabase";

type PsychologistLookupTable = "usuarios" | "psicologos" | "profiles";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getLookupCandidates(table: PsychologistLookupTable, psychologistId: string) {
  if (table === "usuarios") {
    return [
      { column: "auth_id", value: psychologistId },
      { column: "id", value: psychologistId },
    ];
  }

  if (table === "psicologos") {
    return [
      { column: "id", value: psychologistId },
      { column: "psicologo_id", value: psychologistId },
    ];
  }

  return [
    { column: "id", value: psychologistId },
    { column: "user_id", value: psychologistId },
    { column: "psicologo_id", value: psychologistId },
  ];
}

export async function resolvePsychologistNameById(psychologistId: string, fallbackName = "") {
  if (!psychologistId) return fallbackName || "Psicologo(a)";

  for (const table of ["usuarios", "psicologos", "profiles"] as const) {
    for (const candidate of getLookupCandidates(table, psychologistId)) {
      const { data, error } = await supabase
        .from(table)
        .select("nome, name, full_name")
        .eq(candidate.column, candidate.value)
        .maybeSingle();

      if (error || !data || !isRecord(data)) continue;

      const resolvedName = pickString(data, ["nome", "name", "full_name"]);
      if (resolvedName) return resolvedName;
    }
  }

  return fallbackName || "Psicologo(a)";
}
