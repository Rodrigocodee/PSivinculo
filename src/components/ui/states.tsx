import { Loader2, Inbox, SearchX } from "lucide-react";

export function LoadingState({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function EmptyState({ title = "Nenhum dado encontrado", message = "Não há informações para exibir no momento.", icon: Icon = Inbox }: { title?: string; message?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-heading font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">{message}</p>
    </div>
  );
}

export function NoResultsState({ query = "" }: { query?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <SearchX className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-heading font-semibold text-foreground">Sem resultados</h3>
      <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
        {query ? `Nenhum resultado encontrado para "${query}".` : "Tente ajustar os filtros ou termos de busca."}
      </p>
    </div>
  );
}
