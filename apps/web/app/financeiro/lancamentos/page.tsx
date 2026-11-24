import { alcancaDepartamento } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { LancamentosView } from "../../components/financeiro/lancamentos-view";
import { fetchLancamento, fetchLancamentos, fetchOpcoesDoFinanceiro, fetchQuadroFinanceiro, fetchResumoDosLancamentos } from "../../lib/api";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDosLancamentos, ehUuidDoLancamento, lerFiltrosDosLancamentos } from "../../lib/financeiro";

export default async function LancamentosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/financeiro/lancamentos");
  const parametros = await searchParams;
  const filtros = lerFiltrosDosLancamentos(parametros);
  const quadro = filtros.visao === "quadro";
  const lancamento = ehUuidDoLancamento(parametros.lancamento) ? parametros.lancamento : null;

  // No Quadro, os metric cards vêm do modo só-resumo; nas outras visões, com a lista.
  const [lista, colunas, resumo, ficha, opcoes] = await Promise.all([
    quadro ? Promise.resolve(null) : fetchLancamentos(consultaDosLancamentos(filtros, "lista")),
    quadro ? fetchQuadroFinanceiro(consultaDosLancamentos(filtros, "quadro")) : Promise.resolve(null),
    quadro ? fetchResumoDosLancamentos(filtros.empresa ? { empresa: filtros.empresa } : {}) : Promise.resolve(null),
    lancamento ? fetchLancamento(lancamento) : Promise.resolve(null),
    fetchOpcoesDoFinanceiro(),
  ]);
  if (lista && !lista.ok) return <EstadoDaApi erro={lista.erro} eyebrow="Lançamentos" />;
  if (colunas && !colunas.ok) return <EstadoDaApi erro={colunas.erro} eyebrow="Lançamentos" />;
  if (resumo && !resumo.ok) return <EstadoDaApi erro={resumo.erro} eyebrow="Lançamentos" />;

  const dados = lista?.ok ? lista.dados : null;
  const resumoDaTela = dados ? { resumo: dados.resumo, alcance: dados.alcance } : resumo!.ok ? resumo!.dados : null;
  return <LancamentosView
    filtros={filtros}
    lista={dados}
    quadro={colunas?.ok ? colunas.dados : null}
    resumo={resumoDaTela!.resumo}
    alcance={resumoDaTela!.alcance}
    ficha={ficha?.ok ? ficha.dados : null}
    // 404 é "não existe ou não é seu"; o resto é falha de leitura, com outro aviso.
    falhaDaFicha={ficha && !ficha.ok ? (ficha.erro.tipo === "naoEncontrado" ? "nao_encontrada" : "indisponivel") : null}
    // As opções servem só aos formulários: sem elas a lista abre, e criar e editar ficam desligados.
    opcoes={opcoes.ok ? opcoes.dados : null}
    gerente={alcancaDepartamento(sessao.acesso, "financeiro", "gerente")}
  />;
}
