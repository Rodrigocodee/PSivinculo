import { InstitutionalPageLayout } from "@/components/public/InstitutionalPageLayout";

const valueCards = [
  {
    title: "Clareza operacional",
    text: "Placeholder para explicar como o Psivinculo organiza agenda, pacientes, prontuarios e financeiro em uma experiencia mais clara e previsivel.",
  },
  {
    title: "Cuidado com a experiencia",
    text: "Placeholder para descrever o cuidado com interface, fluxo de uso e percepcao de valor para profissionais, clinicas e pacientes.",
  },
  {
    title: "Base para crescimento",
    text: "Placeholder para comunicar como o produto acompanha desde a pratica individual ate a expansao da operacao com equipe e indicadores.",
  },
];

export default function AboutPage() {
  return (
    <InstitutionalPageLayout
      eyebrow="Sobre o Psivinculo"
      title="Uma base institucional simples hoje, pronta para receber a historia oficial da marca."
      description="Esta pagina foi criada para servir como estrutura institucional editavel, com organizacao clara e visual coerente com a identidade do produto."
    >
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.24)] sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">Nossa proposta</p>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-[-0.04em] text-foreground">
            Texto institucional placeholder, organizado para facilitar edicao futura.
          </h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-foreground/68 sm:text-[15px]">
            <p>
              O Psivinculo pode apresentar aqui um texto oficial sobre origem, motivacao do produto e a forma
              como a plataforma apoia psicologos e clinicas em uma rotina mais profissional, organizada e segura.
            </p>
            <p>
              Este bloco foi escrito como placeholder bem estruturado para permitir substituicao rapida depois,
              sem precisar reconstruir a pagina. A ideia e deixar uma base institucional elegante desde ja.
            </p>
            <p>
              Quando o conteudo definitivo estiver pronto, este espaco pode receber narrativa de marca, posicionamento,
              historia da empresa, proposta de valor e visao de longo prazo.
            </p>
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(243,246,251,0.84))] p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)] sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">Edicao futura</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-foreground/66">
            <li className="flex items-start gap-3">
              <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
              <span>Substituir o texto institucional por narrativa oficial da marca.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
              <span>Adicionar dados reais sobre empresa, missao, visao e posicionamento.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
              <span>Incluir prova social, marcos do produto e possiveis diferenciais oficiais.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {valueCards.map((card) => (
          <div
            key={card.title}
            className="rounded-[1.8rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)]"
          >
            <h3 className="font-heading text-xl font-semibold text-foreground">{card.title}</h3>
            <p className="mt-3 text-sm leading-7 text-foreground/66">{card.text}</p>
          </div>
        ))}
      </section>
    </InstitutionalPageLayout>
  );
}
