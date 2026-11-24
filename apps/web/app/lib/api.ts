import {
  type DealStatus,
  clientDetailSchema,
  clientOwnersResponseSchema,
  contractDetailSchema,
  contractListSchema,
  emailStatusSchema,
  desempenhoDoFornecedorSchema,
  fornecedorSchema,
  historicoDeCotacoesRespostaSchema,
  itemDeEstoqueSchema,
  listarItensDeEstoqueRespostaSchema,
  lancamentoSchema,
  listarLancamentosRespostaSchema,
  listarMovimentacoesRespostaSchema,
  opcoesDoFinanceiroSchema,
  quadroFinanceiroSchema,
  resumoDosLancamentosRespostaSchema,
  listarPedidosDeCompraRespostaSchema,
  opcoesDeCompraRespostaSchema,
  pedidoDeCompraSchema,
  quadroDeComprasRespostaSchema,
  listarFornecedoresRespostaSchema,
  listClientsResponseSchema,
  listDealsResponseSchema,
  listIntegrationsResponseSchema,
  listJobRunsResponseSchema,
  listarOrdensDeServicoRespostaSchema,
  listarTarefasRespostaSchema,
  visaoGeralDaEngenhariaRespostaSchema,
  listarPlataformasRespostaSchema,
  listarUsinasRespostaSchema,
  monitoramentoDoDiaSchema,
  usinaSchema,
  agendaRespostaSchema,
  listarObrasRespostaSchema,
  listarProtocolosRespostaSchema,
  obraSchema,
  opcoesDasObrasRespostaSchema,
  opcoesDosProtocolosRespostaSchema,
  protocoloSchema,
  opcoesDeTarefasRespostaSchema,
  type DepartamentoComTarefas,
  opcoesDaEngenhariaRespostaSchema,
  ordemDeServicoSchema,
  quadroDeOrdensRespostaSchema,
  listaDaEquipeSchema,
  listPipelinesResponseSchema,
  opportunityDetailSchema,
  opportunityListSchema,
} from "@plugga/shared";

import { lerApi, type ResultadoApi } from "./api-client";
import type { EsquemaDeResposta } from "./api-core";

/**
 * Leituras do servidor para as telas (US12). Todas passam pelo cliente único
 * (`api-client.ts`): cookie, `X-Forwarded-For` e `Origin` repassados, tempo
 * máximo único, identificadores validados como UUID antes da chamada e resposta
 * validada com o schema de `@plugga/shared`.
 *
 * Cada função devolve `ResultadoApi`: a tela decide o que mostrar para
 * não autenticado, proibido, não encontrado e indisponível (T126). Antes, tudo
 * isso virava `null` e a página caía em dado de exemplo sem avisar.
 */

export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

const healthSchema: EsquemaDeResposta<HealthCheck> = {
  safeParse: (valor: unknown) =>
    typeof valor === "object" &&
    valor !== null &&
    (valor as { status?: unknown }).status === "ok" &&
    typeof (valor as { service?: unknown }).service === "string" &&
    typeof (valor as { timestamp?: unknown }).timestamp === "string"
      ? { success: true as const, data: valor as HealthCheck }
      : { success: false as const },
};

/** GET /health (contrato da API). Nunca chamada do navegador. */
export const fetchHealth = (): Promise<ResultadoApi<HealthCheck>> => lerApi("/health", healthSchema);

export const fetchIntegrations = () => lerApi("/integrations", listIntegrationsResponseSchema);

export const fetchJobs = () => lerApi("/jobs", listJobRunsResponseSchema);

export const fetchEmailStatus = () => lerApi("/email/status", emailStatusSchema);

/** GET /clientes (busca/filtro). CPF e telefone já chegam mascarados. */
/** GET /equipe: lista e escopo de quem pede (Configurações › Equipe). */
export const fetchEquipe = () => lerApi("/equipe", listaDaEquipeSchema);

export const fetchClients = (query: { q?: string; active?: string }) =>
  lerApi("/clientes", listClientsResponseSchema, {}, { consulta: query });

/** GET /clientes/:id: ficha completa do cliente, com contatos. */
export const fetchClient = (id: string) => lerApi("/clientes/:id", clientDetailSchema, { id });

/** GET /clientes/responsaveis: quem pode ser responsável por um cliente. */
export const fetchClientOwners = () => lerApi("/clientes/responsaveis", clientOwnersResponseSchema);

/** GET /suprimentos/fornecedores: cadastro único de fornecedores, com a contagem por situação. */
export const fetchFornecedores = (query: { busca?: string; situacao: string; categoria?: string }) =>
  lerApi("/suprimentos/fornecedores", listarFornecedoresRespostaSchema, {}, { consulta: query });

/** GET /suprimentos/fornecedores/:id: ficha completa, para editar. */
export const fetchFornecedor = (id: string) => lerApi("/suprimentos/fornecedores/:id", fornecedorSchema, { id });

/** GET /suprimentos/fornecedores/:id/desempenho: cotações, vitórias, comprado e prazo médio (PLU-334). */
export const fetchDesempenhoDoFornecedor = (id: string) => lerApi("/suprimentos/fornecedores/:id/desempenho", desempenhoDoFornecedorSchema, { id });

/** GET /suprimentos/fornecedores/:id/cotacoes: histórico, do mais recente, até 100. */
export const fetchCotacoesDoFornecedor = (id: string) => lerApi("/suprimentos/fornecedores/:id/cotacoes", historicoDeCotacoesRespostaSchema, { id });

type ConsultaDeCompras = Record<string, string | undefined>;

/** GET /suprimentos/compras/quadro: uma coluna por etapa, com contagem, soma e prazos. */
export const fetchQuadroDeCompras = (consulta: ConsultaDeCompras) =>
  lerApi("/suprimentos/compras/quadro", quadroDeComprasRespostaSchema, {}, { consulta });

/** GET /suprimentos/compras/pedidos: lista (até 200, os mais recentes), com total. */
export const fetchPedidosDeCompra = (consulta: ConsultaDeCompras) =>
  lerApi("/suprimentos/compras/pedidos", listarPedidosDeCompraRespostaSchema, {}, { consulta });

/** GET /suprimentos/compras/pedidos/:id: a ficha, com as ações que a pessoa pode fazer agora. */
export const fetchPedidoDeCompra = (id: string) => lerApi("/suprimentos/compras/pedidos/:id", pedidoDeCompraSchema, { id });

/** GET /suprimentos/compras/opcoes: pessoas, obras e fornecedores ativos. */
export const fetchOpcoesDeCompra = () => lerApi("/suprimentos/compras/opcoes", opcoesDeCompraRespostaSchema);

/** GET /pipelines: os pipelines que a pessoa alcança, com etapas, equipe e se pode configurá-los. */
export const fetchPipelinesAtivos = () =>
  lerApi("/pipelines", listPipelinesResponseSchema, {}, { consulta: { status: "active" } });

/** GET /leads: os negócios de um pipeline, em qualquer situação (o quadro e a lista filtram). */
export const fetchDeals = (pipelineId: string, status: DealStatus | "all" = "all") =>
  lerApi("/leads", listDealsResponseSchema, {}, { consulta: { pipelineId, status } });

export const fetchOpportunities = () => lerApi("/commercial/opportunities", opportunityListSchema);

export const fetchOpportunity = (id: string) =>
  lerApi("/commercial/opportunities/:id", opportunityDetailSchema, { id });

export const fetchContracts = () => lerApi("/commercial/contracts", contractListSchema);

export const fetchContract = (id: string) => lerApi("/commercial/contracts/:id", contractDetailSchema, { id });

type ConsultaDeEstoque = Record<string, string | undefined>;

/** GET /suprimentos/estoque/itens: itens com o saldo e o resumo (PLU-332). */
export const fetchItensDeEstoque = (consulta: ConsultaDeEstoque = {}) =>
  lerApi("/suprimentos/estoque/itens", listarItensDeEstoqueRespostaSchema, {}, { consulta });

/** GET /suprimentos/estoque/itens/:id: a ficha, com reservas, 8 semanas e últimas movimentações. */
export const fetchItemDeEstoque = (id: string) => lerApi("/suprimentos/estoque/itens/:id", itemDeEstoqueSchema, { id });

/** GET /suprimentos/estoque/movimentacoes: agrupadas por dia, com o resumo do período. */
export const fetchMovimentacoesDeEstoque = (consulta: ConsultaDeEstoque) =>
  lerApi("/suprimentos/estoque/movimentacoes", listarMovimentacoesRespostaSchema, {}, { consulta });

type ConsultaDoFinanceiro = Record<string, string | undefined>;

/** GET /financeiro/lancamentos: saídas e entradas que a pessoa alcança, com o resumo dos metric cards (PLU-336). */
export const fetchLancamentos = (consulta: ConsultaDoFinanceiro) =>
  lerApi("/financeiro/lancamentos", listarLancamentosRespostaSchema, {}, { consulta });

/** GET /financeiro/lancamentos/quadro: as 4 colunas com os totais de entradas e saídas. */
export const fetchQuadroFinanceiro = (consulta: ConsultaDoFinanceiro) =>
  lerApi("/financeiro/lancamentos/quadro", quadroFinanceiroSchema, {}, { consulta });

/** GET /financeiro/lancamentos/resumo: só os metric cards (o Quadro não precisa da lista). */
export const fetchResumoDosLancamentos = (consulta: ConsultaDoFinanceiro) =>
  lerApi("/financeiro/lancamentos/resumo", resumoDosLancamentosRespostaSchema, {}, { consulta });

/** GET /financeiro/lancamentos/:id: a ficha, com os marcos e as ações que a pessoa pode fazer agora. */
export const fetchLancamento = (id: string) => lerApi("/financeiro/lancamentos/:id", lancamentoSchema, { id });

/** GET /financeiro/opcoes: categorias e contas por empresa, fornecedores ativos e formas de pagamento. */
export const fetchOpcoesDoFinanceiro = () => lerApi("/financeiro/opcoes", opcoesDoFinanceiroSchema);

type ConsultaDaEngenharia = Record<string, string | undefined>;

/** GET /engenharia/ordens-de-servico: até 200 O.S., o total e as contagens dos metric cards e do filtro (PLU-345). */
export const fetchOrdensDeServico = (consulta: ConsultaDaEngenharia) =>
  lerApi("/engenharia/ordens-de-servico", listarOrdensDeServicoRespostaSchema, {}, { consulta });

/** GET /engenharia/ordens-de-servico/quadro: as 6 colunas, sem o filtro de situação. */
export const fetchQuadroDeOrdens = (consulta: ConsultaDaEngenharia) =>
  lerApi("/engenharia/ordens-de-servico/quadro", quadroDeOrdensRespostaSchema, {}, { consulta });

/** GET /engenharia/ordens-de-servico/:id: a ficha, com a linha do tempo e as ações permitidas agora. */
export const fetchOrdemDeServico = (id: string) => lerApi("/engenharia/ordens-de-servico/:id", ordemDeServicoSchema, { id });

/** GET /engenharia/ordens-de-servico/opcoes: técnicos e os enums dos menus. */
export const fetchOpcoesDaEngenharia = () => lerApi("/engenharia/ordens-de-servico/opcoes", opcoesDaEngenhariaRespostaSchema);

/** GET /tarefas/:departamento: as ocorrências do período, o progresso e as contagens (PLU-349, PLU-340). */
export const fetchTarefas = (departamento: DepartamentoComTarefas, consulta: Record<string, string | undefined>) =>
  lerApi(`/tarefas/${departamento}`, listarTarefasRespostaSchema, {}, { consulta });

/** GET /tarefas/:departamento/opcoes: pessoas, categorias e se a pessoa pode criar. */
export const fetchOpcoesDeTarefas = (departamento: DepartamentoComTarefas) => lerApi(`/tarefas/${departamento}/opcoes`, opcoesDeTarefasRespostaSchema);

/** GET /engenharia/visao-geral: os metric cards, o campo de hoje, as atrasadas e as tarefas de hoje (PLU-349). */
export const fetchVisaoGeralDaEngenharia = (consulta: Record<string, string | undefined>) =>
  lerApi("/engenharia/visao-geral", visaoGeralDaEngenhariaRespostaSchema, {}, { consulta });

/** GET /engenharia/monitoramento: as plataformas do dia, pendentes primeiro (PLU-347). */
export const fetchMonitoramentoDoDia = (consulta: Record<string, string | undefined>) =>
  lerApi("/engenharia/monitoramento", monitoramentoDoDiaSchema, {}, { consulta });

/** GET /engenharia/usinas: o cadastro, com a última conferência de cada usina. */
export const fetchUsinas = (consulta: Record<string, string | undefined>) => lerApi("/engenharia/usinas", listarUsinasRespostaSchema, {}, { consulta });

/** GET /engenharia/usinas/:id: a ficha, com o monitoramento por dia e as O.S. */
export const fetchUsina = (id: string) => lerApi("/engenharia/usinas/:id", usinaSchema, { id });

/** GET /engenharia/plataformas: as plataformas de inversor e se a pessoa edita. */
export const fetchPlataformas = () => lerApi("/engenharia/plataformas", listarPlataformasRespostaSchema);

/** GET /engenharia/agenda: a semana × técnico e as O.S. para agendar (PLU-346). */
export const fetchAgendaDeCampo = (consulta: Record<string, string | undefined>) => lerApi("/engenharia/agenda", agendaRespostaSchema, {}, { consulta });

/** GET /protocolos: os protocolos na distribuidora, com as contagens (PLU-348). */
export const fetchProtocolos = (consulta: Record<string, string | undefined>) => lerApi("/protocolos", listarProtocolosRespostaSchema, {}, { consulta });

/** GET /protocolos/:id: a ficha, com o histórico de verificações. */
export const fetchProtocolo = (id: string) => lerApi("/protocolos/:id", protocoloSchema, { id });

/** GET /protocolos/opcoes: distribuidoras, tipos, situações e os departamentos da pessoa. */
export const fetchOpcoesDosProtocolos = () => lerApi("/protocolos/opcoes", opcoesDosProtocolosRespostaSchema);

/** GET /engenharia/obras: as obras com os marcos e as contagens (PLU-350). */
export const fetchObras = (consulta: Record<string, string | undefined>) => lerApi("/engenharia/obras", listarObrasRespostaSchema, {}, { consulta });

/** GET /engenharia/obras/:id: a ficha, com marcos, documentos e O.S. */
export const fetchObra = (id: string) => lerApi("/engenharia/obras/:id", obraSchema, { id });

/** GET /engenharia/obras/opcoes: responsáveis e catálogos da Nova obra. */
export const fetchOpcoesDasObras = () => lerApi("/engenharia/obras/opcoes", opcoesDasObrasRespostaSchema);
