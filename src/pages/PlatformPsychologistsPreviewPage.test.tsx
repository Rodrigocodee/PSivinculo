import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PlatformPsychologistsPreviewPage from "./PlatformPsychologistsPreviewPage";
import { platformPsychologistsPreview } from "@/data/platformPsychologistsPreview";

const toastMock = vi.fn();

vi.mock("@/components/ui/sonner", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PlatformPsychologistsPreviewPage />
    </MemoryRouter>,
  );
}

describe("PlatformPsychologistsPreviewPage", () => {
  it("renders the coming soon teaser with mocked psychologists", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Psicólogos da plataforma" })).toBeInTheDocument();
    expect(screen.getAllByText("Em breve").length).toBeGreaterThan(0);
    expect(screen.getByText(/pacientes poderão encontrar profissionais da plataforma/i)).toBeInTheDocument();
    expect(screen.getByText("Especialidade")).toBeInTheDocument();
    expect(screen.getByText("Modalidade")).toBeInTheDocument();
    expect(screen.getByText("Cidade/Estado")).toBeInTheDocument();
    expect(screen.getByText("Atendimento online")).toBeInTheDocument();

    for (const psychologist of platformPsychologistsPreview) {
      expect(screen.getByText(psychologist.name)).toBeInTheDocument();
      expect(screen.getByText(psychologist.specialty)).toBeInTheDocument();
    }
  });

  it("keeps future actions visual only through the coming soon toast", () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /Ver perfil/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Solicitar/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Quero saber quando lançar/i })[0]);

    expect(toastMock).toHaveBeenCalledTimes(3);
    expect(toastMock).toHaveBeenCalledWith("Em breve você poderá usar este recurso.");
  });
});
