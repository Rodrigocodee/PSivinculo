import { LegalDocumentPage } from "@/components/public/LegalDocumentPage";
import { PUBLIC_CONTACT_EMAIL } from "@/components/public/siteConfig";

const sections = [
  {
    title: "1. Compromisso com a LGPD",
    paragraphs: [
      "O Psivinculo trata a protecao de dados como tema essencial para a confianca de profissionais, clinicas, pacientes e demais usuarios da plataforma.",
      "Esta pagina resume, em linguagem mais direta, como aplicamos principios da Lei Geral de Protecao de Dados Pessoais no contexto do produto e quais canais podem ser usados para exercicio de direitos.",
    ],
  },
  {
    title: "2. O que significa tratamento de dados",
    paragraphs: [
      "Tratamento de dados e qualquer operacao realizada com informacoes pessoais, como coleta, cadastro, organizacao, consulta, armazenamento, uso, compartilhamento, exclusao ou qualquer outra atividade que envolva dados de uma pessoa identificada ou identificavel.",
      "No contexto do Psivinculo, esse tratamento pode acontecer para cadastro, autenticacao, operacao do sistema, seguranca, suporte, comunicacao com usuarios, faturamento e execucao do servico contratado.",
    ],
  },
  {
    title: "3. Bases legais",
    paragraphs: [
      "A LGPD permite o tratamento de dados com base em diferentes fundamentos legais. No Psivinculo, isso pode incluir execucao de contrato, cumprimento de obrigacoes legais, exercicio regular de direitos, legitimo interesse e consentimento quando aplicavel.",
      "A base legal utilizada depende da finalidade do tratamento, do perfil da pessoa envolvida e do fluxo em que os dados sao utilizados.",
    ],
  },
  {
    title: "4. Consentimento",
    paragraphs: [
      "Quando a lei exigir consentimento, ele deve ser livre, informado e inequivoco. Sempre que necessario, o Psivinculo pode registrar esse consentimento por meios adequados ao fluxo utilizado.",
      "Nos casos em que o tratamento puder ser realizado com outra base legal prevista em lei, o consentimento nao sera a unica referencia para uso dos dados.",
    ],
  },
  {
    title: "5. Armazenamento, seguranca e protecao",
    paragraphs: [
      "O armazenamento de dados observa criterios de necessidade, seguranca e prevencao. O Psivinculo adota medidas razoaveis para reduzir riscos de acesso indevido, perda, alteracao, vazamento ou uso inadequado de informacoes pessoais.",
      "Essas medidas podem incluir controle de acesso por perfil, autenticacao, registros de atividade, revisao de permissoes e boas praticas tecnicas compativeis com a natureza do servico.",
    ],
    bullets: [
      "Controle de acesso por perfil e necessidade operacional.",
      "Retencao limitada ao periodo necessario e legalmente justificavel.",
      "Procedimentos de revisao, monitoramento e resposta a incidentes.",
    ],
  },
  {
    title: "6. Direitos da pessoa titular",
    paragraphs: [
      "A LGPD garante a pessoa titular direitos como confirmacao de tratamento, acesso aos dados, correcao de informacoes incompletas ou desatualizadas, anonimizacao, bloqueio, eliminacao, portabilidade quando cabivel e informacoes sobre compartilhamento.",
      "Tambem e possivel solicitar revisao do consentimento, oposicao quando prevista em lei e outras providencias compativeis com a natureza do tratamento realizado.",
    ],
    bullets: [
      "Confirmar se o Psivinculo trata determinados dados pessoais.",
      "Corrigir ou atualizar informacoes incorretas.",
      "Solicitar exclusao, bloqueio ou anonimizacao quando aplicavel.",
      "Pedir informacoes sobre compartilhamento e criterios de tratamento.",
    ],
  },
  {
    title: "7. Correcao, exclusao e solicitacoes",
    paragraphs: [
      "Pedidos de correcao, atualizacao, bloqueio ou exclusao sao analisados caso a caso, considerando a identidade do solicitante, a finalidade do tratamento, a existencia de obrigacao legal de retencao e a protecao de direitos de terceiros.",
      "Em determinadas situacoes, a exclusao imediata pode nao ser possivel por existencia de obrigacao legal, necessidade de guarda para seguranca, auditoria, defesa judicial ou execucao contratual.",
    ],
  },
  {
    title: "8. Contato para assuntos de LGPD",
    paragraphs: [
      `Solicitacoes relacionadas a dados pessoais, exercicio de direitos e duvidas sobre LGPD podem ser encaminhadas para ${PUBLIC_CONTACT_EMAIL}.`,
      "Para proteger a privacidade de todos os envolvidos, o Psivinculo pode solicitar comprovacao de identidade e informacoes complementares antes de concluir o atendimento de determinadas solicitacoes.",
    ],
  },
];

export default function LgpdPage() {
  return (
    <LegalDocumentPage
      eyebrow="LGPD"
      title="LGPD e tratamento de dados no Psivinculo"
      description="Resumo claro sobre tratamento de dados pessoais, bases legais, direitos do titular e canais para solicitacoes relacionadas a privacidade."
      lastUpdated="19 de abril de 2026"
      reviewNote="Esta pagina pode ser atualizada para refletir ajustes operacionais, evolucao do produto e aperfeicoamentos na governanca de dados."
      sections={sections}
    />
  );
}
