import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  resolveAuthenticatedAppUser,
  type AuthenticatedAppUser,
} from "@/services/auth";

type AuthContextValue = {
  session: Session | null;
  appUser: AuthenticatedAppUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AuthenticatedAppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function syncAuthState(nextSession?: Session | null) {
    const resolvedSession =
      nextSession !== undefined ? nextSession : (await supabase.auth.getSession()).data.session;

    setSession(resolvedSession ?? null);

    if (!resolvedSession?.user) {
      setAppUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const resolvedAppUser = await resolveAuthenticatedAppUser(resolvedSession.user);
      setAppUser(resolvedAppUser);
    } catch (error) {
      console.error("Erro ao resolver usuario autenticado:", error);
      setAppUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      setIsLoading(true);

      try {
        const currentSession = (await supabase.auth.getSession()).data.session;
        if (!isMounted) return;
        await syncAuthState(currentSession);
      } catch (error) {
        console.error("Erro ao carregar sessao:", error);
        if (!isMounted) return;
        setSession(null);
        setAppUser(null);
        setIsLoading(false);
      }
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setIsLoading(true);
      void syncAuthState(nextSession);
    });

    async function refreshOnForeground() {
      if (!isMounted) return;
      if (document.visibilityState === "hidden") return;
      await syncAuthState();
    }

    window.addEventListener("focus", refreshOnForeground);
    document.addEventListener("visibilitychange", refreshOnForeground);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshOnForeground);
      document.removeEventListener("visibilitychange", refreshOnForeground);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        appUser,
        isAuthenticated: Boolean(session?.user),
        isLoading,
        refreshAuth: async () => {
          setIsLoading(true);
          await syncAuthState();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
