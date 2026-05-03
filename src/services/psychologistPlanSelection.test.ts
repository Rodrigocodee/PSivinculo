import { describe, expect, it } from "vitest";
import {
  listPsychologistIndividualPlans,
  psychologistPlansRoute,
} from "@/services/psychologistPlanSelection";

describe("psychologist plan selection", () => {
  it("uses the dedicated psychologist plans route", () => {
    expect(psychologistPlansRoute).toBe("/psi/planos");
  });

  it("lists only individual psychologist plans", () => {
    const plans = listPsychologistIndividualPlans();

    expect(plans.map((plan) => plan.slug)).toEqual(["essencial", "profissional"]);
    expect(plans.some((plan) => plan.slug.startsWith("clinica"))).toBe(false);
    expect(plans.find((plan) => plan.slug === "profissional")?.recommended).toBe(true);
  });
});
