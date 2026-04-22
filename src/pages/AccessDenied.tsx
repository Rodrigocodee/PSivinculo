import { ShieldX } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export default function AccessDenied() {
  const location = useLocation();
  const message =
    typeof location.state === "object" &&
    location.state &&
    "message" in location.state &&
    typeof location.state.message === "string" &&
    location.state.message.trim()
      ? location.state.message
      : "Voce nao possui permissao para acessar esta area. Entre em contato com o administrador.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Acesso Negado</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        <Link to="/" className="mt-8 inline-flex items-center px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm">Voltar ao Inicio</Link>
      </div>
    </div>
  );
}
