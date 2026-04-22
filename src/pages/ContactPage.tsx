import { InstitutionalPageLayout } from "@/components/public/InstitutionalPageLayout";
import {
  PUBLIC_CONTACT_EMAIL,
  PUBLIC_CONTACT_EMAIL_HREF,
  PUBLIC_CONTACT_WHATSAPP_HREF,
  PUBLIC_CONTACT_WHATSAPP_LABEL,
} from "@/components/public/siteConfig";

const channels = [
  {
    title: "E-mail institucional",
    value: PUBLIC_CONTACT_EMAIL,
    href: PUBLIC_CONTACT_EMAIL_HREF,
    helper: "Ideal para assuntos gerais, suporte inicial e contatos institucionais.",
  },
  {
    title: "WhatsApp",
    value: PUBLIC_CONTACT_WHATSAPP_LABEL,
    href: PUBLIC_CONTACT_WHATSAPP_HREF,
    helper: "Canal direto para conversas mais rapidas e alinhamentos comerciais iniciais.",
  },
];

export default function ContactPage() {
  return (
    <InstitutionalPageLayout
      eyebrow="Contato"
      title="Canais institucionais do Psivinculo."
      description="Esta pagina concentra os contatos publicos iniciais da marca para facilitar atendimento, alinhamentos comerciais e atualizacoes futuras."
    >
      <section className="grid gap-6 md:grid-cols-2">
        {channels.map((channel) => (
          <a
            key={channel.title}
            href={channel.href}
            className="rounded-[1.85rem] border border-white/72 bg-white/84 p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.24)] transition-all hover:-translate-y-0.5 hover:border-primary/16"
            target={channel.href.startsWith("https://") ? "_blank" : undefined}
            rel={channel.href.startsWith("https://") ? "noreferrer" : undefined}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">{channel.title}</p>
            <h2 className="mt-3 font-heading text-2xl font-bold tracking-[-0.03em] text-foreground">
              {channel.value}
            </h2>
            <p className="mt-4 text-sm leading-7 text-foreground/66">{channel.helper}</p>
          </a>
        ))}
      </section>

      <section className="rounded-[1.85rem] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(243,246,251,0.84))] p-6 shadow-[0_20px_58px_-42px_rgba(45,58,109,0.22)] sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/82">Observacao</p>
        <div className="mt-4 space-y-4 text-sm leading-7 text-foreground/66 sm:text-[15px]">
          <p>
            Este espaco pode receber futuramente horarios de atendimento, SLA desejado, canais por tipo de assunto,
            endereco institucional, formulario comercial ou informacoes de suporte.
          </p>
          <p>
            No estado atual, a pagina ja entrega um ponto de contato funcional, editavel e consistente com a identidade
            visual do Psivinculo.
          </p>
        </div>
      </section>
    </InstitutionalPageLayout>
  );
}
