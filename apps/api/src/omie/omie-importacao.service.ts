import { Inject, Injectable } from "@nestjs/common";
import {
  conferenciaDoOmieSchema,
  resultadoDaImportacaoDoOmieSchema,
  type CompanyKey,
  type ConferenciaDoOmie,
  type ResultadoDaImportacaoDoOmie,
} from "@plugga/shared";

import { EstadoInvalido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { OmieConexoesService } from "./omie-conexoes.service";
import { OmiePort } from "./omie.port";
import { PrismaOmieImportacaoRepository, type LidosDoOmie } from "./prisma-omie-importacao.repository";

const NOME_DA_EMPRESA: Record<CompanyKey, string> = { plugga: "Plugga", waze: "Waze" };

/**
 * O OMIE recusa a mesma consulta repetida em menos de 60 s ("consumo redundante"). A
 * gerência confere, olha e importa: a importação usa o que a conferência leu, se for de
 * até 5 min; conferir de novo em menos de 1 min também reaproveita a leitura. A trava e a
 * reconferência dentro da transação continuam valendo.
 */
export const VALIDADE_DA_LEITURA_PARA_IMPORTAR_MS = 5 * 60_000;
export const VALIDADE_DA_LEITURA_PARA_CONFERIR_MS = 60_000;

/**
 * "Conferir com o OMIE" e "Importar do OMIE" (S4, PLU-342), por empresa e a pedido da
 * gerência. Lê o plano de contas e as contas correntes do OMIE com o par confirmado da
 * empresa (no modo mock, o dublê) e compara com o cadastro do Plugga OS, que é o dono.
 * Não há espelhamento automático: o OMIE só é lido quando alguém pede.
 */
@Injectable()
export class OmieImportacaoService {
  /** A última leitura do OMIE por empresa, nesta instância da API. */
  private readonly leituras = new Map<CompanyKey, { lidos: LidosDoOmie; em: number; par: string }>();

  constructor(
    @Inject(OmieConexoesService) private readonly conexoes: OmieConexoesService,
    @Inject(OmiePort) private readonly omie: OmiePort,
    @Inject(PrismaOmieImportacaoRepository) private readonly repositorio: PrismaOmieImportacaoRepository,
  ) {}

  async conferir(empresa: CompanyKey, agora = new Date()): Promise<ConferenciaDoOmie> {
    const { lidos, em } = await this.ler(empresa, agora, VALIDADE_DA_LEITURA_PARA_CONFERIR_MS);
    return this.paraATela(empresa, await this.repositorio.conferir(empresa, lidos), em);
  }

  async importar(empresa: CompanyKey, principal: AuthPrincipal, agora = new Date()): Promise<ResultadoDaImportacaoDoOmie> {
    const { lidos, em } = await this.ler(empresa, agora, VALIDADE_DA_LEITURA_PARA_IMPORTAR_MS);
    const contagem = await this.repositorio.importar(empresa, lidos, principal, agora);
    // A conferência de depois, com o mesmo que foi lido: a tela troca por ela.
    const conferencia = this.paraATela(empresa, await this.repositorio.conferir(empresa, lidos), em);
    return resultadoDaImportacaoDoOmieSchema.parse({ ...contagem, conferencia });
  }

  /** O que o OMIE devolveu e quando foi lido (a leitura guardada vale só para o mesmo par). */
  private async ler(empresa: CompanyKey, agora: Date, validadeMs: number): Promise<{ lidos: LidosDoOmie; em: Date }> {
    // A conexão é conferida sempre, mesmo com leitura guardada: desligada, nada vale.
    const credenciais = await this.conexoes.credenciais(empresa);
    if (!credenciais) {
      this.leituras.delete(empresa);
      throw new EstadoInvalido(`Conecte o OMIE da ${NOME_DA_EMPRESA[empresa]} antes de importar.`);
    }
    const guardada = this.leituras.get(empresa);
    if (guardada && guardada.par === credenciais.appKey && agora.getTime() - guardada.em < validadeMs) return { lidos: guardada.lidos, em: new Date(guardada.em) };
    const [categorias, contas] = await Promise.all([this.omie.listarCategorias(credenciais), this.omie.listarContasCorrentes(credenciais)]);
    const lidos = { categorias, contas };
    this.leituras.set(empresa, { lidos, em: agora.getTime(), par: credenciais.appKey });
    return { lidos, em: agora };
  }

  private paraATela(empresa: CompanyKey, r: Awaited<ReturnType<PrismaOmieImportacaoRepository["conferir"]>>, lidoEm: Date): ConferenciaDoOmie {
    return conferenciaDoOmieSchema.parse({
      empresa,
      lidoEm: lidoEm.toISOString(),
      categorias: { itens: r.categorias.itens, resumo: r.categorias.resumo },
      contasCorrentes: { itens: r.contas.itens, resumo: r.contas.resumo },
    });
  }
}
