import { notFound } from "next/navigation";

import { NotasFiscaisView } from "../../components/financeiro/notas-fiscais-view";
import { fetchOpcoesDoFinanceiro } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { lerIntervalo } from "../../lib/periodo-livre";

/**
 * Notas fiscais (PLU-361): PROTÓTIPO visual com dados de exemplo, para o André
 * aprovar o desenho antes do cadastro real. Só no desenvolvimento e nos testes;
 * na produção, 404 (o middleware já responde antes, e o item do menu fica em breve).
 *
 * Os exemplos não entram em nenhum bundle de produção: a condição vai escrita
 * por extenso, sem passar por `prototipoDasNotasFiscais()`, porque o webpack
 * troca `process.env.NODE_ENV` pelo valor do build e, com "production", a
 * condição vira `false` e o ramo inteiro some, com o `import()` dos exemplos.
 * Sem o import, o chunk dos exemplos nem é gerado. A view (cliente) recebe os
 * dados só por props. O teste prototipo-das-notas-fiscais.test.ts confere a
 * condição e que nenhum componente cliente importa os exemplos.
 */
export default async function NotasFiscaisPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    await exigirPagina("/financeiro/notas-fiscais");
    const [{ CONTRAPARTES_DE_EXEMPLO, lancamentosDeExemplo, notasDeExemplo }, { lado, de, ate }, opcoes] = await Promise.all([
      import("../../lib/notas-fiscais-exemplo"),
      searchParams,
      fetchOpcoesDoFinanceiro(),
    ]);
    const hoje = hojeEmManaus();
    return <NotasFiscaisView hoje={hoje} ladoInicial={lado === "saidas" ? "saida" : "entrada"} intervaloInicial={lerIntervalo(de, ate)} opcoes={opcoes.ok ? opcoes.dados : null}
      exemplos={{ notas: notasDeExemplo(hoje), lancamentos: lancamentosDeExemplo(hoje), contrapartes: [...CONTRAPARTES_DE_EXEMPLO] }} />;
  }
  notFound();
}
