import { Prisma } from "@prisma/client";

import { Conflito, EstadoInvalido } from "./errors/dominio";

/** Delegate mínimo de um modelo do Prisma: só o que `transicionar` usa. */
export interface DelegateComUpdateMany {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

/**
 * Transição de estado condicionada ao estado de origem, numa única instrução.
 *
 * Duas requisições que tentam a mesma transição ao mesmo tempo disputam a linha:
 * a primeira casa o `WHERE` e escreve, a segunda encontra o estado já mudado,
 * `count` vem 0 e ela recebe `EstadoInvalido` (409 CONFLITO_ESTADO), sem
 * sobrescrever a primeira. Ler antes e escrever depois não dá essa garantia.
 *
 * `condicao` junta mais restrições ao `WHERE` (por exemplo `{ segurancaAssinouEm: null }`).
 */
export async function transicionar(
  delegate: DelegateComUpdateMany,
  id: string,
  condicao: Record<string, unknown>,
  dados: Record<string, unknown>,
  mensagem = "Outra pessoa já alterou este registro. Atualize a página e confira.",
): Promise<void> {
  const { count } = await delegate.updateMany({ where: { id, ...condicao }, data: dados });
  if (count === 0) throw new EstadoInvalido(mensagem);
}

const P2002 = "P2002";

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === P2002;
}

/**
 * Repete `fn` quando a gravação bate numa restrição de unicidade (P2002), como
 * numeração sequencial disputada. `fn` deve abrir a própria transação: uma
 * transação do Postgres que falhou não pode ser reaproveitada. Esgotadas as
 * tentativas, devolve `Conflito` (409 CONFLITO_UNICIDADE) em vez do erro cru.
 */
export async function comRepeticaoP2002<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await fn();
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;
      if (tentativa >= tentativas) {
        throw new Conflito("Outra pessoa gravou ao mesmo tempo. Tente de novo.");
      }
    }
  }
}
