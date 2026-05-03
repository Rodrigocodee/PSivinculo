import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PSYCHOLOGIST_SPECIALTY_OPTIONS,
  PSYCHOLOGIST_SPECIALTY_OTHER_OPTION,
  PsychologistSpecialtySelect,
} from "@/components/psychologist/PsychologistSpecialtySelect";

describe("PsychologistSpecialtySelect", () => {
  it("renders the standardized psychology specialty options", () => {
    render(<PsychologistSpecialtySelect value="" onChange={() => {}} />);

    expect(screen.getByRole("option", { name: "Selecione sua especialidade" })).toBeInTheDocument();

    for (const option of PSYCHOLOGIST_SPECIALTY_OPTIONS) {
      expect(screen.getByRole("option", { name: option })).toBeInTheDocument();
    }
  });

  it("emits a standardized specialty when selected", () => {
    const onChange = vi.fn();
    render(<PsychologistSpecialtySelect value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Especialidade" }), {
      target: { value: "Neuropsicologia" },
    });

    expect(onChange).toHaveBeenCalledWith("Neuropsicologia");
  });

  it("preserves a previously saved custom specialty as the current option", () => {
    render(<PsychologistSpecialtySelect value="TCC" onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Especialidade" })).toHaveValue("TCC");
    expect(screen.getByRole("option", { name: "TCC (valor atual)" })).toBeInTheDocument();
  });

  it("shows a custom field when Outra is selected and emits the typed specialty", () => {
    const onChange = vi.fn();
    render(<PsychologistSpecialtySelect value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Especialidade" }), {
      target: { value: PSYCHOLOGIST_SPECIALTY_OTHER_OPTION },
    });

    const customInput = screen.getByLabelText("Informe sua especialidade");
    fireEvent.change(customInput, {
      target: { value: "Terapia Sistêmica" },
    });

    expect(onChange).toHaveBeenLastCalledWith("Terapia Sistêmica");
  });
});
