import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "@/contexts/AuthContext";
import {
  ProfessionalPreviewBanner,
  PsychologistProfessionalPreviewProvider,
} from "@/components/psychologist/ProfessionalPreview";

interface AppLayoutProps {
  children: React.ReactNode;
  role: "psychologist" | "admin" | "patient";
  userName: string;
}

export function AppLayout({ children, role, userName }: AppLayoutProps) {
  const { appUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isPsychologistPreview =
    role === "psychologist" &&
    Boolean(appUser) &&
    !appUser.needsProfileSetup &&
    !appUser.hasProfessionalAccess;

  return (
    <PsychologistProfessionalPreviewProvider enabled={isPsychologistPreview}>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
        <AppSidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar userName={userName} userRole={role} onMenuToggle={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
            <div className="min-w-0 animate-fade-in">
              {isPsychologistPreview ? (
                <div className="space-y-6">
                  <ProfessionalPreviewBanner />
                  {children}
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
    </PsychologistProfessionalPreviewProvider>
  );
}
