import { Link, useNavigate } from "react-router-dom";
import { Brain, Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { signOutCurrentSession, updateAuthenticatedPassword } from "@/services/auth";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!newPassword.trim()) {
      setErrorMessage("Informe sua nova senha.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("A confirmacao da senha nao confere.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateAuthenticatedPassword(newPassword);
      await signOutCurrentSession();
      toast.success("Senha redefinida com sucesso. Entre novamente para continuar.");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.";
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
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Definir nova senha</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Escolha uma nova senha para concluir a recuperacao da sua conta.
          </p>

          {!isLoading && !isAuthenticated ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left text-sm text-destructive">
              O link de redefinicao e invalido ou expirou. Solicite um novo link para continuar.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-left text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <form className="mt-6 space-y-4 text-left" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="********"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all pr-12"
                  disabled={isSubmitting || (!isLoading && !isAuthenticated)}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar nova senha</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="********"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all pr-12"
                  disabled={isSubmitting || (!isLoading && !isAuthenticated)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (!isLoading && !isAuthenticated)}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Salvando..." : "Salvar nova senha"}
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
