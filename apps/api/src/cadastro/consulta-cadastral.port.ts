import type { EmpresaConsultada, EnderecoConsultado } from "@plugga/shared";

/** A fonte não respondeu (rede, tempo esgotado, erro do servidor ou resposta ilegível). */
export class FonteIndisponivelError extends Error {
  constructor(motivo: string) {
    super(`fonte de consulta indisponível: ${motivo}`);
  }
}

/**
 * Porta da consulta cadastral. Ninguém no sistema chama a fonte direto: tela,
 * jobs e agentes passam pelo serviço, que respeita o liga/desliga da integração.
 * `null` significa "a fonte respondeu que não existe"; indisponibilidade é erro.
 */
export abstract class ConsultaCadastralPort {
  abstract consultarCnpj(cnpj: string): Promise<EmpresaConsultada | null>;
  abstract consultarCep(cep: string): Promise<EnderecoConsultado | null>;
}
