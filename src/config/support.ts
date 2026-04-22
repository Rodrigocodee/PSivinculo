export const SUPPORT_CONTACT = {
  phoneDisplay: "(21) 97676-1474",
  phoneDigits: "5521976761474",
  supportEmail: "rf30065@gmail.com",
  businessHoursLabel: "Atendimento em horario comercial",
} as const;

export const SUPPORT_LINKS = {
  whatsappUrl: `https://wa.me/${SUPPORT_CONTACT.phoneDigits}`,
  telUrl: `tel:+${SUPPORT_CONTACT.phoneDigits}`,
  mailtoUrl: `mailto:${SUPPORT_CONTACT.supportEmail}`,
} as const;
