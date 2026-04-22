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
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar role={role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar userName={userName} userRole={role} onMenuToggle={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <div className="animate-fade-in">
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
