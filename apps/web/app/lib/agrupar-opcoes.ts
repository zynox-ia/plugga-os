/**
 * Agrupa as opções seguidas que têm o mesmo `grupo`, na ordem em que vieram. As
 * sem grupo formam blocos sem rótulo. Usado pelos menus com grupos (o filtro de
 * Situação do Financeiro): com a busca filtrando, o grupo sem opção some.
 */
export function agruparOpcoes<T extends { grupo?: string }>(opcoes: readonly T[]): { grupo: string | undefined; opcoes: T[] }[] {
  const grupos: { grupo: string | undefined; opcoes: T[] }[] = [];
  for (const opcao of opcoes) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.grupo === opcao.grupo) ultimo.opcoes.push(opcao);
    else grupos.push({ grupo: opcao.grupo, opcoes: [opcao] });
  }
  return grupos;
}
