import { Mail, MessageCircle, Phone } from "lucide-react";
import { SUPPORT_CONTACT, SUPPORT_LINKS } from "@/config/support";
import { cn } from "@/lib/utils";

type HelpCenterCardProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  showBusinessHours?: boolean;
  variant?: "default" | "sidebar";
};

export function HelpCenterCard({
  className,
  title = "Precisa de ajuda?",
  subtitle = "Fale com nosso suporte pelos canais abaixo.",
  showBusinessHours = true,
  variant = "default",
}: HelpCenterCardProps) {
  const isSidebar = variant === "sidebar";

  if (isSidebar) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.25rem] border border-border/60 bg-card/90 p-3 shadow-[var(--shadow-sm)]",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsla(var(--secondary),0.1),transparent_38%),radial-gradient(circle_at_bottom_right,hsla(var(--primary),0.08),transparent_34%)]" />

        <div className="relative">
          <div>
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={SUPPORT_LINKS.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[0.9rem] border border-border/70 bg-background/85 px-3 text-[11px] font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card"
            >
              <MessageCircle className="h-3.5 w-3.5 text-primary" />
              <span>WhatsApp</span>
            </a>

            <a
              href={SUPPORT_LINKS.mailtoUrl}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[0.9rem] border border-border/70 bg-background/85 px-3 text-[11px] font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card"
            >
              <Mail className="h-3.5 w-3.5 text-secondary" />
              <span>E-mail</span>
            </a>
          </div>

          <div className="mt-2.5 space-y-1.5">
            <a
              href={SUPPORT_LINKS.telUrl}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="h-3 w-3 shrink-0" />
              <span>{SUPPORT_CONTACT.phoneDisplay}</span>
            </a>

            <a
              href={SUPPORT_LINKS.mailtoUrl}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{SUPPORT_CONTACT.supportEmail}</span>
            </a>
          </div>

          {showBusinessHours ? (
            <div className="mt-2.5 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
              Resposta em horario comercial
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-4 premium-shadow",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "bg-[radial-gradient(circle_at_top_left,hsla(var(--secondary),0.18),transparent_38%),radial-gradient(circle_at_bottom_right,hsla(var(--primary),0.12),transparent_36%)]",
        )}
      />

      <div className="relative">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>

        <div className="mt-4 space-y-3">
          <a
            href={SUPPORT_LINKS.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-background/90 p-3 shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card"
          >
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <MessageCircle className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                WhatsApp
              </span>
              <span className="mt-1 block text-sm font-semibold text-foreground">
                {SUPPORT_CONTACT.phoneDisplay}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Abrir conversa com o suporte
              </span>
            </span>
          </a>

          <a
            href={SUPPORT_LINKS.mailtoUrl}
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-background/90 p-3 shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-card"
          >
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-secondary/12 text-secondary transition-colors group-hover:bg-secondary/18">
              <Mail className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">
                E-mail
              </span>
              <span className="mt-1 block break-all text-sm font-semibold text-foreground">
                {SUPPORT_CONTACT.supportEmail}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Enviar mensagem por e-mail
              </span>
            </span>
          </a>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <a
            href={SUPPORT_LINKS.telUrl}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Ligar agora</span>
          </a>

          {showBusinessHours ? (
            <span className="text-[11px] text-muted-foreground">{SUPPORT_CONTACT.businessHoursLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
