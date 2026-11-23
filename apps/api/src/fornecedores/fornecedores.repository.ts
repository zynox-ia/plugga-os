import type {
  CriarFornecedor,
  DadosDePagamentoRevelados,
  RevelarDadosDePagamento,
  DesempenhoDoFornecedor,
  HistoricoDeCotacoesResposta,
  EditarFornecedor,
  Fornecedor,
  ListarFornecedoresQuery,
  ListarFornecedoresResposta,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class FornecedoresRepository {
  abstract listar(query: ListarFornecedoresQuery): Promise<ListarFornecedoresResposta>;
  abstract obter(id: string): Promise<Fornecedor>;
  abstract criar(input: CriarFornecedor, principal: AuthPrincipal): Promise<Fornecedor>;
  abstract editar(id: string, input: EditarFornecedor, principal: AuthPrincipal): Promise<Fornecedor>;
  abstract mudarSituacao(id: string, ativo: boolean, principal: AuthPrincipal): Promise<Fornecedor>;
  abstract desempenho(id: string): Promise<DesempenhoDoFornecedor>;
  abstract historicoDeCotacoes(id: string): Promise<HistoricoDeCotacoesResposta>;
  abstract revelarDadosDePagamento(id: string, input: RevelarDadosDePagamento, principal: AuthPrincipal): Promise<DadosDePagamentoRevelados>;
}
