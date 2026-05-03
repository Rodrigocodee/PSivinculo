import { describe, expect, it } from "vitest";
import { evaluatePsychologistProfessionalProfileCompletion } from "@/services/psychologistProfessionalProfile";

describe("psychologist professional profile completion", () => {
  it("does not require CPF when public.usuarios does not expose a cpf field", () => {
    const completion = evaluatePsychologistProfessionalProfileCompletion({
      row: {
        nome: "Dra. Camila",
        telefone: "11999998888",
        crp: "123456",
        especialidade: "TCC",
      },
    });

    expect(completion.usesCpfField).toBe(false);
    expect(completion.isComplete).toBe(true);
    expect(completion.fields.map((field) => field.key)).not.toContain("cpf");
  });

  it("requires CPF only when the real usuarios row has cpf", () => {
    const completion = evaluatePsychologistProfessionalProfileCompletion({
      row: {
        nome: "Dra. Camila",
        telefone: "11999998888",
        cpf: "",
        crp: "123456",
        especialidade: "TCC",
      },
    });

    expect(completion.usesCpfField).toBe(true);
    expect(completion.isComplete).toBe(false);
    expect(completion.missingFields.map((field) => field.key)).toEqual(["cpf"]);
  });

  it("marks profile incomplete when phone, CRP or specialty are missing", () => {
    const completion = evaluatePsychologistProfessionalProfileCompletion({
      row: {
        nome: "Dra. Camila",
        telefone: "11",
        crp: "12",
        especialidade: "",
      },
    });

    expect(completion.isComplete).toBe(false);
    expect(completion.missingFields.map((field) => field.key)).toEqual([
      "telefone",
      "crp",
      "especialidade",
    ]);
  });
});
