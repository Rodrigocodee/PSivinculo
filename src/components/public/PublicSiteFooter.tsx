import { Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { publicFooterColumns, type PublicSiteLink } from "@/components/public/siteConfig";

function renderFooterLink(link: PublicSiteLink) {
  const isHashNavigation = link.href.includes("#");
  const isExternal = link.external || /^https?:\/\//.test(link.href) || link.href.startsWith("mailto:");
  const key = `${link.label}-${link.href}`;

  if (isHashNavigation || isExternal) {
    return (
      <a
        key={key}
        href={link.href}
        className="transition-colors hover:text-foreground"
        target={isExternal && /^https?:\/\//.test(link.href) ? "_blank" : undefined}
        rel={isExternal && /^https?:\/\//.test(link.href) ? "noreferrer" : undefined}
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link key={key} to={link.href} className="transition-colors hover:text-foreground">
      {link.label}
    </Link>
  );
}

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-white/60 bg-white/54 px-4 py-16 backdrop-blur-sm">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.45fr,1fr,1fr,1fr]">
          <div className="rounded-[1.6rem] border border-white/72 bg-white/72 p-6 shadow-[0_20px_56px_-42px_rgba(45,58,109,0.24)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] gradient-primary shadow-[0_16px_38px_-24px_hsl(220_65%_60%/0.72)]">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-heading text-xl font-bold tracking-[-0.03em] text-foreground">Psivínculo</span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground/42">
                  clareza, cuidado e presença
                </p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-7 text-foreground/64">
              A plataforma completa para psicólogos e clínicas que querem unir gestão, experiência premium
              e operação mais profissional.
            </p>
          </div>

          {publicFooterColumns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-foreground/76">
                {column.title}
              </h4>
              <ul className="space-y-3 text-sm text-foreground/62">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>{renderFooterLink(link)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/65 pt-6 text-sm text-foreground/52 md:flex-row md:items-center md:justify-between">
          <p>© 2026 Psivínculo. Todos os direitos reservados.</p>
          <p>Feito para profissionais que valorizam clareza, cuidado e presença.</p>
        </div>
      </div>
    </footer>
  );
}
