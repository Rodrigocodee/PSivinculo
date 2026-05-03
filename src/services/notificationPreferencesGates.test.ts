// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260502140000_gate_consultation_request_notifications_by_preferences.sql",
);

describe("consultation request notification preference gates migration", () => {
  it("gates every SQL notification trigger in the request flow by patient_confirmation", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const functionName of [
      "notify_psychologist_about_consulta_request",
      "notify_patient_about_consulta_response",
      "notify_psychologist_about_counterproposal_refusal",
    ]) {
      const functionBody = sql.slice(
        sql.indexOf(`create or replace function public.${functionName}`),
      );
      const nextFunctionIndex = functionBody.indexOf("\ncreate or replace function public.", 1);
      const scopedBody = nextFunctionIndex === -1
        ? functionBody
        : functionBody.slice(0, nextFunctionIndex);

      expect(scopedBody).toContain(
        "public.psychologist_notification_preference_enabled(new.psicologo_id, 'patient_confirmation')",
      );
    }
  });
});
