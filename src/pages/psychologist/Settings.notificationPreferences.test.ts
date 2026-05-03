// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settingsPath = resolve(process.cwd(), "src/pages/psychologist/Settings.tsx");

describe("PsychologistSettings notification preferences", () => {
  it("keeps weekly_reports disabled while weekly reports are not implemented", () => {
    const source = readFileSync(settingsPath, "utf8");

    expect(source).toContain("weekly_reports: false");
    expect(source).toContain('label: "Relatorios semanais"');
    expect(source).toContain('desc: "Em breve"');
    expect(source).toContain("disabled: true");
    expect(source).toContain("checked={item.disabled ? false : notifications[item.key]}");
  });

  it("keeps professional settings saves blocked while the psychologist is in preview", () => {
    const source = readFileSync(settingsPath, "utf8");

    expect(source).toContain('appUser?.role === "psychologist"');
    expect(source).toContain("appUser.hasProfessionalAccess === false");
    expect(source).toContain("toast.error(PREVIEW_FEATURE_LOCK_MESSAGE)");
    expect(source).toContain("description: PREVIEW_FEATURE_LOCK_MESSAGE");
  });
});
