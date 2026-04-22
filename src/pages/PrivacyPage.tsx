import { LegalDocumentPage } from "@/components/public/LegalDocumentPage";
import { PUBLIC_CONTACT_EMAIL } from "@/components/public/siteConfig";

const sections = [
  {
    title: "1. Abrangencia desta politica",
    paragraphs: [
      "Esta Politica de Privacidade descreve como o Psivinculo coleta, utiliza, armazena, protege e compartilha dados pessoais relacionados a navegacao em paginas publicas, cadastro, autenticacao, uso do produto, suporte e relacao contratual.",
      "Ela se aplica a visitantes, leads, administradores de clinica, psicologos, pacientes e demais pessoas que interagem com o Psivinculo em seus ambientes institucionais e operacionais.",
    ],
  },
  {
    title: "2. Dados que podemos coletar",
    paragraphs: [
      "Podemos coletar dados fornecidos diretamente pela pessoa usuaria, como nome, e-mail, telefone, cargo, dados de cadastro, informacoes de faturamento, dados de autenticacao e preferencias relacionadas ao uso da plataforma.",
      "Tambem podemos tratar dados de navegacao e operacao, incluindo endereco IP, identificadores tecnicos, logs de acesso, horario de uso, navegador, dispositivo, paginas acessadas, preferencias e informacoes inseridas nas areas autenticadas conforme o perfil e a finalidade de uso.",
    ],
    bullets: [
      "Dados de identificacao e contato.",
      "Dados de autenticacao, perfil e seguranca.",
      "Dados de uso, navegacao e logs tecnicos.",
      "Dados operacionais inseridos por profissionais e clinicas no uso do servico.",
    ],
  },
  {
    title: "3. Como os dados sao coletados",
    paragraphs: [
      "Os dados podem ser coletados quando a pessoa preenche formularios, cria conta, acessa a plataforma, interage com suporte, realiza pagamentos, navega em paginas institucionais ou utiliza funcionalidades internas do produto.",
      "Alguns dados tambem podem ser recebidos de integracoes, fornecedores de infraestrutura, autenticacao, analytics, comunicacao e pagamento, sempre dentro das finalidades legitimas descritas nesta politica.",
    ],
  },
  {
    title: "4. Finalidades do uso de dados",
    paragraphs: [
      "Os dados podem ser utilizados para criar e administrar contas, autenticar acessos, liberar funcionalidades, organizar a operacao da contratante, oferecer suporte, emitir cobrancas, prevenir fraudes, registrar logs de seguranca, atender obrigacoes legais e melhorar a experiencia do produto.",
      "Tambem podemos utilizar dados para comunicacoes institucionais, operacionais e comerciais relacionadas ao servico, sempre observando a base legal adequada e o contexto da relacao com a pessoa usuaria.",
    ],
  },
  {
    title: "5. Bases legais aplicaveis",
    paragraphs: [
      "O tratamento de dados pessoais pode se apoiar em bases legais previstas na legislacao brasileira, como execucao de contrato, cumprimento de obrigacao legal ou regulatoria, exercicio regular de direitos, legitimo interesse e consentimento quando necessario.",
      "No contexto operacional do produto, o enquadramento pode variar conforme o perfil de usuario, a finalidade do tratamento e a relacao entre Psivinculo, profissionais, clinicas e titulares dos dados.",
    ],
  },
  {
    title: "6. Compartilhamento de dados",
    paragraphs: [
      "Os dados podem ser compartilhados com fornecedores de hospedagem, autenticacao, infraestrutura, mensageria, analytics, meios de pagamento, suporte tecnico e demais parceiros estritamente necessarios para a prestacao do servico.",
      "Tambem pode haver compartilhamento quando exigido por lei, ordem de autoridade competente, defesa de direitos, auditoria, reorganizacao societaria ou protecao da plataforma, de usuarios e de terceiros.",
    ],
  },
  {
    title: "7. Armazenamento, retencao e descarte",
    paragraphs: [
      "Os dados sao armazenados pelo periodo necessario para cumprir as finalidades informadas nesta politica, atender obrigacoes legais, resguardar direitos, manter historico tecnico e operacional e executar o contrato celebrado com a contratante.",
      "Quando aplicavel, dados podem ser eliminados, anonimizados ou bloqueados apos o encerramento da necessidade de tratamento, observados os prazos legais, regulatorios e as exigencias de seguranca.",
    ],
  },
  {
    title: "8. Seguranca da informacao",
    paragraphs: [
      "O Psivinculo adota medidas tecnicas e administrativas razoaveis para proteger dados pessoais contra acesso nao autorizado, destruicao, perda, alteracao, vazamento ou qualquer forma inadequada de tratamento.",
      "Essas medidas podem incluir controle de acesso, segregacao por perfil, autenticacao, monitoramento, revisao de permissoes, trilhas de auditoria e boas praticas de desenvolvimento. Ainda assim, nenhum ambiente digital e absolutamente invulneravel.",
    ],
  },
  {
    title: "9. Cookies e tecnologias semelhantes",
    paragraphs: [
      "O Psivinculo pode utilizar cookies, armazenamento local e tecnologias semelhantes para funcionamento tecnico da aplicacao, autenticacao, seguranca, analise de desempenho, preferencias de uso e melhoria da experiencia.",
      "A pessoa usuaria pode administrar cookies por configuracoes do navegador, sabendo que a desativacao de determinadas tecnologias pode impactar o funcionamento de partes do servico.",
    ],
  },
  {
    title: "10. Direitos da pessoa titular e contato",
    paragraphs: [
      "A pessoa titular pode solicitar confirmacao de tratamento, acesso, correcao, atualizacao, anonimizacao, bloqueio, eliminacao, portabilidade quando cabivel, revisao de consentimento e informacoes sobre compartilhamento, nos limites da legislacao aplicavel.",
      `Solicitacoes relacionadas a privacidade e protecao de dados podem ser encaminhadas para ${PUBLIC_CONTACT_EMAIL}. O Psivinculo podera solicitar informacoes adicionais para confirmar identidade, proteger terceiros e atender ao pedido com seguranca.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      eyebrow="Privacidade"
      title="Politica de Privacidade do Psivinculo"
      description="Diretrizes sobre coleta, uso, compartilhamento, retencao e protecao de dados pessoais no ambiente institucional e operacional do produto."
      lastUpdated="19 de abril de 2026"
      reviewNote="Esta politica pode ser atualizada periodicamente para refletir mudancas legais, evolucoes do produto e ajustes na operacao."
      sections={sections}
    />
  );
}
