import type { ReactNode } from "react";
import { Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicSiteFooter } from "@/components/public/PublicSiteFooter";
import { publicHeaderLinks, type PublicSiteLink } from "@/components/public/siteConfig";

function renderHeaderLink(link: PublicSiteLink) {
  const key = `${link.label}-${link.href}`;

  if (link.href.includes("#")) {
    return (
      <a
        key={key}
        href={link.href}
        className="rounded-full px-4 py-2 text-sm font-medium text-foreground/68 transition-all hover:bg-primary/8 hover:text-foreground"
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link
      key={key}
      to={link.href}
      className="rounded-full px-4 py-2 text-sm font-medium text-foreground/68 transition-all hover:bg-primary/8 hover:text-foreground"
    >
      {link.label}
    </Link>
  );
}

type InstitutionalPageLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function InstitutionalPageLayout({
  eyebrow,
  title,
  description,
  children,
}: InstitutionalPageLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(220_43%_97%)_32%,hsl(var(--background))_72%)]" />
        <div className="absolute left-[-7rem] top-[-5rem] h-[22rem] w-[22rem] rounded-full bg-primary/16 blur-3xl" />
        <div className="absolute right-[-6rem] top-24 h-[20rem] w-[20rem] rounded-full bg-accent/14 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/55 bg-background/78 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
        <div className="container mx-auto flex h-20 items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] gradient-primary shadow-[0_18px_40px_-20px_hsl(220_65%_60%/0.72)] ring-1 ring-white/55">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-heading text-xl font-bold tracking-[-0.03em] text-foreground">Psivinculo</span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/46">
                paginas institucionais
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-white/70 bg-white/70 p-1.5 shadow-[0_20px_48px_-36px_rgba(45,58,109,0.28)] backdrop-blur-md md:flex">
            {publicHeaderLinks.map((link) => renderHeaderLink(link))}
          </nav>

          <Link
            to="/"
            className="rounded-full gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_18px_44px_-24px_hsl(220_65%_60%/0.72)] transition-all hover:-translate-y-0.5 hover:opacity-95"
          >
            Voltar ao inicio
          </Link>
        </div>
      </header>

      <main className="px-4 pb-24 pt-12 lg:pt-16">
        <div className="container mx-auto max-w-5xl">
          <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,252,0.86))] shadow-[0_30px_90px_-44px_rgba(49,61,114,0.34)] backdrop-blur-xl">
            <div aria-hidden className="absolute inset-0">
              <div className="absolute left-[-5rem] top-[-4rem] h-44 w-44 rounded-full bg-primary/14 blur-3xl" />
              <div className="absolute bottom-[-4rem] right-[-3rem] h-48 w-48 rounded-full bg-accent/12 blur-3xl" />
              <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,rgba(95,112,167,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(95,112,167,0.18)_1px,transparent_1px)] [background-size:84px_84px]" />
            </div>

            <div className="relative px-7 py-10 sm:px-10 sm:py-12 lg:px-12">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/84 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary shadow-[0_18px_42px_-30px_rgba(67,77,149,0.34)] backdrop-blur-md">
                {eyebrow}
              </span>
              <h1 className="mt-6 font-heading text-4xl font-bold leading-tight tracking-[-0.05em] text-foreground md:text-5xl">
                {title}
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-foreground/68">
                {description}
              </p>
            </div>
          </section>

          <div className="mt-10 space-y-6">{children}</div>
        </div>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
