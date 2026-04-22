export const PUBLIC_CONTACT_EMAIL = "rf30065@gmail.com";
export const PUBLIC_CONTACT_EMAIL_HREF = `mailto:${PUBLIC_CONTACT_EMAIL}`;
export const PUBLIC_CONTACT_WHATSAPP_LABEL = "(21) 97676-1474";
export const PUBLIC_CONTACT_WHATSAPP_HREF = "https://wa.me/5521976761474";

export type PublicSiteLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type PublicSiteFooterColumn = {
  title: string;
  links: PublicSiteLink[];
};

export const publicHeaderLinks: PublicSiteLink[] = [
  { label: "Sobre", href: "/sobre" },
  { label: "Contato", href: "/contato" },
  { label: "Ver planos", href: "/#pricing" },
];

export const publicFooterColumns: PublicSiteFooterColumn[] = [
  {
    title: "Produto",
    links: [
      { label: "Funcionalidades", href: "/#features" },
      { label: "Planos", href: "/#pricing" },
      { label: "Demonstração", href: "/#mockup" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre", href: "/sobre" },
      { label: "Contato", href: "/contato" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos de Uso", href: "/termos-de-uso" },
      { label: "Privacidade", href: "/privacidade" },
      { label: "LGPD", href: "/lgpd" },
    ],
  },
];
