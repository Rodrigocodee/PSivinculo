import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { RedirectAuthenticated, RequireAuth } from "@/components/auth/AuthRouteGuard";
import { RequirePsychologistReceivablesEnabled } from "@/components/auth/RequirePsychologistReceivablesEnabled";
import { trackPageView } from "@/lib/analytics";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const PublicDemoPage = lazy(() => import("./pages/PublicDemoPage"));
const PlatformPsychologistsPreviewPage = lazy(() => import("./pages/PlatformPsychologistsPreviewPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const TermsOfUsePage = lazy(() => import("./pages/TermsOfUsePage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const LgpdPage = lazy(() => import("./pages/LgpdPage"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ClinicAdminRegisterPage = lazy(() => import("./pages/ClinicAdminRegisterPage"));
const PatientRegisterPage = lazy(() => import("./pages/patient/Register"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const PublicPlanCheckoutRedirectPage = lazy(() => import("./pages/PublicPlanCheckoutRedirectPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PsiProfileSetup = lazy(() => import("./pages/psychologist/ProfileSetup"));
const PsiDashboard = lazy(() => import("./pages/psychologist/Dashboard"));
const PsiAgenda = lazy(() => import("./pages/psychologist/Agenda"));
const PsiPatients = lazy(() => import("./pages/psychologist/Patients"));
const PsiPatientRegister = lazy(() => import("./pages/psychologist/PatientRegister"));
const PsiPatientDetails = lazy(() => import("./pages/psychologist/PatientDetails"));
const PsiPatientRecords = lazy(() => import("./pages/psychologist/PatientRecords"));
const PsiFinancial = lazy(() => import("./pages/psychologist/Financial"));
const PsiFinancialSettings = lazy(() => import("./pages/psychologist/FinancialSettings"));
const PsiReceivables = lazy(() => import("./pages/psychologist/Receivables"));
const PsiReports = lazy(() => import("./pages/psychologist/Reports"));
const PsiSettings = lazy(() => import("./pages/psychologist/Settings"));
const PsiConsultationSettings = lazy(() => import("./pages/psychologist/ConsultationSettings"));
const PsiPlans = lazy(() => import("./pages/psychologist/Plans"));
const PsiPaymentReturn = lazy(() => import("./pages/psychologist/PaymentReturn"));

const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminUserRegister = lazy(() => import("./pages/admin/UserRegister"));
const AdminPermissions = lazy(() => import("./pages/admin/Permissions"));
const AdminClinic = lazy(() => import("./pages/admin/Clinic"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminFinancial = lazy(() => import("./pages/admin/Financial"));
const AdminPlans = lazy(() => import("./pages/admin/Plans"));
const AdminSubscription = lazy(() => import("./pages/admin/Subscription"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminMaster = lazy(() => import("./pages/admin/Master"));

const PatientDashboard = lazy(() => import("./pages/patient/Dashboard"));
const PatientAppointments = lazy(() => import("./pages/patient/Appointments"));
const PatientDocuments = lazy(() => import("./pages/patient/Documents"));
const PatientProfile = lazy(() => import("./pages/patient/Profile"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

function AppRouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-sm text-muted-foreground">Carregando...</div>
    </div>
  );
}

function AnalyticsPageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PermissionsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AnalyticsPageViewTracker />
            <Suspense fallback={<AppRouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/demo" element={<PublicDemoPage />} />
                <Route path="/psicologos-da-plataforma" element={<PlatformPsychologistsPreviewPage />} />
                <Route path="/sobre" element={<AboutPage />} />
                <Route path="/contato" element={<ContactPage />} />
                <Route path="/termos-de-uso" element={<TermsOfUsePage />} />
                <Route path="/privacidade" element={<PrivacyPage />} />
                <Route path="/lgpd" element={<LgpdPage />} />
                <Route path="/checkout/:planKey" element={<PublicPlanCheckoutRedirectPage />} />
                <Route path="/acesso-negado" element={<AccessDenied />} />
                <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

                <Route element={<RedirectAuthenticated />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/cadastro" element={<RegisterPage />} />
                  <Route path="/cadastro/psicologo" element={<RegisterPage />} />
                  <Route path="/cadastro/clinica" element={<ClinicAdminRegisterPage />} />
                  <Route path="/cadastro/paciente" element={<PatientRegisterPage />} />
                  <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
                </Route>

                <Route element={<RequireAuth allowedRoles={["psychologist"]} />}>
                  <Route path="/cadastro/perfil-profissional" element={<PsiProfileSetup />} />
                  <Route path="/dashboard" element={<Navigate to="/psi/dashboard" replace />} />
                  <Route path="/configuracoes" element={<Navigate to="/psi/configuracoes" replace />} />
                  <Route path="/configuracoes/financeiro" element={<Navigate to="/psi/configuracoes/financeiro" replace />} />
                  <Route path="/recebimentos" element={<Navigate to="/psi/recebimentos" replace />} />
                  <Route
                    path="/psi/dashboard"
                    element={<RequireAuth moduleKey="dashboard"><PsiDashboard /></RequireAuth>}
                  />
                  <Route
                    path="/psi/agenda"
                    element={<RequireAuth moduleKey="agenda"><PsiAgenda /></RequireAuth>}
                  />
                  <Route
                    path="/psi/pacientes"
                    element={<RequireAuth moduleKey="patients"><PsiPatients /></RequireAuth>}
                  />
                  <Route
                    path="/psi/pacientes/novo"
                    element={<RequireAuth moduleKey="patients"><PsiPatientRegister /></RequireAuth>}
                  />
                  <Route
                    path="/psi/pacientes/:id"
                    element={<RequireAuth moduleKey="patients"><PsiPatientDetails /></RequireAuth>}
                  />
                  <Route
                    path="/psi/prontuarios"
                    element={<RequireAuth moduleKey="records"><PsiPatients /></RequireAuth>}
                  />
                  <Route
                    path="/psi/prontuarios/:id"
                    element={<RequireAuth moduleKey="records"><PsiPatientRecords /></RequireAuth>}
                  />
                  <Route
                    path="/psi/financeiro"
                    element={<RequireAuth moduleKey="financial"><PsiFinancial /></RequireAuth>}
                  />
                  <Route
                    path="/psi/recebimentos"
                    element={
                      <RequireAuth moduleKey="financial">
                        <RequirePsychologistReceivablesEnabled>
                          <PsiReceivables />
                        </RequirePsychologistReceivablesEnabled>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/psi/relatorios"
                    element={<RequireAuth moduleKey="reports"><PsiReports /></RequireAuth>}
                  />
                  <Route
                    path="/psi/configuracoes"
                    element={<RequireAuth moduleKey="settings"><PsiSettings /></RequireAuth>}
                  />
                  <Route
                    path="/psi/configuracoes/financeiro"
                    element={<RequireAuth moduleKey="settings"><PsiFinancialSettings /></RequireAuth>}
                  />
                  <Route
                    path="/psi/consulta-config"
                    element={<RequireAuth moduleKey="settings"><PsiConsultationSettings /></RequireAuth>}
                  />
                  <Route
                    path="/psi/planos"
                    element={<PsiPlans />}
                  />
                  <Route
                    path="/psi/pagamento/retorno"
                    element={<PsiPaymentReturn />}
                  />
                </Route>

                <Route path="/admin/master" element={<AdminMaster />} />

                <Route element={<RequireAuth allowedRoles={["admin"]} />}>
                  <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                  <Route
                    path="/admin/dashboard"
                    element={
                      <RequireAuth moduleKey="dashboard">
                        <AdminDashboard />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/usuarios"
                    element={
                      <RequireAuth moduleKey="users">
                        <AdminUsers />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/usuarios/novo"
                    element={
                      <RequireAuth moduleKey="users">
                        <AdminUserRegister />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/permissoes"
                    element={
                      <RequireAuth moduleKey="permissions">
                        <AdminPermissions />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/clinica"
                    element={
                      <RequireAuth moduleKey="clinic">
                        <AdminClinic />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/relatorios"
                    element={
                      <RequireAuth moduleKey="reports">
                        <AdminReports />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/financeiro"
                    element={
                      <RequireAuth moduleKey="financial">
                        <AdminFinancial />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/planos"
                    element={
                      <RequireAuth moduleKey="plans">
                        <AdminPlans />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/assinatura"
                    element={
                      <RequireAuth moduleKey="plans">
                        <AdminSubscription />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/configuracoes"
                    element={
                      <RequireAuth moduleKey="settings">
                        <AdminSettings />
                      </RequireAuth>
                    }
                  />
                </Route>

                <Route element={<RequireAuth allowedRoles={["patient"]} />}>
                  <Route path="/paciente" element={<Navigate to="/paciente/dashboard" replace />} />
                  <Route path="/paciente/dashboard" element={<PatientDashboard />} />
                  <Route path="/paciente/agendamentos" element={<PatientAppointments />} />
                  <Route path="/paciente/recibos" element={<PatientDocuments />} />
                  <Route path="/paciente/perfil" element={<PatientProfile />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </PermissionsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
