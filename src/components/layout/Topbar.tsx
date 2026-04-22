import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAdminClinic } from "@/hooks/use-current-admin-clinic";
import { useCurrentPatientProfile } from "@/hooks/use-current-patient-profile";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePsychologistNotifications } from "@/hooks/use-psychologist-notifications";
import { usePatientNotifications } from "@/hooks/use-patient-notifications";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { getInitials, resolveAvatarUrl } from "@/services/currentPsychologist";
import { useNavigate } from "react-router-dom";
import { usePsychologistProfessionalPreview } from "@/components/psychologist/ProfessionalPreview";
import { useAuth } from "@/contexts/AuthContext";
import type { PsychologistGlobalSearchResult } from "@/services/psychologistGlobalSearch";
import { patientAppointmentsQueryKey } from "@/services/patientAppointments";
import type { PatientNotification } from "@/services/patientNotifications";
import type { PsychologistNotification } from "@/services/psychologistNotifications";

interface TopbarProps {
  userName: string;
  userRole: string;
  onMenuToggle?: () => void;
}

let psychologistSearchModulePromise: Promise<typeof import("@/services/psychologistGlobalSearch")> | null = null;

function loadPsychologistSearchModule() {
  if (!psychologistSearchModulePromise) {
    psychologistSearchModulePromise = import("@/services/psychologistGlobalSearch");
  }

  return psychologistSearchModulePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return "";

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

export function Topbar({ userName, userRole, onMenuToggle }: TopbarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appUser } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<PsychologistGlobalSearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchRequestRef = useRef(0);
  const isPsychologist = userRole === "psychologist";
  const isPatient = userRole === "patient";
  const isAdmin = userRole === "admin";
  const { isPreviewMode } = usePsychologistProfessionalPreview();
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);
  const { data: adminClinicData } = useCurrentAdminClinic(isAdmin);
  const { data: patientProfileData } = useCurrentPatientProfile(isPatient);
  const {
    data: psychologistNotifications = [],
    isLoading: isLoadingPsychologistNotifications,
    markAsRead: markPsychologistNotificationsAsRead,
  } = usePsychologistNotifications(isPsychologist);
  const {
    data: patientNotifications = [],
    isLoading: isLoadingPatientNotifications,
    markAsRead: markPatientNotificationsAsRead,
  } = usePatientNotifications(isPatient);

  const notifications = isPsychologist ? psychologistNotifications : isPatient ? patientNotifications : [];
  const isLoadingNotifications = isPsychologist
    ? isLoadingPsychologistNotifications
    : isPatient
      ? isLoadingPatientNotifications
      : false;
  const psychologistMetadata = isRecord(appUser?.user.user_metadata) ? appUser.user.user_metadata : null;
  const psychologistImmediateName = appUser?.fullName?.trim() || userName;
  const psychologistImmediateAvatar = resolveAvatarUrl(
    pickString(psychologistMetadata, ["avatar_url"]) ||
      pickString(appUser?.record || null, ["avatar_url", "avatar"]),
  );
  const resolvedAdminDisplayName = adminClinicData?.clinicName || userName;
  const resolvedUserName = isPsychologist
    ? psychologistImmediateName
    : isPatient
      ? patientProfileData?.fullName || userName
      : resolvedAdminDisplayName;
  const avatarUrl = isPsychologist
    ? psychologistImmediateAvatar || null
    : isPatient
      ? patientProfileData?.avatarUrl || null
      : adminClinicData?.logoUrl || null;
  const avatarFallbackName = isAdmin
    ? adminClinicData?.clinicName || resolvedUserName
    : resolvedUserName;
  const unreadCount = notifications.filter((item) => !item.read).length;
  const roleLabel = userRole === "psychologist" ? "Psicologo(a)" : userRole === "admin" ? "Administrador(a)" : "Paciente";
  const trimmedSearchTerm = searchTerm.trim();
  const canSearch = isPsychologist && trimmedSearchTerm.length >= 2;
  const shouldShowSearchDropdown = isSearchOpen && canSearch;

  function closeDropdowns() {
    setShowNotifications(false);
    setShowProfile(false);
    setIsSearchOpen(false);
  }

  function getProfileRoute() {
    if (userRole === "psychologist") return "/psi/configuracoes#perfil";
    if (userRole === "patient") return "/paciente/perfil";
    if (userRole === "admin") return "/admin/clinica";
    return "/login";
  }

  function getSettingsRoute() {
    if (userRole === "psychologist") return "/psi/consulta-config";
    if (userRole === "admin") return "/admin/configuracoes";
    if (userRole === "patient") return "/paciente/perfil";
    return "/login";
  }

  function getSecondaryMenuLabel() {
    if (userRole === "psychologist") return "Consulta";
    if (userRole === "admin") return "Configuracoes";
    if (userRole === "patient") return "Perfil";
    return "Configuracoes";
  }

  function handleGoToProfile() {
    closeDropdowns();
    navigate(getProfileRoute());
  }

  function handleGoToSettings() {
    closeDropdowns();
    navigate(getSettingsRoute());
  }

  function clearSearch() {
    searchRequestRef.current += 1;
    setSearchTerm("");
    setSearchResults([]);
    setSearchError(null);
    setIsSearchOpen(false);
    setIsSearching(false);
  }

  function handleSearchResultClick(result: PsychologistGlobalSearchResult) {
    if (result.type === "patient") {
      clearSearch();
      navigate(`/psi/pacientes/${result.patientId}`);
      return;
    }

    const appointmentDate = new Date(result.appointmentDate);
    const dateParam = Number.isNaN(appointmentDate.getTime())
      ? ""
      : [
          appointmentDate.getFullYear(),
          String(appointmentDate.getMonth() + 1).padStart(2, "0"),
          String(appointmentDate.getDate()).padStart(2, "0"),
        ].join("-");

    clearSearch();
    navigate(`/psi/agenda?consultaId=${result.consultationId}&data=${dateParam}`);
  }

  async function handlePsychologistNotificationClick(notification: PsychologistNotification) {
    try {
      if (!notification.read) {
        await markPsychologistNotificationsAsRead([notification.id]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel marcar a notificacao como lida.";
      toast.error(message);
    }

    closeDropdowns();

    if (notification.routeDestination) {
      navigate(notification.routeDestination);
    }
  }

  async function handlePatientNotificationClick(notification: PatientNotification) {
    try {
      if (!notification.read) {
        await markPatientNotificationsAsRead([notification.id]);
      }

      if (
        notification.entityType === "consulta" ||
        notification.routeDestination?.startsWith("/paciente/agendamentos")
      ) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: patientAppointmentsQueryKey }),
          queryClient.invalidateQueries({ queryKey: ["patient-dashboard"] }),
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel marcar a notificacao como lida.";
      toast.error(message);
    }

    closeDropdowns();

    if (notification.routeDestination) {
      navigate(notification.routeDestination);
    }
  }

  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
      closeDropdowns();
      toast.success("Sessao encerrada com sucesso.");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel encerrar a sessao.";
      toast.error(message);
    }
  }

  useEffect(() => {
    if (!isPsychologist) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setIsSearchOpen(false);
      setIsSearching(false);
      return;
    }

    const trimmedQuery = debouncedSearchTerm.trim();
    if (trimmedQuery.length < 2) {
      searchRequestRef.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setIsSearching(true);
    setSearchError(null);

    loadPsychologistSearchModule()
      .then(({ searchPsychologistGlobal }) => searchPsychologistGlobal(trimmedQuery))
      .then((results) => {
        if (searchRequestRef.current !== requestId) return;
        setSearchResults(results);
        setIsSearchOpen(true);
      })
      .catch((error) => {
        if (searchRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : "Nao foi possivel buscar agora.";
        setSearchResults([]);
        setSearchError(message);
      })
      .finally(() => {
        if (searchRequestRef.current !== requestId) return;
        setIsSearching(false);
      });
  }, [debouncedSearchTerm, isPsychologist]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchContainerRef.current) return;
      if (!searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="rounded-lg p-2 transition-colors hover:bg-muted lg:hidden">
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div ref={searchContainerRef} className="relative hidden sm:block">
          <div className="flex w-64 items-center gap-2 rounded-lg bg-muted px-3 py-2 lg:w-80">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchError(null);
                setIsSearchOpen(true);
                setShowNotifications(false);
                setShowProfile(false);
              }}
              onFocus={() => {
                if (trimmedSearchTerm.length >= 2) {
                  setIsSearchOpen(true);
                }
              }}
              placeholder="Buscar pacientes, consultas..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {shouldShowSearchDropdown ? (
            <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="max-h-80 overflow-y-auto p-2">
                {isSearching ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Buscando...</div>
                ) : searchError ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-destructive">{searchError}</div>
                ) : searchResults.length === 0 ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{result.subtitle}</p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {result.label}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
              setIsSearchOpen(false);
            }}
            className="relative rounded-lg p-2 transition-colors hover:bg-muted"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {showNotifications ? (
            <div className="absolute right-0 top-12 z-50 w-80 animate-scale-in rounded-xl border border-border bg-card p-4 shadow-lg">
              <h3 className="mb-3 font-heading text-sm font-semibold">Notificacoes</h3>
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {isLoadingNotifications ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Carregando notificacoes...</div>
                ) : notifications.length === 0 ? (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Nenhuma notificacao no momento.</div>
                ) : (
                  notifications.map((notification) => {
                    const content = (
                      <>
                        <p className="font-medium text-foreground">{notification.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{notification.message}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{notification.time}</p>
                      </>
                    );
                    const notificationClasses = notification.read
                      ? "bg-muted/50"
                      : "border border-primary/10 bg-primary/5";

                    if (isPsychologist) {
                      const psychologistNotification = notification as PsychologistNotification;

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void handlePsychologistNotificationClick(psychologistNotification)}
                          className={`w-full rounded-lg p-3 text-left text-sm transition-colors hover:bg-muted/70 ${notificationClasses}`}
                        >
                          {content}
                        </button>
                      );
                    }

                    if (isPatient) {
                      const patientNotification = notification as PatientNotification;

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void handlePatientNotificationClick(patientNotification)}
                          className={`w-full rounded-lg p-3 text-left text-sm transition-colors hover:bg-muted/70 ${notificationClasses}`}
                        >
                          {content}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={notification.id}
                        className={`rounded-lg p-3 text-sm ${notificationClasses}`}
                      >
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
              setIsSearchOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full gradient-primary text-sm font-semibold text-primary-foreground">
              {avatarUrl ? (
                <img src={avatarUrl} alt={avatarFallbackName} decoding="async" className="h-full w-full object-cover" />
              ) : (
                getInitials(avatarFallbackName)
              )}
            </div>
            <div className="hidden text-left md:block">
              <p className="leading-tight text-sm font-medium text-foreground">{resolvedUserName}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
                {isPsychologist && isPreviewMode ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                    Preview
                  </span>
                ) : null}
              </div>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
          </button>

          {showProfile ? (
            <div className="absolute right-0 top-12 z-50 w-48 animate-scale-in rounded-xl border border-border bg-card p-2 shadow-lg">
              <button onClick={handleGoToProfile} className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted">Meu Perfil</button>
              <button onClick={handleGoToSettings} className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted">{getSecondaryMenuLabel()}</button>
              <hr className="my-1 border-border" />
              <button onClick={handleLogout} className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-muted">Sair</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
