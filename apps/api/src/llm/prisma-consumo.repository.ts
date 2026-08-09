import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  ConsumoRepository,
  type ConsumoPorDia,
  type ConsumoPorModelo,
  type ConsumoPorProcesso,
  type Janela,
  type RegistroDeChamada,
} from "./consumo.repository.js";

/**
 * `Decimal` do Postgres vira `number` na fronteira do JSON.
 *
 * Guardar dinheiro como decimal e somar como decimal é o que evita centavo
 * perdido; converter só na saída, depois da soma feita pelo banco, mantém a
 * precisão onde ela importa e entrega um número que a tela sabe formatar.
 */
function paraNumero(valor: Prisma.Decimal | number | null): number {
  if (valor === null) return 0;
  return typeof valor === "number" ? valor : valor.toNumber();
}

@Injectable()
export class PrismaConsumoRepository extends ConsumoRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async registrar(dados: RegistroDeChamada): Promise<string> {
    const linha = await this.prisma.llmChamada.create({
      data: {
        processo: dados.processo,
        modelo: dados.modelo,
        modeloServido: dados.modeloServido,
        tokensEntrada: dados.tokensEntrada,
        tokensSaida: dados.tokensSaida,
        tokensCache: dados.tokensCache,
        tokensRaciocinio: dados.tokensRaciocinio,
        custoCreditos:
          dados.custoCreditos === null ? null : new Prisma.Decimal(dados.custoCreditos),
        duracaoMs: dados.duracaoMs,
        status: dados.status,
        erro: dados.erro,
        referencia: dados.referencia,
        geracaoId: dados.geracaoId,
      },
      select: { id: true },
    });
    return linha.id;
  }

  /**
   * O relatório principal: quem consome o quê.
   *
   * `referencias` sai por SQL porque `groupBy` do Prisma não faz
   * `count(distinct)`, e é justamente esse número que permite dividir o gasto
   * por fatura em vez de só somar tokens.
   */
  async porProcesso({ desde, ate }: Janela): Promise<ConsumoPorProcesso[]> {
    const linhas = await this.prisma.$queryRaw<
      {
        processo: string;
        chamadas: bigint;
        falhas: bigint;
        tokens_entrada: bigint | null;
        tokens_saida: bigint | null;
        custo: Prisma.Decimal | null;
        referencias: bigint;
      }[]
    >`
      SELECT
        processo,
        count(*)                                        AS chamadas,
        count(*) FILTER (WHERE status = 'erro')         AS falhas,
        sum(tokens_entrada)                             AS tokens_entrada,
        sum(tokens_saida)                               AS tokens_saida,
        sum(custo_creditos)                             AS custo,
        count(DISTINCT referencia)                      AS referencias
      FROM llm_chamadas
      WHERE criado_em >= ${desde} AND criado_em < ${ate}
      GROUP BY processo
      ORDER BY sum(tokens_entrada + tokens_saida) DESC NULLS LAST
    `;

    return linhas.map((l) => {
      const entrada = Number(l.tokens_entrada ?? 0);
      const saida = Number(l.tokens_saida ?? 0);
      return {
        processo: l.processo,
        chamadas: Number(l.chamadas),
        falhas: Number(l.falhas),
        tokensEntrada: entrada,
        tokensSaida: saida,
        tokensTotais: entrada + saida,
        custoCreditos: paraNumero(l.custo),
        referencias: Number(l.referencias),
      };
    });
  }

  async porModelo({ desde, ate }: Janela): Promise<ConsumoPorModelo[]> {
    const linhas = await this.prisma.$queryRaw<
      {
        modelo: string;
        chamadas: bigint;
        tokens: bigint | null;
        custo: Prisma.Decimal | null;
      }[]
    >`
      SELECT
        modelo,
        count(*)                              AS chamadas,
        sum(tokens_entrada + tokens_saida)    AS tokens,
        sum(custo_creditos)                   AS custo
      FROM llm_chamadas
      WHERE criado_em >= ${desde} AND criado_em < ${ate}
      GROUP BY modelo
      ORDER BY sum(custo_creditos) DESC NULLS LAST
    `;

    return linhas.map((l) => ({
      modelo: l.modelo,
      chamadas: Number(l.chamadas),
      tokensTotais: Number(l.tokens ?? 0),
      custoCreditos: paraNumero(l.custo),
    }));
  }

  /** Série diária, para ver tendência em vez de só o acumulado. */
  async porDia({ desde, ate }: Janela): Promise<ConsumoPorDia[]> {
    const linhas = await this.prisma.$queryRaw<
      {
        dia: Date;
        chamadas: bigint;
        tokens: bigint | null;
        custo: Prisma.Decimal | null;
      }[]
    >`
      SELECT
        date_trunc('day', criado_em AT TIME ZONE 'America/Manaus') AS dia,
        count(*)                              AS chamadas,
        sum(tokens_entrada + tokens_saida)    AS tokens,
        sum(custo_creditos)                   AS custo
      FROM llm_chamadas
      WHERE criado_em >= ${desde} AND criado_em < ${ate}
      GROUP BY 1
      ORDER BY 1
    `;

    return linhas.map((l) => ({
      // Manaus, como toda regra de data deste sistema: um relatório que vira o
      // dia em UTC joga o consumo da noite para a data seguinte.
      dia: l.dia.toISOString().slice(0, 10),
      chamadas: Number(l.chamadas),
      tokensTotais: Number(l.tokens ?? 0),
      custoCreditos: paraNumero(l.custo),
    }));
  }
}
