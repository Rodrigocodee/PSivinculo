import { LegalDocumentPage } from "@/components/public/LegalDocumentPage";
import {
  PUBLIC_CONTACT_EMAIL,
  PUBLIC_CONTACT_WHATSAPP_LABEL,
} from "@/components/public/siteConfig";

const sections = [
  {
    title: "1. Aceitacao e escopo",
    paragraphs: [
      "Estes Termos de Uso disciplinam o acesso e a utilizacao do Psivinculo, plataforma SaaS destinada a psicologos, consultorios e clinicas para gestao de agenda, pacientes, prontuarios, financeiro e rotinas administrativas.",
      "Ao acessar, contratar ou utilizar qualquer area do Psivinculo, a pessoa usuaria declara que leu, compreendeu e concorda com estes termos, com a politica de privacidade e com as regras tecnicas aplicaveis ao servico.",
    ],
  },
  {
    title: "2. Cadastro, acesso e seguranca da conta",
    paragraphs: [
      "O usuario deve fornecer informacoes verdadeiras, completas e atualizadas no cadastro, mantendo sob sua responsabilidade a guarda de credenciais, a definicao de perfis de acesso e o uso adequado da conta contratada.",
      "A contratante e responsavel por autorizar apenas pessoas legitimamente vinculadas a sua operacao, revisar acessos periodicamente e comunicar imediatamente qualquer suspeita de uso indevido, perda de senha ou incidente de seguranca.",
    ],
    bullets: [
      "Manter e-mail, telefone e dados administrativos atualizados.",
      "Nao compartilhar senhas ou acessos de forma informal ou sem autorizacao.",
      "Responder pelas acoes praticadas a partir da conta e dos acessos concedidos.",
    ],
  },
  {
    title: "3. Uso permitido da plataforma",
    paragraphs: [
      "A plataforma deve ser utilizada de forma licita, etica e compativel com a finalidade profissional declarada, observando normas aplicaveis a atividade clinica, protecao de dados, sigilo profissional e organizacao interna da contratante.",
      "Nao e permitido utilizar o Psivinculo para fraude, engenharia reversa, tentativa de acesso nao autorizado, sobrecarga artificial, distribuicao de malware, armazenamento de conteudo ilicito, violacao de direitos de terceiros ou qualquer uso que comprometa a seguranca e a disponibilidade do servico.",
    ],
    bullets: [
      "Usar a plataforma apenas para finalidades profissionais legitimas.",
      "Inserir dados somente quando houver base legal e autorizacao adequada.",
      "Respeitar regras tecnicas, limites do plano e politicas internas do produto.",
    ],
  },
  {
    title: "4. Responsabilidades do usuario e da contratante",
    paragraphs: [
      "A contratante permanece responsavel pelos dados inseridos no sistema, pela legitimidade do tratamento realizado em sua operacao, pela definicao de perfis de acesso e pela supervisao das pessoas que utilizam a conta em seu nome.",
      "O Psivinculo disponibiliza tecnologia de apoio a operacao, mas nao substitui a analise clinica, a gestao interna da contratante, a verificacao juridica dos fluxos adotados nem as obrigacoes profissionais assumidas por psicologos, clinicas e administradores.",
    ],
  },
  {
    title: "5. Planos, pagamentos e cobranca",
    paragraphs: [
      "Os recursos disponiveis, limites de uso, quantidade de usuarios, modulos liberados, valores e condicoes comerciais dependem do plano contratado e da proposta vigente no momento da adesao.",
      "Pagamentos devem ser realizados nos prazos e meios informados no fluxo comercial. A inadimplencia pode resultar em limitacao de funcionalidades, bloqueio temporario, suspensao de acessos ou cancelamento, observadas as regras comerciais aplicaveis ao contrato.",
    ],
  },
  {
    title: "6. Cancelamento, suspensao e encerramento",
    paragraphs: [
      "A contratante pode solicitar cancelamento conforme as regras do plano vigente, observados eventual periodo minimo, ciclo de cobranca ja iniciado, obrigacoes financeiras pendentes e procedimentos tecnicos de encerramento da conta.",
      "O Psivinculo podera suspender ou encerrar acessos em caso de uso indevido, fraude, risco a seguranca, violacao destes termos, inadimplencia relevante, determinacao legal ou qualquer situacao que comprometa terceiros, a infraestrutura ou a conformidade da operacao.",
    ],
  },
  {
    title: "7. Dados, confidencialidade e protecao de informacoes",
    paragraphs: [
      "A contratante e responsavel pela adequacao do tratamento dos dados que insere na plataforma. Em relacao ao ambiente tecnologico, o Psivinculo adota medidas razoaveis de seguranca, controle de acesso e protecao de informacoes conforme sua arquitetura e politicas internas.",
      "Dados operacionais, registros tecnicos e informacoes de conta podem ser tratados para viabilizar autenticacao, seguranca, suporte, prevencao de fraudes, cumprimento legal e execucao do servico. A politica de privacidade complementa estas regras.",
    ],
  },
  {
    title: "8. Propriedade intelectual",
    paragraphs: [
      "O software, a arquitetura, a identidade visual, o codigo-fonte, os componentes, as interfaces, os textos padrao, as marcas e os demais elementos do Psivinculo permanecem protegidos pela legislacao de propriedade intelectual aplicavel.",
      "A contratacao nao transfere titularidade sobre o produto. O que se concede ao usuario e uma licenca limitada, nao exclusiva, revogavel e condicionada ao cumprimento destes termos e do plano contratado.",
    ],
  },
  {
    title: "9. Disponibilidade, suporte e evolucao do servico",
    paragraphs: [
      "O Psivinculo busca manter a plataforma disponivel, segura e em evolucao continua, mas podera realizar manutencoes, atualizacoes, correcoes e mudancas tecnicas que resultem em indisponibilidade programada ou comportamento temporariamente alterado.",
      "O suporte sera prestado pelos canais institucionais divulgados pelo produto, dentro do escopo do plano contratado e das politicas operacionais vigentes.",
    ],
  },
  {
    title: "10. Limitacao de responsabilidade",
    paragraphs: [
      "O Psivinculo emprega esforcos tecnicos compativeis com a natureza do servico, mas nao garante operacao absolutamente ininterrupta, livre de falhas ou imune a eventos externos, caso fortuito, forca maior, indisponibilidade de terceiros ou uso inadequado por pessoas usuarias.",
      "Em nenhuma hipotese a plataforma substitui a decisao profissional, a gestao administrativa da contratante, a validacao juridica dos fluxos ou a responsabilidade etica e legal assumida pelos profissionais que utilizam o sistema.",
    ],
  },
  {
    title: "11. Suporte, contato, legislacao aplicavel e foro",
    paragraphs: [
      `Duvidas sobre estes termos, suporte institucional e solicitacoes relacionadas ao uso do servico podem ser encaminhadas para ${PUBLIC_CONTACT_EMAIL} e para o canal comercial informado em ${PUBLIC_CONTACT_WHATSAPP_LABEL}.`,
      "Estes termos sao regidos pela legislacao brasileira. Fica eleito o foro da comarca do domicilio da parte contratada, salvo disposicao legal obrigatoria em sentido diverso, para dirimir controverisias relacionadas ao uso da plataforma.",
    ],
  },
];

export default function TermsOfUsePage() {
  return (
    <LegalDocumentPage
      eyebrow="Termos de Uso"
      title="Termos de Uso do Psivinculo"
      description="Regras gerais para contratacao, acesso e utilizacao do Psivinculo por psicologos, consultorios e clinicas."
      lastUpdated="19 de abril de 2026"
      reviewNote="Este documento pode ser atualizado para refletir evolucoes do produto, alteracoes legais, novos modulos e ajustes comerciais."
      sections={sections}
    />
  );
}
