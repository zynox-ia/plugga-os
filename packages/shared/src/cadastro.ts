import { z } from "zod";

/** Consulta de CNPJ e CEP em fonte pública. Nenhuma credencial; só liga e desliga. */

export const entradaDaConsultaCadastralSchema = z.object({ ativa: z.boolean() }).strict();
export type EntradaDaConsultaCadastral = z.infer<typeof entradaDaConsultaCadastralSchema>;

export type EstadoDaConsultaCadastral = {
  /** Se a consulta está ligada para o sistema inteiro. */
  ativa: boolean;
  /** Quem fornece os dados, para a tela dizer de onde eles vêm. */
  fonte: string;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
};

/** Resposta de `GET /integracoes/cadastro`: o estado mais a prontidão do cofre. */
export type EstadoDaConsultaCadastralComCofre = EstadoDaConsultaCadastral & { cofreConfigurado: boolean };

export type EnderecoConsultado = {
  cep: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

export type EmpresaConsultada = {
  /** Só os 14 dígitos. */
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  naturezaJuridica: string | null;
  porte: string | null;
  abertura: string | null;
  atividadePrincipal: { codigo: string; descricao: string } | null;
  telefone: string | null;
  email: string | null;
  endereco: EnderecoConsultado | null;
};
