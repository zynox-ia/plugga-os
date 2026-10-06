import { readFile } from "node:fs/promises";

import { ServicoIndisponivel, TipoNaoPermitido } from "../errors/dominio";
import type { ArquivoEnviado } from "./armazenamento-em-disco";
import { inspecionarArquivo, tiposDosMimes, type LimitesDeInspecao } from "./inspeciona-arquivo";

/**
 * Confere cada arquivo pelo CONTEÚDO antes de qualquer armazenamento: o tipo
 * real tem de estar entre os aceitos pelo fluxo e coincidir com o declarado
 * pelo cliente. Falha no primeiro que não passa.
 */
export async function inspecionarEnvios(
  arquivos: readonly Pick<ArquivoEnviado, "path" | "mimetype">[],
  mimesPermitidos: readonly string[],
  limites?: Partial<LimitesDeInspecao>,
): Promise<void> {
  const tiposPermitidos = tiposDosMimes(mimesPermitidos);
  for (const arquivo of arquivos) {
    const resultado = await inspecionarArquivo(arquivo.path, { tiposPermitidos, limites });
    if (resultado.mime !== arquivo.mimetype) {
      throw new TipoNaoPermitido("O conteúdo do arquivo não corresponde ao tipo informado.");
    }
  }
}

/** Lê o temporário para o armazenamento (que ainda recebe `Buffer`). Falha de disco vira 503 genérico. */
export async function lerEnvio(arquivo: Pick<ArquivoEnviado, "path">): Promise<Buffer> {
  try {
    return await readFile(arquivo.path);
  } catch (erro) {
    throw new ServicoIndisponivel(undefined, erro);
  }
}
