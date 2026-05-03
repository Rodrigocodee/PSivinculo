export type PlatformPsychologistPreview = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  city: string;
  state: string;
  modality: "Online" | "Presencial" | "Online e presencial";
  bio: string;
  highlight: string;
};

export const platformPsychologistsPreview: PlatformPsychologistPreview[] = [
  {
    id: "mock-ana-luiza",
    name: "Ana Luiza Martins",
    initials: "AM",
    specialty: "Ansiedade e autoestima",
    city: "Sao Paulo",
    state: "SP",
    modality: "Online",
    bio: "Atendimento acolhedor para adultos em processos de autoconhecimento, ansiedade e mudancas de vida.",
    highlight: "Terapia para adultos",
  },
  {
    id: "mock-felipe-rocha",
    name: "Felipe Rocha",
    initials: "FR",
    specialty: "Terapia cognitivo-comportamental",
    city: "Curitiba",
    state: "PR",
    modality: "Online e presencial",
    bio: "Foco em estrategias praticas para lidar com estresse, rotina profissional e organizacao emocional.",
    highlight: "TCC",
  },
  {
    id: "mock-marina-costa",
    name: "Marina Costa",
    initials: "MC",
    specialty: "Relacionamentos",
    city: "Belo Horizonte",
    state: "MG",
    modality: "Presencial",
    bio: "Acompanha pessoas em conflitos afetivos, comunicacao, limites e fortalecimento de vinculos saudaveis.",
    highlight: "Vinculos e familia",
  },
  {
    id: "mock-renata-lima",
    name: "Renata Lima",
    initials: "RL",
    specialty: "Psicologia infantil",
    city: "Recife",
    state: "PE",
    modality: "Online e presencial",
    bio: "Atendimento para criancas e orientacao parental com linguagem simples, cuidado e escuta ativa.",
    highlight: "Infancia",
  },
  {
    id: "mock-bruno-silveira",
    name: "Bruno Silveira",
    initials: "BS",
    specialty: "Saude mental no trabalho",
    city: "Porto Alegre",
    state: "RS",
    modality: "Online",
    bio: "Apoio para burnout, transições de carreira, liderança e equilíbrio entre vida pessoal e profissional.",
    highlight: "Carreira e burnout",
  },
  {
    id: "mock-julia-nascimento",
    name: "Julia Nascimento",
    initials: "JN",
    specialty: "Luto e recomeços",
    city: "Salvador",
    state: "BA",
    modality: "Online",
    bio: "Cuidado psicológico para momentos de perda, adaptação, reconstrução emocional e novos ciclos.",
    highlight: "Acolhimento",
  },
];
