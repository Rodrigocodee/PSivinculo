import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicDemoPage from "@/pages/PublicDemoPage";
import { PUBLIC_DEMO_ACTION_MESSAGE } from "@/data/publicDemo";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

function renderDemo() {
  render(
    <MemoryRouter>
      <PublicDemoPage />
    </MemoryRouter>,
  );
}

describe("PublicDemoPage", () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
  });

  it("renders the public demo with mocked professional data", () => {
    renderDemo();

    expect(screen.getByText(/Você está vendo uma demonstração/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Consultas hoje")).toBeInTheDocument();
    expect(screen.getByText("Marina L.")).toBeInTheDocument();
  });

  it("navigates between demo areas without requiring login", () => {
    renderDemo();

    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));

    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Agenda demonstrativa")).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento")).toBeInTheDocument();
  });

  it("blocks simulated real actions with the public demo message", () => {
    renderDemo();

    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Novo agendamento" })[0]);

    expect(toastErrorMock).toHaveBeenCalledWith(PUBLIC_DEMO_ACTION_MESSAGE);
  });

  it("keeps demo CTAs pointed to signup or login", () => {
    renderDemo();

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    expect(screen.getAllByRole("link", { name: "Criar conta" })[0]).toHaveAttribute("href", "/cadastro");
    expect(screen.getByRole("link", { name: "Escolher plano" })).toHaveAttribute(
      "href",
      "/cadastro?origem=demo&acao=plano",
    );
  });

  it("does not import real data or backend service clients", () => {
    const pageSource = readFileSync("src/pages/PublicDemoPage.tsx", "utf8");
    const dataSource = readFileSync("src/data/publicDemo.ts", "utf8");
    const combinedSource = `${pageSource}\n${dataSource}`;

    expect(combinedSource).not.toMatch(/from ["']@\/lib\/supabase["']/);
    expect(combinedSource).not.toMatch(/from ["']@\/services\//);
    expect(combinedSource).not.toContain("fetch(");
    expect(combinedSource).not.toContain("serverApi");
  });
});
