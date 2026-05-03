import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";

export const PSYCHOLOGIST_SPECIALTY_OTHER_OPTION = "Outra";

export const PSYCHOLOGIST_SPECIALTY_OPTIONS = [
  "Psicologia Clínica",
  "Terapia Cognitivo-Comportamental",
  "Psicanálise",
  "Psicologia Infantil",
  "Psicologia Hospitalar",
  "Neuropsicologia",
  "Psicologia Organizacional",
  "Psicologia Escolar",
  "Psicologia Jurídica",
  "Psicologia Social",
  "Psicologia do Esporte",
  "Psicologia do Trânsito",
  "Psicopedagogia",
  "Terapia de Casal",
  "Orientação Profissional",
  "Avaliação Psicológica",
  "Cuidados Paliativos",
  PSYCHOLOGIST_SPECIALTY_OTHER_OPTION,
] as const;

const SPECIALTY_PLACEHOLDER = "Selecione sua especialidade";

type PsychologistSpecialtySelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  selectClassName?: string;
  customInputClassName?: string;
};

function normalizeSpecialty(value: string | null | undefined) {
  return value?.trim() || "";
}

function isKnownSpecialty(value: string) {
  return PSYCHOLOGIST_SPECIALTY_OPTIONS.some((option) => option === value);
}

function resolveInitialSelectValue(value: string) {
  const normalizedValue = normalizeSpecialty(value);
  if (!normalizedValue) return "";
  return isKnownSpecialty(normalizedValue) ? normalizedValue : normalizedValue;
}

export function PsychologistSpecialtySelect({
  value,
  onChange,
  disabled,
  selectClassName,
  customInputClassName,
}: PsychologistSpecialtySelectProps) {
  const customInputId = useId();
  const normalizedValue = normalizeSpecialty(value);
  const [selectValue, setSelectValue] = useState(resolveInitialSelectValue(value));
  const [customValue, setCustomValue] = useState(
    normalizedValue && !isKnownSpecialty(normalizedValue) ? normalizedValue : "",
  );
  const internalChangeRef = useRef(false);
  const hasCustomSavedValue = Boolean(normalizedValue && !isKnownSpecialty(normalizedValue));
  const isCustomInputVisible = selectValue === PSYCHOLOGIST_SPECIALTY_OTHER_OPTION;

  useEffect(() => {
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }

    const nextValue = normalizeSpecialty(value);

    if (!nextValue) {
      setSelectValue("");
      setCustomValue("");
      return;
    }

    if (isKnownSpecialty(nextValue)) {
      setSelectValue(nextValue);
      setCustomValue("");
      return;
    }

    setSelectValue(nextValue);
    setCustomValue(nextValue);
  }, [value]);

  function emitChange(nextValue: string) {
    internalChangeRef.current = true;
    onChange(nextValue);
  }

  function handleSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value;
    setSelectValue(nextValue);

    if (nextValue === PSYCHOLOGIST_SPECIALTY_OTHER_OPTION) {
      const nextCustomValue = hasCustomSavedValue ? normalizedValue : "";
      setCustomValue(nextCustomValue);
      emitChange(nextCustomValue);
      return;
    }

    setCustomValue("");
    emitChange(nextValue);
  }

  function handleCustomChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setCustomValue(nextValue);
    emitChange(nextValue);
  }

  return (
    <div className="space-y-3">
      <select
        value={selectValue}
        onChange={handleSelectChange}
        aria-label="Especialidade"
        className={cn(
          "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20",
          selectClassName,
        )}
        disabled={disabled}
      >
        <option value="" disabled>
          {SPECIALTY_PLACEHOLDER}
        </option>
        {hasCustomSavedValue ? (
          <option value={normalizedValue}>{normalizedValue} (valor atual)</option>
        ) : null}
        {PSYCHOLOGIST_SPECIALTY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {isCustomInputVisible ? (
        <div>
          <label htmlFor={customInputId} className="mb-1.5 block text-sm font-medium text-foreground">
            Informe sua especialidade
          </label>
          <input
            id={customInputId}
            type="text"
            value={customValue}
            onChange={handleCustomChange}
            placeholder="Informe sua especialidade"
            className={cn(
              "w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-ring/20",
              customInputClassName || selectClassName,
            )}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
