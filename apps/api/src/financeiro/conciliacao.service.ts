import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  extratoImportadoSchema,
  lancamentoCriadoNaConciliacaoSchema,
  movimentosDoExtratoRespostaSchema,
  painelDaConciliacaoSchema,
  alcancaTela,
  sugestaoDaTarifaSchema,
  tarifasCriadasSchema,
  transferenciaCriadaSchema,
  type CriarLancamentoDoExtrato,
  type CriarTarifa,
  type CriarTarifas,
  type CriarTransferencia,
  type EscopoDaConciliacao,
  type ExtratoImportado,
  type LancamentoCriadoNaConciliacao,
  type ListarMovimentosDoExtratoQuery,
  type MarcarNaConciliacao,
  type MovimentosDoExtratoResposta,
  type PainelDaConciliacao,
  type SugestaoDaTarifa,
  type TarifasCriadas,
  type TransferenciaCriada,
  type TransferenciaDoExtrato,
} from "@plugga/shared";

import { AcessoNegado, ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { EXTRATO_MAX_BYTES, ExtratoRecusado, extratoEhDaConta, lerOfx, type ExtratoLido } from "./extrato-ofx";
import { papelNoFinanceiro } from "./financeiro.rules";
import type { ArquivoRecebido } from "./financeiro.service";
import { RELOGIO_DO_FINANCEIRO } from "./financeiro.service";
import { PrismaConciliacaoRepository } from "./prisma-conciliacao.repository";

/**
 * A conciliação (PLU-339), fatia C1: o extrato bancário entra por arquivo OFX e vira os
 * movimentos da conta. O original vai ao armazenamento, numa chave isolada por empresa, e
 * fica: o extrato não se apaga. Nem o arquivo nem a descrição dos movimentos vão a log.
 */
@Injectable()
export class ConciliacaoService {
  private readonly logger = new Logger(ConciliacaoService.name);

  constructor(
    @Inject(PrismaConciliacaoRepository) private readonly repositorio: PrismaConciliacaoRepository,
    @Inject(ArmazenamentoDeDocumentos) private readonly armazenamento: ArmazenamentoDeDocumentos,
    @Inject(RELOGIO_DO_FINANCEIRO) private readonly agora: () => Date,
  ) {}

  async importarExtrato(contaId: string, arquivo: ArquivoRecebido | undefined, principal: AuthPrincipal): Promise<ExtratoImportado> {
    if (!arquivo) throw new RequisicaoInvalida("Envie o arquivo do extrato.", [{ campo: "arquivo", problema: "Envie o extrato em OFX." }]);
    if (arquivo.buffer.length === 0) throw new TipoNaoPermitido("O arquivo está vazio.");
    if (arquivo.buffer.length > EXTRATO_MAX_BYTES) throw new LimiteExcedido("O extrato é maior que o limite de 5 MiB.", "ARQUIVO_GRANDE_DEMAIS");
    let lido: ExtratoLido;
    try {
      lido = lerOfx(arquivo.buffer);
    } catch (erro) {
      if (erro instanceof ExtratoRecusado) throw new ArquivoRecusado(erro.message);
      throw erro;
    }
    // A conta existe para a pessoa (RLS) e o extrato é dela.
    const conta = await this.repositorio.conta(contaId);
    if (!extratoEhDaConta(conta.numero, lido.conta?.conta ?? null)) {
      throw new RequisicaoInvalida("Este extrato é de outra conta: o número no arquivo não confere com o da conta escolhida.", [{ campo: "arquivo", problema: "O número da conta não confere." }]);
    }

    const nome = arquivo.nomeOriginal.trim().slice(0, 200) || "extrato.ofx";
    const guardado = {
      chave: `financeiro/extratos/${conta.companyId}/${conta.id}/${randomUUID()}-${nomeSeguro(nome)}`,
      nome,
      tamanho: arquivo.buffer.length,
      sha256: createHash("sha256").update(arquivo.buffer).digest("hex"),
      origem: "ofx" as const,
    };
    await this.armazenamento.enviar(guardado.chave, arquivo.buffer, "application/x-ofx");
    try {
      const importado = await this.repositorio.importar(conta, guardado, lido, principal, this.agora());
      // Sem o número de um dos lados, a conta não foi conferida: a tela avisa.
      return extratoImportadoSchema.parse({ ...importado, contaConferida: Boolean(conta.numero?.trim() && lido.conta?.conta) });
    } catch (erro) {
      // O arquivo de uma importação que não entrou não fica sem registro no armazenamento.
      try {
        await this.armazenamento.excluir(guardado.chave);
      } catch {
        this.logger.warn("extrato não importado não pôde ser removido do armazenamento");
      }
      throw erro;
    }
  }

  async movimentos(query: ListarMovimentosDoExtratoQuery): Promise<MovimentosDoExtratoResposta> {
    return movimentosDoExtratoRespostaSchema.parse(await this.repositorio.listar(query));
  }

  async painel(escopo: EscopoDaConciliacao): Promise<PainelDaConciliacao> {
    return painelDaConciliacaoSchema.parse(await this.repositorio.painel(escopo));
  }

  async conciliar(movimentoId: string, lancamentoId: string, principal: AuthPrincipal): Promise<void> {
    await this.repositorio.conciliar(movimentoId, lancamentoId, principal, this.agora());
  }

  async conciliarSugeridos(escopo: EscopoDaConciliacao, principal: AuthPrincipal): Promise<{ conciliados: number }> {
    return { conciliados: await this.repositorio.conciliarSugeridos(escopo, principal, this.agora()) };
  }

  /** Desfazer é só da gerência do Financeiro (decisão conservadora, levada ao André), sempre com motivo. */
  async desfazer(movimentoId: string, motivo: string, principal: AuthPrincipal): Promise<void> {
    if (!papelNoFinanceiro(principal.acesso).gerente) throw new AcessoNegado("Só a gerência do Financeiro desfaz uma conciliação.");
    await this.repositorio.desfazer(movimentoId, motivo, principal, this.agora());
  }

  // C5: o que nasce na Conciliação, a partir de uma linha do extrato sem par.

  async sugestaoDaTarifa(movimentoId: string): Promise<SugestaoDaTarifa> {
    return sugestaoDaTarifaSchema.parse(await this.repositorio.sugestaoDaTarifa(movimentoId));
  }

  /** A tarifa: de quem tem a tela Conciliação (decisão do Coordenador, 24/11/2026). */
  async criarTarifa(entrada: CriarTarifa, principal: AuthPrincipal): Promise<LancamentoCriadoNaConciliacao> {
    return lancamentoCriadoNaConciliacaoSchema.parse(await this.repositorio.criarTarifa(entrada, principal, this.agora()));
  }

  async criarTarifas(entrada: CriarTarifas, principal: AuthPrincipal): Promise<TarifasCriadas> {
    const { movimentoIds, ...padrao } = entrada;
    return tarifasCriadasSchema.parse(await this.repositorio.criarTarifas(movimentoIds, padrao, principal, this.agora()));
  }

  /** A despesa guiada nasce paga sem a aprovação F2: só a gerência. A receita guiada, quem tem a tela. */
  async criarLancamento(entrada: CriarLancamentoDoExtrato, principal: AuthPrincipal): Promise<LancamentoCriadoNaConciliacao> {
    if (entrada.tipo === "saida" && !papelNoFinanceiro(principal.acesso).gerente) {
      throw new AcessoNegado("Só a gerência do Financeiro cria uma despesa já paga a partir do extrato.");
    }
    return lancamentoCriadoNaConciliacaoSchema.parse(await this.repositorio.criarLancamento(entrada, principal, this.agora()));
  }

  // C6: a transferência entre contas da mesma empresa.

  /** Na Lançamentos: só a gerência, que alcance as duas pernas (Contas a pagar e a receber, ou a Conciliação). */
  async criarTransferencia(entrada: CriarTransferencia, principal: AuthPrincipal): Promise<TransferenciaCriada> {
    this.garantirQuemTransfere(principal);
    return transferenciaCriadaSchema.parse(await this.repositorio.criarTransferencia(entrada, principal, this.agora()));
  }

  /** Da linha sem par, na Conciliação: só a gerência. */
  async transferenciaDoExtrato(entrada: TransferenciaDoExtrato, principal: AuthPrincipal): Promise<TransferenciaCriada> {
    this.garantirQuemTransfere(principal);
    return transferenciaCriadaSchema.parse(await this.repositorio.transferenciaDoExtrato(entrada, principal, this.agora()));
  }

  private garantirQuemTransfere(principal: AuthPrincipal): void {
    const papel = papelNoFinanceiro(principal.acesso);
    if (!papel.gerente) throw new AcessoNegado("Só a gerência do Financeiro transfere entre contas.");
    const alcancaAsDuasPernas = (papel.saidas && papel.entradas) || (principal.acesso !== undefined && alcancaTela(principal.acesso, "financeiro.conciliacao"));
    if (!alcancaAsDuasPernas) throw new AcessoNegado("A transferência tem as duas pontas: precisa de Contas a pagar e a receber, ou da Conciliação.");
  }

  async marcar(entrada: MarcarNaConciliacao): Promise<void> {
    const { marcado, ...alvo } = entrada;
    await this.repositorio.marcar(alvo as { movimentoId: string } | { lancamentoId: string }, marcado);
  }
}
