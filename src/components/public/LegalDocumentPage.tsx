import { InstitutionalPageLayout } from "@/components/public/InstitutionalPageLayout";

type LegalDocumentSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type LegalDocumentPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated: string;
  reviewNote: string;
  sections: LegalDocumentSection[];
};

export function LegalDocumentPage({
  eyebrow,
  title,
  description,
  lastUpdated,
  reviewNote,
  sections,
}: LegalDocumentPageProps) {
  return (
    <InstitutionalPageLayout eyebrow={eyebrow} title={title} description={description}>
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.24)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">
            Documento institucional
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground/64">
            Este conteudo apresenta as diretrizes atualmente publicadas para transparencia,
            referencia institucional e consulta de usuarios, profissionais e clinicas que utilizam o
            Psivinculo.
          </p>
        </div>

        <div className="rounded-[1.8rem] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(243,246,251,0.84))] p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">
            Ultima atualizacao
          </p>
          <p className="mt-3 font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
            {lastUpdated}
          </p>
          <p className="mt-3 text-sm leading-7 text-foreground/64">{reviewNote}</p>
        </div>
      </section>

      <article className="space-y-6">
        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)] sm:p-7"
          >
            <h2 className="font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
              {section.title}
            </h2>

            <div className="mt-4 space-y-4 text-sm leading-7 text-foreground/68 sm:text-[15px]">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            {section.bullets?.length ? (
              <ul className="mt-5 space-y-3 rounded-[1.35rem] border border-border/65 bg-background/56 p-4 text-sm leading-7 text-foreground/68">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
    </InstitutionalPageLayout>
  );
}
