import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  const appUserRef = useRef<AuthenticatedAppUser | null>(null);
  const lastResolvedSessionKeyRef = useRef<string | null>(null);
  const lastAuthSyncAtRef = useRef(0);
  const syncAuthStatePromiseRef = useRef<Promise<void> | null>(null);

  function updateAppUser(nextAppUser: AuthenticatedAppUser | null) {
    appUserRef.current = nextAppUser;
    setAppUser(nextAppUser);
  }

  function getSessionSyncKey(nextSession: Session | null) {
    if (!nextSession?.user) return "anonymous";
    return `${nextSession.user.id}:${nextSession.expires_at ?? ""}`;
  }

  async function syncAuthState(
    nextSession?: Session | null,
    options: { force?: boolean } = {},
  ) {
    if (syncAuthStatePromiseRef.current && !options.force) {
      return syncAuthStatePromiseRef.current;
    }

    const syncPromise = (async () => {
      const resolvedSession =
        nextSession !== undefined ? nextSession : (await supabase.auth.getSession()).data.session;
      const sessionSyncKey = getSessionSyncKey(resolvedSession ?? null);
      const isRecentSameSession =
        lastResolvedSessionKeyRef.current === sessionSyncKey &&
        Date.now() - lastAuthSyncAtRef.current < 120_000;

      setSession(resolvedSession ?? null);

      if (!resolvedSession?.user) {
        updateAppUser(null);
        lastResolvedSessionKeyRef.current = sessionSyncKey;
        lastAuthSyncAtRef.current = Date.now();
        setIsLoading(false);
        return;
      }

      if (!options.force && appUserRef.current && isRecentSameSession) {
        setIsLoading(false);
        return;
      }

      try {
        const resolvedAppUser = await resolveAuthenticatedAppUser(resolvedSession.user);
        updateAppUser(resolvedAppUser);
        lastResolvedSessionKeyRef.current = sessionSyncKey;
        lastAuthSyncAtRef.current = Date.now();
      } catch (error) {
        console.error("Erro ao resolver usuario autenticado:", error);
        updateAppUser(null);
      } finally {
        setIsLoading(false);
      }
    })();

    syncAuthStatePromiseRef.current = syncPromise;

    try {
      await syncPromise;
    } finally {
      if (syncAuthStatePromiseRef.current === syncPromise) {
        syncAuthStatePromiseRef.current = null;
      }
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
        updateAppUser(null);
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
          await syncAuthState(undefined, { force: true });
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
