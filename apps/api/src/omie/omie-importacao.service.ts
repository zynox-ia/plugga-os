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
 * "Conferir com o OMIE" e "Importar do OMIE" (S4, PLU-342), por empresa e a pedido da
 * gerência. Lê o plano de contas e as contas correntes do OMIE com o par confirmado da
 * empresa (no modo mock, o dublê) e compara com o cadastro do Plugga OS, que é o dono.
 * Não há espelhamento automático: o OMIE só é lido quando alguém pede.
 */
@Injectable()
export class OmieImportacaoService {
  constructor(
    @Inject(OmieConexoesService) private readonly conexoes: OmieConexoesService,
    @Inject(OmiePort) private readonly omie: OmiePort,
    @Inject(PrismaOmieImportacaoRepository) private readonly repositorio: PrismaOmieImportacaoRepository,
  ) {}

  async conferir(empresa: CompanyKey, agora = new Date()): Promise<ConferenciaDoOmie> {
    const lidos = await this.ler(empresa);
    return this.paraATela(empresa, await this.repositorio.conferir(empresa, lidos), agora);
  }

  async importar(empresa: CompanyKey, principal: AuthPrincipal, agora = new Date()): Promise<ResultadoDaImportacaoDoOmie> {
    const lidos = await this.ler(empresa);
    const contagem = await this.repositorio.importar(empresa, lidos, principal, agora);
    // A conferência de depois, com o mesmo que foi lido: a tela troca por ela.
    const conferencia = this.paraATela(empresa, await this.repositorio.conferir(empresa, lidos), agora);
    return resultadoDaImportacaoDoOmieSchema.parse({ ...contagem, conferencia });
  }

  private async ler(empresa: CompanyKey): Promise<LidosDoOmie> {
    const credenciais = await this.conexoes.credenciais(empresa);
    if (!credenciais) throw new EstadoInvalido(`Conecte o OMIE da ${NOME_DA_EMPRESA[empresa]} antes de importar.`);
    const [categorias, contas] = await Promise.all([this.omie.listarCategorias(credenciais), this.omie.listarContasCorrentes(credenciais)]);
    return { categorias, contas };
  }

  private paraATela(empresa: CompanyKey, r: Awaited<ReturnType<PrismaOmieImportacaoRepository["conferir"]>>, agora: Date): ConferenciaDoOmie {
    return conferenciaDoOmieSchema.parse({
      empresa,
      lidoEm: agora.toISOString(),
      categorias: { itens: r.categorias.itens, resumo: r.categorias.resumo },
      contasCorrentes: { itens: r.contas.itens, resumo: r.contas.resumo },
    });
  }
}
