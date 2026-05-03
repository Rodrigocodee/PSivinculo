import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CalendarPlus,
  Eye,
  Filter,
  MapPin,
  Search,
  Sparkles,
  UserRoundSearch,
  Video,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicSiteFooter } from "@/components/public/PublicSiteFooter";
import { platformPsychologistsPreview } from "@/data/platformPsychologistsPreview";

const soonToastMessage = "Em breve você poderá usar este recurso.";

const filters = ["Especialidade", "Modalidade", "Cidade/Estado", "Atendimento online"];

const futureBenefits = [
  "Maior visibilidade para o psicologo",
  "Facilidade para pacientes encontrarem atendimento",
  "Perfil profissional publico",
  "Solicitacoes de horario integradas ao sistema",
];

function showComingSoonToast() {
  toast(soonToastMessage);
}

export default function PlatformPsychologistsPreviewPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,hsl(220_42%_97%),hsl(var(--background))_34%,hsl(40_33%_98%))] text-foreground">
      <header className="border-b border-border/70 bg-white/90 backdrop-blur">
        <div className="container mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg gradient-primary shadow-sm">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <span className="block truncate font-heading text-xl font-bold text-foreground">Psivinculo</span>
              <p className="truncate text-xs font-medium text-muted-foreground">Psicólogos da plataforma</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-foreground/70 transition hover:bg-primary/10 hover:text-foreground sm:inline-flex"
            >
              Voltar ao início
            </Link>
            <Link
              to="/cadastro"
              className="inline-flex h-10 items-center rounded-lg gradient-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 py-12 sm:py-16 lg:py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <Badge className="gap-2 rounded-lg border-primary/20 bg-primary/10 px-3 py-1.5 text-primary hover:bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5" />
                  Em breve
                </Badge>
                <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
                  Psicólogos da plataforma
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-foreground/70">
                  Em breve, pacientes poderão encontrar profissionais da plataforma, conhecer suas especialidades e
                  solicitar atendimento com mais facilidade.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    className="h-11 rounded-lg gradient-primary px-5 text-primary-foreground hover:opacity-95"
                    onClick={showComingSoonToast}
                  >
                    Quero saber quando lançar
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" className="h-11 rounded-lg bg-white" onClick={showComingSoonToast}>
                    Ver exemplo visual
                  </Button>
                </div>
              </div>

              <Card className="overflow-hidden border-primary/15 bg-white/95 shadow-xl">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase text-primary">Busca visual</p>
                      <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">Encontre atendimento</h2>
                    </div>
                    <UserRoundSearch className="h-8 w-8 text-primary" />
                  </div>

                  <div className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background px-4 text-sm text-muted-foreground">
                    <Search className="h-4 w-4 shrink-0 text-primary" />
                    <span>Buscar por nome, especialidade ou cidade</span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {filters.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={showComingSoonToast}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground/70 transition hover:border-primary/30 hover:bg-primary/5"
                      >
                        <Filter className="h-3.5 w-3.5 text-primary" />
                    <span>{filter}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="px-4 pb-14 lg:pb-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">Profissionais exemplo</p>
                <h2 className="mt-2 font-heading text-3xl font-bold text-foreground">Lista demonstrativa</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Os perfis abaixo são fictícios e servem apenas para apresentar a experiência futura.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {platformPsychologistsPreview.map((psychologist) => (
                <article key={psychologist.id} className="flex h-full flex-col rounded-lg border border-border bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-14 w-14 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/10 font-heading text-base font-bold text-primary">
                        {psychologist.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">{psychologist.name}</h3>
                        <Badge variant="outline" className="rounded-lg border-primary/20 bg-primary/5 text-primary">
                          Em breve
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-primary">{psychologist.specialty}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-foreground/70">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1">
                      <Video className="h-3.5 w-3.5 text-primary" />
                      {psychologist.modality}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      {psychologist.city}/{psychologist.state}
                    </span>
                  </div>

                  <p className="mt-4 flex-1 text-sm leading-6 text-foreground/70">{psychologist.bio}</p>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                    <span className="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                      {psychologist.highlight}
                    </span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={showComingSoonToast}>
                        <Eye className="h-4 w-4" />
                        Ver perfil
                      </Button>
                      <Button type="button" size="sm" className="rounded-lg" onClick={showComingSoonToast}>
                        <CalendarPlus className="h-4 w-4" />
                        Solicitar
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-white px-4 py-14 lg:py-16">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase text-primary">O que vem por ai</p>
                <h2 className="mt-3 font-heading text-3xl font-bold leading-tight text-foreground">
                  O que essa funcionalidade vai permitir?
                </h2>
                <p className="mt-4 text-base leading-7 text-foreground/70">
                  A ideia é criar uma vitrine profissional integrada ao Psivínculo, mantendo a experiência simples para
                  pacientes e organizada para psicólogos.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {futureBenefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 rounded-lg border border-border bg-background/70 p-4">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm font-semibold leading-6 text-foreground/75">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 lg:py-16">
          <div className="container mx-auto max-w-6xl">
            <div className="rounded-lg border border-primary/20 gradient-primary p-7 text-primary-foreground shadow-xl sm:p-8 lg:p-10">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h2 className="font-heading text-3xl font-bold leading-tight">Quer aparecer nessa área quando ela for lançada?</h2>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-primary-foreground/90">
                    Este teaser mostra a direção da funcionalidade. O cadastro real de perfis públicos ainda será
                    liberado em uma etapa futura.
                  </p>
                </div>
                <Button
                  type="button"
                  className="h-11 rounded-lg bg-white px-5 text-sm font-semibold text-foreground hover:bg-white/90"
                  onClick={showComingSoonToast}
                >
                  Quero saber quando lançar
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
