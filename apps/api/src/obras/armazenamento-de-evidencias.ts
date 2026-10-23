import { Injectable } from "@nestjs/common";

import { baldeDe } from "../core/armazenamento/baldes.js";
import { ArmazenamentoS3, type ObjetoGuardado } from "../core/armazenamento/armazenamento-s3";

/**
 * Onde a evidência de campo fica guardada. A falha não é engolida: a evidência é
 * o próprio requisito do POP-OBR-001 §5.1, não apoio à leitura.
 */
export type EvidenciaGuardada = ObjetoGuardado;

/** POP §5.1: imagem, PDF, documento técnico ou checklist preenchido. */
const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const TIPOS_ACEITOS = Object.keys(EXTENSAO);

@Injectable()
export class ArmazenamentoDeEvidencias {
  private readonly s3 = new ArmazenamentoS3({
    extensoes: EXTENSAO,
    prefixo: "evidencias-de-obra",
    nomePadrao: "evidencia",
    mensagemNaoConfigurado:
      "armazenamento de anexos não configurado (STORAGE_ENDPOINT); a evidência exige o arquivo anexado",
  });

  async guardar(conteudo: Buffer, mime: string, nomeOriginal: string): Promise<EvidenciaGuardada> {
    // Obras é do departamento Engenharia da Waze.
    return this.s3.guardarEm(baldeDe("waze", "engenharia-obras"), conteudo, mime, nomeOriginal);
  }
}
