import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Política de Privacidade | Casa do Ads",
  description: "Como o Academy Play trata e protege dados pessoais dos usuários.",
};

const sections: LegalSection[] = [
  {
    id: "responsavel",
    title: "Responsável pelo tratamento",
    content: <>
      <p>A Casa do Ads, inscrita no CNPJ 27.921.309/0001-70, é responsável pelas decisões sobre o tratamento de dados pessoais realizado no Academy Play, sem prejuízo das responsabilidades próprias de fornecedores e parceiros.</p>
      <p>O canal para solicitações de privacidade é <a href="mailto:contato@casadoads.com.br">contato@casadoads.com.br</a>.</p>
    </>,
  },
  {
    id: "dados",
    title: "Dados que podemos tratar",
    content: <>
      <p>Os dados variam conforme o relacionamento do usuário e os recursos utilizados:</p>
      <ul>
        <li><strong>Cadastro e identificação:</strong> nome, e-mail, CPF, telefone, imagem de perfil, função, status da conta e aceite dos documentos.</li>
        <li><strong>Acesso e segurança:</strong> senha protegida por hash, data de acesso, endereço IP, navegador, identificação do dispositivo, sessões e registros de bloqueio.</li>
        <li><strong>Aprendizado:</strong> cursos matriculados, favoritos, progresso, tempo e posição de reprodução, histórico, certificados e notificações.</li>
        <li><strong>Atendimento e administração:</strong> solicitações, registros de alterações administrativas e informações necessárias para suporte.</li>
        <li><strong>Integrações:</strong> identificadores, produtos, assinaturas e eventos recebidos de plataformas autorizadas de venda, vídeo ou área de membros.</li>
        <li><strong>Dados técnicos:</strong> logs, identificadores de requisição, falhas, desempenho e informações indispensáveis ao funcionamento e à prevenção de abuso.</li>
      </ul>
      <p>O Academy Play não precisa armazenar os dados completos do cartão utilizado em uma compra realizada por processadores externos.</p>
    </>,
  },
  {
    id: "fontes",
    title: "Como os dados são obtidos",
    content: <>
      <p>Os dados podem ser fornecidos pelo próprio usuário, por um administrador autorizado, pelo contratante responsável pela matrícula, por integrações comerciais habilitadas ou gerados durante o uso da plataforma.</p>
      <p>Quando dados forem recebidos de terceiros, o tratamento será limitado à finalidade legítima de criação, administração e comprovação do acesso.</p>
    </>,
  },
  {
    id: "finalidades",
    title: "Por que utilizamos os dados",
    content: <ul>
      <li>Criar a conta, autenticar o usuário e disponibilizar cursos e materiais.</li>
      <li>Administrar matrículas, prazos de acesso, progresso, favoritos e certificados.</li>
      <li>Proteger vídeos, controlar sessões e dispositivos e prevenir compartilhamento indevido.</li>
      <li>Prestar suporte, responder solicitações e enviar comunicações relacionadas ao serviço.</li>
      <li>Manter segurança, disponibilidade, auditoria, integridade e desempenho da plataforma.</li>
      <li>Cumprir obrigações legais, regulatórias e contratuais e exercer direitos em processos.</li>
      <li>Produzir indicadores agregados para melhoria do conteúdo e da experiência, sempre que possível sem identificação direta.</li>
    </ul>,
  },
  {
    id: "bases-legais",
    title: "Bases legais",
    content: <>
      <p>Conforme a situação, o tratamento poderá ocorrer para execução de contrato e procedimentos relacionados, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, proteção contra fraude, legítimo interesse avaliado com as salvaguardas necessárias ou consentimento quando essa for a base adequada.</p>
      <p>Quando o tratamento depender de consentimento, o usuário poderá revogá-lo, observadas as consequências e os tratamentos que permaneçam autorizados por outra base legal.</p>
    </>,
  },
  {
    id: "compartilhamento",
    title: "Compartilhamento e operadores",
    content: <>
      <p>Dados podem ser compartilhados somente na medida necessária com fornecedores de hospedagem, banco de dados, armazenamento, segurança, envio de e-mails quando ativado, processamento de vídeo, integrações de matrícula e ferramentas de suporte e observabilidade.</p>
      <p>Também poderá haver compartilhamento com autoridades públicas, órgãos reguladores, assessores ou terceiros quando necessário para cumprir obrigação legal, responder a ordem válida, prevenir fraude ou exercer direitos.</p>
      <p>A Casa do Ads não vende dados pessoais dos usuários do Academy Play.</p>
    </>,
  },
  {
    id: "transferencia",
    title: "Transferência internacional",
    content: <p>Alguns fornecedores de tecnologia podem armazenar ou processar dados em outros países. Nesses casos, são adotadas medidas contratuais e técnicas compatíveis com a legislação aplicável e com o nível de proteção exigido para os dados envolvidos.</p>,
  },
  {
    id: "cookies",
    title: "Cookies e armazenamento local",
    content: <>
      <p>A plataforma utiliza cookies e identificadores essenciais para manter a sessão autenticada, proteger a conta, reconhecer dispositivos e preservar o funcionamento solicitado pelo usuário.</p>
      <p>Recursos não essenciais, caso sejam adicionados futuramente, deverão ser informados e tratados conforme a base legal aplicável. Bloquear recursos essenciais no navegador pode impedir o login ou comprometer funções da plataforma.</p>
    </>,
  },
  {
    id: "retencao",
    title: "Retenção e eliminação",
    content: <>
      <p>Os dados são mantidos pelo período necessário para prestar o serviço, cumprir a finalidade informada, respeitar obrigações legais, prevenir fraude e permitir o exercício de direitos.</p>
      <p>Tokens expirados, sessões encerradas, logs, eventos de integração e outros dados operacionais seguem rotinas de retenção e limpeza. Ao final dos prazos aplicáveis, os dados poderão ser eliminados, anonimizados ou conservados quando houver fundamento legal.</p>
    </>,
  },
  {
    id: "seguranca",
    title: "Segurança da informação",
    content: <>
      <p>São utilizados controles como autenticação, hash de senhas, cookies protegidos, limitação de requisições, controle de sessões e dispositivos, segregação de permissões, registros de auditoria e proteção de conteúdo audiovisual.</p>
      <p>Nenhum ambiente é absolutamente imune a incidentes. Caso ocorra evento relevante, serão adotadas medidas de contenção, investigação e comunicação exigidas pela legislação.</p>
    </>,
  },
  {
    id: "direitos",
    title: "Direitos do titular",
    content: <>
      <p>Nos limites da LGPD, o titular pode solicitar confirmação e acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio ou eliminação de dados inadequados ou excessivos, portabilidade quando regulamentada e aplicável, eliminação de dados tratados com consentimento, informação sobre a possibilidade de não consentir e revogação do consentimento.</p>
      <p>Também poderá solicitar revisão de decisões tomadas unicamente com base em tratamento automatizado que afetem seus interesses, quando aplicável. A identidade do solicitante poderá ser verificada antes do atendimento.</p>
    </>,
  },
  {
    id: "menores",
    title: "Crianças e adolescentes",
    content: <p>A plataforma não é direcionada intencionalmente a crianças. O cadastro e o uso por menores de idade devem observar a legislação aplicável, o melhor interesse do menor e, quando necessário, a participação ou autorização do responsável legal.</p>,
  },
  {
    id: "alteracoes-contato",
    title: "Atualizações e contato",
    content: <>
      <p>Esta Política poderá ser atualizada para refletir mudanças legais, técnicas ou operacionais. A versão e a data mais recentes permanecerão indicadas nesta página.</p>
      <p>Solicitações podem ser enviadas para <a href="mailto:contato@casadoads.com.br">contato@casadoads.com.br</a>. Se uma solicitação de titular não for solucionada, permanecem disponíveis os canais da <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1" target="_blank" rel="noreferrer">Agência Nacional de Proteção de Dados</a>. Consulte também o <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm" target="_blank" rel="noreferrer">texto oficial da LGPD</a>.</p>
    </>,
  },
];

export default function PrivacyPage() {
  return <LegalDocument
    label="Privacidade e proteção de dados"
    title="Política de Privacidade"
    summary="Entenda quais dados o Academy Play utiliza, para quais finalidades e como exercer seus direitos."
    version="2026-09-03"
    updatedAt="3 de setembro de 2026"
    notice={<>Esta política se aplica ao Academy Play. Sites, páginas de venda e serviços externos podem possuir documentos próprios e complementares.</>}
    sections={sections}
  />;
}
