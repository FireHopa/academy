import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Termos de Uso | Casa do Ads",
  description: "Termos aplicáveis ao acesso e uso da plataforma Academy Play da Casa do Ads.",
};

const sections: LegalSection[] = [
  {
    id: "aceitacao",
    title: "Aceitação e abrangência",
    content: <>
      <p>Estes Termos regulam o acesso ao Academy Play, plataforma educacional operada pela Casa do Ads, inscrita no CNPJ 27.921.309/0001-70. Ao criar uma conta, aceitar os Termos no primeiro acesso ou utilizar a plataforma, você declara que leu e concorda com estas condições.</p>
      <p>Condições específicas apresentadas na oferta, no contrato, na página de compra ou no canal pelo qual o acesso foi adquirido complementam este documento. Em caso de conflito, prevalecem a legislação aplicável e a condição específica mais favorável ao consumidor quando assim exigido por lei.</p>
    </>,
  },
  {
    id: "conta",
    title: "Cadastro e segurança da conta",
    content: <>
      <p>O acesso é pessoal e vinculado aos dados informados no cadastro. O usuário deve fornecer informações corretas, manter seus dados atualizados e proteger sua senha e seus dispositivos.</p>
      <ul>
        <li>Não compartilhe senha, sessão, token, link protegido ou acesso com terceiros.</li>
        <li>Avise a Casa do Ads ao identificar uso não autorizado ou suspeita de comprometimento.</li>
        <li>O titular responde pelas atividades realizadas em sua conta, salvo falha comprovadamente atribuível à plataforma.</li>
      </ul>
    </>,
  },
  {
    id: "acesso",
    title: "Matrícula, duração e disponibilidade",
    content: <>
      <p>O acesso a cada curso depende de matrícula ativa e poderá ter prazo, escopo e condições definidos na oferta ou no contrato correspondente. O acesso não pode ser cedido, transferido ou revendido.</p>
      <p>Conteúdos, módulos e materiais podem receber correções, atualizações e melhorias. Alterações relevantes não eliminarão direitos já assegurados pela oferta ou pela legislação aplicável.</p>
    </>,
  },
  {
    id: "conteudo",
    title: "Conteúdo e propriedade intelectual",
    content: <>
      <p>Aulas, vídeos, textos, marcas, apresentações, materiais, métodos, identidade visual e demais conteúdos são protegidos por direitos autorais, propriedade intelectual e contratos aplicáveis.</p>
      <p>O usuário recebe licença limitada, pessoal, não exclusiva, revogável e intransferível para consumir o conteúdo durante o período autorizado. Não é permitido copiar, gravar, distribuir, publicar, revender, transmitir, disponibilizar credenciais ou explorar comercialmente o conteúdo sem autorização expressa.</p>
    </>,
  },
  {
    id: "protecao",
    title: "Proteção de vídeos e dispositivos",
    content: <>
      <p>A plataforma utiliza controles de sessão, limite de dispositivos, limite de reproduções simultâneas, identificação de aparelho e recursos de proteção de vídeo, incluindo DRM e marca d’água personalizada.</p>
      <p>Tentar contornar, remover, desativar ou interferir nesses controles poderá resultar no encerramento de sessões, bloqueio preventivo e suspensão do acesso, sem prejuízo da apuração de uso indevido.</p>
    </>,
  },
  {
    id: "progresso",
    title: "Progresso e certificados",
    content: <>
      <p>O progresso é calculado com base na interação e no tempo efetivamente reconhecido pela plataforma. Avanços artificiais, automações ou manipulação de requisições podem ser desconsiderados.</p>
      <p>Quando habilitado, o certificado é emitido após o cumprimento dos critérios do curso. O certificado confirma a participação ou conclusão dentro do Academy Play e não equivale, por si só, a diploma acadêmico, registro profissional ou autorização para exercício de atividade regulamentada.</p>
    </>,
  },
  {
    id: "conduta",
    title: "Condutas proibidas",
    content: <>
      <p>É proibido utilizar a plataforma para fraude, acesso indevido, violação de direitos, distribuição de malware, sobrecarga deliberada, coleta automatizada não autorizada, engenharia reversa ou tentativa de explorar vulnerabilidades.</p>
      <p>Também é proibido utilizar dados, materiais ou recursos da plataforma para prejudicar outros usuários, a Casa do Ads, seus fornecedores ou terceiros.</p>
    </>,
  },
  {
    id: "pagamentos",
    title: "Compras, cancelamentos e reembolsos",
    content: <>
      <p>Preço, forma de pagamento, prazo de acesso, renovação, cancelamento e eventual reembolso seguem a oferta aceita, o contrato aplicável, o canal de compra e a legislação de proteção do consumidor.</p>
      <p>Solicitações comerciais devem ser apresentadas pelos canais oficiais da Casa do Ads. Nenhuma cláusula destes Termos limita direitos que não possam ser afastados pelo Código de Defesa do Consumidor.</p>
    </>,
  },
  {
    id: "suspensao",
    title: "Suspensão e encerramento",
    content: <>
      <p>O acesso poderá ser suspenso preventivamente diante de indícios de fraude, compartilhamento de conta, violação de segurança, uso ilegal ou descumprimento destes Termos. Quando cabível, o usuário poderá apresentar esclarecimentos pelo canal de atendimento.</p>
      <p>O encerramento da conta não impede a conservação de registros necessários ao cumprimento de obrigações legais, exercício de direitos ou prevenção de fraude, conforme descrito na Política de Privacidade.</p>
    </>,
  },
  {
    id: "disponibilidade",
    title: "Disponibilidade e responsabilidade",
    content: <>
      <p>A Casa do Ads busca manter a plataforma segura e disponível, mas poderá realizar manutenções e enfrentar indisponibilidades decorrentes de terceiros, internet, energia, dispositivos ou eventos fora de seu controle razoável.</p>
      <p>Os conteúdos possuem finalidade educacional. Resultados profissionais, comerciais ou financeiros dependem de fatores externos e da aplicação individual, portanto não são garantidos. Permanecem preservadas as responsabilidades que não possam ser excluídas pela legislação.</p>
    </>,
  },
  {
    id: "privacidade",
    title: "Privacidade e dados pessoais",
    content: <p>O tratamento de dados pessoais relacionado ao Academy Play está descrito na <a href="/privacidade">Política de Privacidade</a>, que integra estes Termos para fins de informação e transparência.</p>,
  },
  {
    id: "alteracoes",
    title: "Alterações destes Termos",
    content: <>
      <p>Estes Termos podem ser atualizados para refletir mudanças legais, operacionais ou nos recursos da plataforma. A versão e a data de atualização permanecem visíveis nesta página.</p>
      <p>Quando uma alteração exigir novo aceite ou afetar materialmente a relação com o usuário, a Casa do Ads adotará comunicação ou confirmação compatível com a situação.</p>
    </>,
  },
  {
    id: "lei-contato",
    title: "Legislação e contato",
    content: <>
      <p>Aplicam-se as leis da República Federativa do Brasil. Nas relações de consumo, ficam preservados o foro e os direitos assegurados ao consumidor.</p>
      <p>Dúvidas ou solicitações podem ser encaminhadas para <a href="mailto:contato@casadoads.com.br">contato@casadoads.com.br</a>. Referência oficial: <a href="https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm" target="_blank" rel="noreferrer">Código de Defesa do Consumidor</a>.</p>
    </>,
  },
];

export default function TermsPage() {
  return <LegalDocument
    label="Documento legal"
    title="Termos de Uso"
    summary="Regras para acesso à conta, consumo dos cursos, proteção dos conteúdos e utilização responsável do Academy Play."
    version="2026-09-03"
    updatedAt="3 de setembro de 2026"
    sections={sections}
  />;
}
