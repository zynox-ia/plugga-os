import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  extratoImportadoSchema,
  movimentosDoExtratoRespostaSchema,
  type ExtratoImportado,
  type ListarMovimentosDoExtratoQuery,
  type MovimentosDoExtratoResposta,
} from "@plugga/shared";

import { ArquivoRecusado, LimiteExcedido, RequisicaoInvalida, TipoNaoPermitido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { nomeSeguro } from "../lead-documentos/lead-documentos.rules";
import { EXTRATO_MAX_BYTES, ExtratoRecusado, extratoEhDaConta, lerOfx, type ExtratoLido } from "./extrato-ofx";
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
      return extratoImportadoSchema.parse(await this.repositorio.importar(conta, guardado, lido, principal, this.agora()));
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
}
