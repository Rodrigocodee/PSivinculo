import { Link } from "react-router-dom";
import { Brain } from "lucide-react";

const NotFound = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-6">
    <div className="text-center max-w-md animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <Brain className="w-10 h-10 text-primary" />
      </div>
      <h1 className="font-heading text-6xl font-bold text-foreground">404</h1>
      <p className="mt-3 text-lg text-muted-foreground">Página não encontrada</p>
      <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe ou foi movida.</p>
      <Link to="/" className="mt-8 inline-flex items-center px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm">Voltar ao Início</Link>
    </div>
  </div>
);

export default NotFound;
