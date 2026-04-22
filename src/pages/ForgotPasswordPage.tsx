import { Link } from "react-router-dom";
import { Brain, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { isValidEmail, requestPasswordReset } from "@/services/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!isValidEmail(email)) {
      setErrorMessage("Informe um e-mail válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      const message = "Enviamos um link de recuperação para o seu e-mail.";
      setSuccessMessage(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar o link de recuperação.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl text-foreground">Psivínculo</span>
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Recuperar Senha</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.
          </p>

          {errorMessage ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-6 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-left text-sm text-success">
              {successMessage}
            </div>
          ) : null}

          <form className="mt-6 space-y-4 text-left" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Enviando..." : "Enviar Link de Recuperação"}
            </button>
          </form>

          <Link to="/login" className="inline-block mt-6 text-sm text-primary hover:underline">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
