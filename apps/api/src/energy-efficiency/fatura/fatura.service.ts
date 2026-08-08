import { Injectable } from "@nestjs/common";
import { invoiceReadingSchema, type InvoiceReading } from "@plugga/shared";

import { lerFatura } from "./leitura.js";

/**
 * Traduz a leitura interna para o contrato que a tela consome.
 *
 * A camada interna carrega coisas que não interessam à tela — a linha original
 * de onde cada número saiu, a diferença exata da conferência — e usa nomes em
 * português que não combinam com o resto do contrato. Aqui a forma é achatada e
 * o vocabulário alinhado.
 */
@Injectable()
export class FaturaService {
  ler(pdf: Buffer, nomeDoArquivo: string): InvoiceReading {
    const leitura = lerFatura(pdf);

    return invoiceReadingSchema.parse({
      origem: leitura.origem,
      aproveitavel: leitura.aproveitavel,
      motivo: leitura.motivo,
      unidadeConsumidoraCodigo: leitura.identificacao.unidadeConsumidora,
      competenceMonth: leitura.identificacao.competencia?.mes ?? null,
      competenceYear: leitura.identificacao.competencia?.ano ?? null,
      distribuidora: leitura.identificacao.distribuidora,
      invoice: leitura.invoice,
      itens: leitura.conferencia.itens.map((item) => ({
        rotulo: item.rotulo,
        quantidade: item.quantidade,
        unidade: item.unidade,
        tarifa: item.tarifa,
        valor: item.valor,
        veredicto: item.veredicto,
        esperado: item.esperado,
      })),
      camposParaConfirmar: leitura.camposParaConfirmar,
      arquivoNome: nomeDoArquivo,
    });
  }
}
