import { createHash } from "node:crypto";

import { ConflictException } from "@nestjs/common";

export const calcularHashDocumento = (conteudo: string): string =>
  createHash("sha256").update(conteudo).digest("hex");

/**
 * Estudos legados não possuem hash; os documentos gerados pelo fluxo novo só
 * saem do repositório se ainda forem idênticos ao conteúdo validado e gravado.
 */
export function verificarIntegridadeDocumento(
  conteudo: string,
  hashEsperado: string | null,
  hashObrigatorio = false,
): void {
  if (hashEsperado === null) {
    if (hashObrigatorio) {
      throw new ConflictException(
        "integridade do documento inválida: a versão validada está sem hash",
      );
    }
    return;
  }
  if (calcularHashDocumento(conteudo) !== hashEsperado) {
    throw new ConflictException(
      "integridade do documento inválida: o conteúdo diverge da versão validada",
    );
  }
}
