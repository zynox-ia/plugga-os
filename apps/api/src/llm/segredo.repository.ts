export type SegredoGuardado = {
  valorCifrado: string;
  iv: string;
  tag: string;
  ultimosQuatro: string;
  atualizadoPor: string | null;
  atualizadoEm: Date;
};

export type GravarSegredo = {
  chave: string;
  valorCifrado: string;
  iv: string;
  tag: string;
  ultimosQuatro: string;
  atualizadoPor: string;
};

/**
 * Persistência dos segredos do sistema.
 *
 * Existe como abstração por causa do ADR-0002 — só implementação de repositório
 * toca no Prisma — e o efeito colateral é bom: o serviço da chave fica testável
 * sem banco, e o teste da cifra não precisa de contêiner de pé.
 */
export abstract class SegredoRepository {
  abstract buscar(chave: string): Promise<SegredoGuardado | null>;
  abstract gravar(dados: GravarSegredo): Promise<void>;
  abstract apagar(chave: string): Promise<void>;
}
