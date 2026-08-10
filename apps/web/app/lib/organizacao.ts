import {
  companyKeys,
  departmentIdsByCompany,
  visibleCompanies,
  visibleDepartments,
  type CompanyKey,
  type DepartmentId,
  type UserAccess,
} from "@plugga/shared";

import type { IconName } from "../components/plugga-shell";

/**
 * Organização do Plugga OS: Empresa → Departamento → Processo.
 *
 * Fonte única — a navegação lateral, o seletor de empresa e o mapa em
 * /estrutura leem daqui. Mudar um processo de departamento é mover uma linha,
 * não caçar a mesma informação em três lugares.
 *
 * Plugga e Waze não são departamentos: são contextos separados. Um cliente,
 * um pagamento ou uma obra pertence a uma delas e nunca aparece na outra.
 * O que atravessa as duas (usuários, jobs, integrações, o desenho dos
 * processos) vive em GLOBAIS, fora do seletor.
 *
 * Os **identificadores** de empresa e departamento vêm de `@plugga/shared`:
 * é a API que valida acesso contra eles, e rótulo/ícone/processo (que só a
 * navegação usa) continuam aqui. Renomear um id sem mexer no outro lado deixa
 * de compilar em vez de virar um acesso que não aparece em lugar nenhum.
 */

export const EMPRESAS = companyKeys;
export type EmpresaId = CompanyKey;
export type DepartamentoId = DepartmentId;

export const EMPRESA_PADRAO: EmpresaId = "plugga";

/**
 * `pronto` tem tela ligada a dado real; `parcial` tem tela, mas ainda é
 * mock ou incompleta; `em-breve` só existe no desenho. O status aparece na
 * própria navegação de propósito: uma tela que promete e não entrega custa
 * mais confiança do que um item honestamente marcado como não construído.
 */
export type ProcessoStatus = "pronto" | "parcial" | "em-breve";

export type Processo = {
  label: string;
  /** Ausente enquanto o processo não tem tela. */
  rota?: string;
  status: ProcessoStatus;
};

export type Departamento = {
  id: DepartamentoId;
  label: string;
  icon: IconName;
  processos: Processo[];
};

export type Empresa = {
  id: EmpresaId;
  nome: string;
  descricao: string;
  /** Duas letras para o seletor enquanto não há marca própria por empresa. */
  sigla: string;
  departamentos: Departamento[];
};

export function isEmpresaId(value: string | null | undefined): value is EmpresaId {
  return EMPRESAS.includes(value as EmpresaId);
}

/**
 * Empresas que a pessoa alcança, na ordem do catálogo. Sem sessão carregada
 * ainda, devolve todas: o shell precisa desenhar antes da resposta de /me, e
 * piscar "nenhuma empresa" para quem tem duas é pior que meio segundo de
 * navegação otimista — a API recusa o que a sessão não permite de qualquer forma.
 */
export function empresasPermitidas(acesso: UserAccess | null): readonly EmpresaId[] {
  if (!acesso) {
    return EMPRESAS;
  }
  return visibleCompanies(acesso);
}

/** Departamentos da empresa liberados para a pessoa, na ordem do catálogo. */
export function departamentosPermitidos(
  empresa: EmpresaId,
  acesso: UserAccess | null,
): Departamento[] {
  const { departamentos } = EMPRESAS_POR_ID[empresa];
  if (!acesso) {
    return departamentos;
  }
  const liberados = new Set<string>(visibleDepartments(acesso, empresa));
  return departamentos.filter((departamento) => liberados.has(departamento.id));
}

const plugga: Empresa = {
  id: "plugga",
  nome: "Plugga",
  sigla: "PL",
  descricao: "Consultoria: gestão de energia, OPM e eletromobilidade",
  departamentos: [
    {
      id: "comercial-clientes",
      label: "Comercial",
      icon: "users",
      processos: [
        { label: "Oportunidades", rota: "/comercial/oportunidades", status: "pronto" },
        { label: "Contratos de gestão", rota: "/comercial/contratos", status: "pronto" },
        { label: "Clientes", rota: "/clientes", status: "pronto" },
        { label: "Relacionamento comercial", rota: "/crm", status: "parcial" },
        { label: "Propostas", status: "em-breve" },
        { label: "Carteira", status: "em-breve" },
        { label: "Comissões", status: "em-breve" },
      ],
    },
    {
      id: "energia-opm",
      label: "Energia",
      icon: "bolt",
      processos: [
        { label: "Ciclos mensais", rota: "/energia-opm/ciclos", status: "pronto" },
        { label: "Auditoria de faturas", rota: "/energia-opm/auditorias", status: "pronto" },
        { label: "Migração Mercado Livre", rota: "/energia-opm/migracoes", status: "pronto" },
        { label: "Relatórios de economia", rota: "/energia-opm/relatorios", status: "parcial" },
        { label: "Eficiência energética", rota: "/energia-opm/eficiencia", status: "parcial" },
        { label: "Demanda contratada", status: "em-breve" },
        { label: "Oportunidades solar / BESS / reativo", status: "em-breve" },
      ],
    },
    {
      id: "produto-tecnologia",
      label: "Eletromobilidade",
      icon: "pulse",
      processos: [
        { label: "PluggaMob", rota: "/pluggamob", status: "parcial" },
        { label: "EV Point · eletropostos", status: "em-breve" },
        { label: "Recargas", status: "em-breve" },
        { label: "Parceiros", status: "em-breve" },
        { label: "Dashboards do produto", status: "em-breve" },
      ],
    },
    {
      id: "financeiro",
      label: "Financeiro",
      icon: "wallet",
      processos: [
        { label: "Compras", rota: "/compras", status: "pronto" },
        { label: "Contas a pagar", status: "em-breve" },
        { label: "Contas a receber", status: "em-breve" },
        { label: "Comprovantes", status: "em-breve" },
        { label: "D+14 Plugga", status: "em-breve" },
        { label: "Fornecedores", status: "em-breve" },
        { label: "Contratos administrativos", status: "em-breve" },
        { label: "Fiscal / contábil · OMIE", status: "em-breve" },
      ],
    },
  ],
};

const waze: Empresa = {
  id: "waze",
  nome: "Waze Energia",
  sigla: "WZ",
  descricao: "Engenharia e obras: projetos, instalações e serviços",
  departamentos: [
    {
      id: "comercial-obras",
      label: "Comercial",
      icon: "users",
      processos: [
        { label: "Oportunidades de obra", status: "em-breve" },
        { label: "Propostas técnicas / comerciais", status: "em-breve" },
        { label: "Contratos", status: "em-breve" },
        { label: "Medições comerciais", status: "em-breve" },
        { label: "Aditivos", status: "em-breve" },
        { label: "Relacionamento com cliente", status: "em-breve" },
      ],
    },
    {
      id: "engenharia-obras",
      label: "Engenharia",
      icon: "wrench",
      processos: [
        { label: "Obras", rota: "/engenharia", status: "parcial" },
        { label: "Projetos elétricos", status: "em-breve" },
        { label: "Ordens de serviço", status: "em-breve" },
        { label: "Instalações", status: "em-breve" },
        { label: "Manutenção", status: "em-breve" },
        { label: "Visitas técnicas", status: "em-breve" },
        { label: "Usinas solares · BESS", status: "em-breve" },
        { label: "Relatórios de campo · fotos e aceite", status: "em-breve" },
        // Movimentação de material fica com quem usa o material. Comprar é
        // Financeiro; estocar, retirar e entregar em obra é operação de campo.
        { label: "Estoque e entrega em obra", status: "em-breve" },
      ],
    },
    {
      id: "financeiro",
      label: "Financeiro",
      icon: "wallet",
      processos: [
        // O POP-COMP-001 vale para as duas empresas, e o pedido carrega a
        // empresa desde a primeira migração: ligar a Waze aqui é a mesma tela
        // lendo dados que a API já isola por `companyId`.
        { label: "Compras", rota: "/compras", status: "pronto" },
        { label: "Contas a pagar", status: "em-breve" },
        { label: "Contas a receber", status: "em-breve" },
        { label: "Comprovantes", status: "em-breve" },
        { label: "D+14 Waze", status: "em-breve" },
        { label: "Fornecedores", status: "em-breve" },
        { label: "Centro de custo por obra", status: "em-breve" },
        { label: "Conciliação", status: "em-breve" },
        { label: "Folha / benefícios", status: "em-breve" },
        { label: "Fiscal · OMIE", status: "em-breve" },
        { label: "Contratos administrativos", status: "em-breve" },
      ],
    },
  ],
};

export const EMPRESAS_POR_ID: Record<EmpresaId, Empresa> = { plugga, waze };

/**
 * Início reúne o que antes eram duas telas disputando o mesmo lugar:
 * o Dashboard e a Central de Pendências. Os indicadores de cada processo
 * moram dentro do próprio departamento, então a tela de entrada fica livre
 * para responder só "o que precisa de mim hoje".
 */
export const VISAO_GERAL: Processo[] = [{ label: "Início", rota: "/", status: "parcial" }];

/**
 * Ferramentas atravessam todos os departamentos — abrem no dia a dia, mas não
 * pertencem a nenhum. Ficam visíveis na barra, sem competir com a árvore.
 */
export const FERRAMENTAS: Processo[] = [
  { label: "Documentos", rota: "/documentos", status: "parcial" },
  { label: "Relatórios", status: "em-breve" },
  { label: "Agentes IA", rota: "/agentes-ia", status: "parcial" },
];

/**
 * Configurações: o que se ajusta uma vez, não o que se usa todo dia. Entra
 * como **um** item no rodapé da barra, abrindo uma página com as seções
 * abaixo — se virassem sete linhas na sidebar, reconstruiríamos a poluição do
 * Bitrix, com o que se mexe por trimestre ao lado do que se usa por hora.
 *
 * `roles` filtra o que cada pessoa enxerga dentro da página. A entrada em si
 * aparece sempre: esconder o menu inteiro faz quem não tem acesso procurar
 * onde não existe.
 */
export type SecaoConfiguracao = Processo & {
  descricao: string;
  roles: readonly string[];
  /** Marca a seção que tem tela própria dentro de Configurações. */
  id?: "equipe" | "chave-llm";
  /**
   * Também visível para gestor de departamento. Quem gestiona precisa da mesma
   * porta que o admin — só que a tela atrás dela mostra o escopo dele.
   */
  gestor?: boolean;
};

export const CONFIGURACOES: SecaoConfiguracao[] = [
  {
    // "Equipe" e "Papéis e permissões" eram a mesma pergunta partida em duas
    // telas: quem tem acesso, e a que. Separá-las obrigaria a atravessar de uma
    // para a outra a cada convite; aqui papel e departamento são campos da
    // mesma linha de acesso.
    id: "equipe",
    label: "Equipe e acessos",
    descricao:
      "Quem entra, com que papel e em qual empresa/departamento. A mesma pessoa pode ser financeiro na Plugga e nada na Waze.",
    status: "pronto",
    roles: ["admin"],
    gestor: true,
  },
  {
    // Chave de IA: fica em configurações porque troca com frequência e não deve
    // exigir edição de arquivo e reinício de contêiner a cada rotação.
    id: "chave-llm",
    label: "Chave de IA",
    descricao:
      "A credencial da OpenRouter que serve o sistema inteiro. Guardada cifrada, trocável por aqui, e todo consumo dela é medido por processo.",
    status: "pronto",
    roles: ["admin"],
  },
  {
    label: "Departamentos e processos",
    descricao:
      "Desenho dos fluxos: etapas, tarefas, prazos de SLA e KPIs. Uma definição só, usada pelas duas empresas.",
    status: "em-breve",
    roles: ["admin", "diretoria"],
  },
  {
    label: "Empresas",
    descricao: "Plugga e Waze Energia: identidade e departamentos ativos em cada uma.",
    status: "em-breve",
    roles: ["admin"],
  },
  {
    label: "Integrações",
    descricao: "Bitrix, OMIE, PagBank e PluggaMob — modo e saúde de cada uma.",
    rota: "/integracoes",
    status: "pronto",
    roles: ["admin", "tech"],
  },
  {
    label: "Jobs e automações",
    descricao: "Agendamentos, histórico de execução e falhas.",
    rota: "/jobs",
    status: "pronto",
    roles: ["admin", "tech"],
  },
  {
    label: "Canais e notificações",
    descricao: "E-mail transacional, Telegram e WhatsApp.",
    status: "em-breve",
    roles: ["admin", "tech"],
  },
];

/**
 * Seções visíveis para a sessão. Sem papel que alcance nenhuma, nenhuma — e a
 * tela diz isso em vez de mostrar uma lista vazia sem explicação.
 */
export function configuracoesParaAcesso(usuario: {
  roles: readonly string[];
  access: UserAccess;
}): SecaoConfiguracao[] {
  const gestor = usuario.access.companies.some((empresa) =>
    empresa.departments.some((departamento) => departamento.isManager),
  );

  return CONFIGURACOES.filter(
    (secao) =>
      secao.roles.some((role) => usuario.roles.includes(role)) || (secao.gestor === true && gestor),
  );
}

/**
 * Fora do seletor: não pertencem à Plugga nem à Waze. Usuário é único (o papel
 * é que é por empresa), e job/integração/agente servem as duas. O desenho dos
 * processos também mora aqui — é uma definição só, instanciada nas duas.
 */
export const GLOBAIS: Processo[] = [
  { label: "Configurações", rota: "/configuracoes", status: "pronto" },
  { label: "Estrutura do sistema", rota: "/estrutura", status: "pronto" },
  // Rota herdada do Bloco A; o conteúdo dela mora em Configurações → Equipe.
  { label: "Administração", rota: "/administracao", status: "parcial" },
];

/**
 * O catálogo de navegação e o de acesso descrevem a mesma estrutura em lados
 * opostos da fronteira HTTP. Esta checagem quebra alto, no carregamento do
 * módulo, se um departamento existir só de um lado — um id novo aqui sem par em
 * `@plugga/shared` viraria um item de menu que ninguém consegue liberar, e o
 * contrário, um acesso concedido que não aparece na tela. Falhar na primeira
 * página aberta em dev é mais barato do que descobrir pela pessoa que ficou
 * sem ver o próprio departamento.
 */
const _catalogosCasam: Record<EmpresaId, true> = EMPRESAS.reduce(
  (acumulado, empresa) => {
    const naNavegacao = EMPRESAS_POR_ID[empresa].departamentos.map((d) => d.id).sort();
    const noContrato = [...departmentIdsByCompany[empresa]].sort();
    if (JSON.stringify(naNavegacao) !== JSON.stringify(noContrato)) {
      throw new Error(
        `departamentos de ${empresa} divergem entre organizacao.ts e @plugga/shared`,
      );
    }
    return { ...acumulado, [empresa]: true };
  },
  {} as Record<EmpresaId, true>,
);
void _catalogosCasam;
