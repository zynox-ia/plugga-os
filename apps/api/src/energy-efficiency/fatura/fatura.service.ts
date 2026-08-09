import { Inject, Injectable } from "@nestjs/common";
import { invoiceReadingSchema, type InvoiceReading } from "@plugga/shared";

import { ArmazenamentoDeFaturas } from "./armazenamento.js";
import { reconhecerFormato } from "./formato.js";
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
  // Token explícito, não o tipo: o `vitest` transpila com esbuild, que não
  // emite `design:paramtypes`, e sem isto a injeção resolve `undefined` no
  // teste e estoura em tempo de execução.
  constructor(
    @Inject(ArmazenamentoDeFaturas) private readonly armazenamento: ArmazenamentoDeFaturas,
  ) {}

  async ler(conteudo: Buffer, nomeDoArquivo: string, senha?: string): Promise<InvoiceReading> {
    // Reconhecido uma vez e usado duas: a leitura por visão precisa do formato
    // para montar o anexo certo — PDF e imagem são blocos diferentes para o
    // modelo — e o armazenamento precisa dele para a extensão do objeto.
    const formato = reconhecerFormato(conteudo);
    const mime = formato.tipo === "imagem" ? formato.mime : "application/pdf";

    const leitura = await lerFatura(conteudo, senha, mime);

    // Guardado depois de ler, e só quando a leitura não parou na senha: um
    // arquivo que nem foi aberto ainda pode ser reenviado com a senha certa, e
    // gravar as duas tentativas encheria o balde com o mesmo documento.
    const guardar = leitura.motivo !== "protegido_por_senha";

    const guardado = guardar
      ? await this.armazenamento.guardar(conteudo, mime, nomeDoArquivo)
      : { chave: null };

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
      confiancaOcr: leitura.confianca,
      arquivoChave: guardado.chave,
    });
  }
}
