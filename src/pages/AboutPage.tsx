import { Brain, HeartHandshake, Sparkles } from "lucide-react";
import { InstitutionalPageLayout } from "@/components/public/InstitutionalPageLayout";

const purposeCards = [
  {
    icon: HeartHandshake,
    title: "Propósito",
    text: "Facilitar a rotina dos psicólogos para que o cuidado continue no centro.",
  },
  {
    icon: Brain,
    title: "Tecnologia com sensibilidade",
    text: "Automatizar processos sem transformar a experiência humana em algo frio ou distante.",
  },
  {
    icon: Sparkles,
    title: "Um projeto em evolução",
    text: "Começa apoiando profissionais da Psicologia e abre caminho para novas soluções em saúde mental.",
  },
];

export default function AboutPage() {
  return (
    <InstitutionalPageLayout
      eyebrow="Sobre o Psivínculo"
      title="Criado com propósito, pensado para cuidar"
      description="Uma plataforma criada por quem entende, na prática, o valor do cuidado psicológico."
    >
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="mx-auto w-full max-w-sm rounded-[1.8rem] border border-white/72 bg-white/84 p-5 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.24)] sm:p-6 lg:mx-0 lg:max-w-none">
          <div className="aspect-[4/5] max-h-[28rem] overflow-hidden rounded-[1.35rem] bg-[linear-gradient(135deg,hsl(224_48%_96%),hsl(40_33%_98%))] lg:max-h-none">
            <img
              src="/images/rodrigo.jpeg"
              alt="Rodrigo Ferreira, fundador do Psivínculo"
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
          <div className="mt-5 rounded-[1.35rem] border border-primary/10 bg-primary/5 p-5">
            <p className="font-heading text-2xl font-bold text-foreground">Rodrigo Ferreira</p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Fundador do Psivínculo
            </p>
            <p className="mt-3 text-sm leading-6 text-foreground/68">
              Formado em Análise e Desenvolvimento de Sistemas
            </p>
          </div>
        </aside>

        <article className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.24)] sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">
            História e origem
          </p>
          <div className="mt-5 space-y-4 text-sm leading-7 text-foreground/68 sm:text-[15px]">
            <p>
              O Psivínculo nasceu a partir de uma experiência pessoal com a saúde mental e da percepção de como o
              acompanhamento psicológico pode transformar a vida de uma pessoa.
            </p>
            <p>
              Meu nome é Rodrigo Ferreira, sou formado em Análise e Desenvolvimento de Sistemas. Durante um período
              desafiador da minha vida, encontrei no acompanhamento psicológico um espaço essencial de cuidado, escuta e
              reconstrução. Essa vivência me fez enxergar ainda mais de perto a importância do trabalho dos psicólogos.
            </p>
            <p>
              Ao mesmo tempo, percebi que muitos profissionais da Psicologia precisam lidar com uma rotina cheia de
              tarefas manuais: agenda, pacientes, prontuários, cobranças, confirmações, mensagens e organização
              financeira. Muitas vezes, essas demandas tomam tempo de quem deveria estar focado no que realmente
              importa: o cuidado com as pessoas.
            </p>
            <p>
              Foi assim que surgiu o Psivínculo: uma plataforma criada para simplificar a rotina do psicólogo,
              automatizar processos e centralizar a gestão do atendimento em um só lugar.
            </p>
            <p>
              Mais do que um sistema, o Psivínculo é um projeto com propósito. A ideia é facilitar o trabalho dos
              profissionais e, indiretamente, contribuir para que mais pessoas tenham acesso a um atendimento mais
              organizado, humano e acolhedor.
            </p>
            <p>
              Este é apenas o começo. O Psivínculo nasce com a missão de apoiar psicólogos hoje e, no futuro, abrir
              caminho para outros projetos voltados a pessoas que enfrentam transtornos mentais e momentos difíceis.
            </p>
          </div>
        </article>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {purposeCards.map((card) => (
          <div
            key={card.title}
            className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-primary/10">
              <card.icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="mt-5 font-heading text-xl font-semibold text-foreground">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-foreground/66">{card.text}</p>
          </div>
        ))}
      </section>
    </InstitutionalPageLayout>
  );
}
