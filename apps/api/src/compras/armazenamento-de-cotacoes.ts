import { Injectable } from "@nestjs/common";
import type { CompanyKey } from "@plugga/shared";

import { baldeDe } from "../core/armazenamento/baldes.js";
import { ArmazenamentoS3, type ObjetoGuardado } from "../core/armazenamento/armazenamento-s3";

/**
 * Onde o orçamento anexado ao pedido de compra fica guardado. A falha não é
 * engolida: o anexo é requisito do processo (POP §2.1, item 6) e a evidência da
 * análise de orçamentos. Storage fora do ar derruba a criação do pedido inteira.
 */
export type CotacaoGuardada = ObjetoGuardado;

/** Orçamento é PDF ou imagem; o resto é engano. */
const EXTENSAO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const TIPOS_ACEITOS = Object.keys(EXTENSAO);

@Injectable()
export class ArmazenamentoDeCotacoes {
  private readonly s3 = new ArmazenamentoS3({
    extensoes: EXTENSAO,
    prefixo: "cotacoes",
    nomePadrao: "orcamento",
    mensagemNaoConfigurado:
      "armazenamento de anexos não configurado (STORAGE_ENDPOINT); o pedido de compra exige o orçamento anexado",
  });

  /** Guarda o orçamento. Lança se não conseguir. */
  async guardar(
    conteudo: Buffer,
    mime: string,
    nomeOriginal: string,
    empresa: CompanyKey,
  ): Promise<CotacaoGuardada> {
    // Compras fica sob o Financeiro, e cada empresa tem o seu balde. Uma empresa
    // inválida falha aqui, antes de qualquer envio.
    const balde = baldeDe(empresa, "financeiro");
    return this.s3.guardarEm(balde, conteudo, mime, nomeOriginal);
  }
}
