import { alcancaDepartamento, companyKeys, type CompanyKey } from "@plugga/shared";

import { EstadoDaApi } from "../../components/estado-da-api";
import { VisaoGeralDoFinanceiroView } from "../../components/financeiro/visao-geral-view";
import { podeAbrirPagina } from "../../lib/acesso-paginas";
import { fetchLancamentos, fetchOpcoesDoFinanceiro, fetchResumoDosLancamentos, fetchTarefas } from "../../lib/api";
import { hojeEmManaus } from "../../lib/compras";
import { exigirPagina } from "../../lib/exigir-pagina";
import { consultaDosLancamentos } from "../../lib/financeiro";

export default async function VisaoGeralDoFinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sessao = await exigirPagina("/financeiro/visao-geral");
  const parametros = await searchParams;
  const empresa = companyKeys.find((item): item is CompanyKey => item === parametros.empresa);
  const consulta = empresa ? { empresa } : {};
  const lista = (vencimento: "vencidos" | "hoje" | "7") =>
    fetchLancamentos(consultaDosLancamentos({ visao: "lista", vencimento, ...consulta }, "lista"));
  const [resumo, opcoes, tarefas, vencidos, deHoje, proximos] = await Promise.all([
    fetchResumoDosLancamentos(consulta),
    fetchOpcoesDoFinanceiro(),
    fetchTarefas("financeiro", { periodo: "hoje", ...consulta }),
    lista("vencidos"),
    lista("hoje"),
    lista("7"),
  ]);
  if (!resumo.ok) return <EstadoDaApi erro={resumo.erro} eyebrow="Visão geral" />;
  return <VisaoGeralDoFinanceiroView
    hoje={hojeEmManaus()}
    empresa={empresa}
    resumo={resumo.dados.resumo}
    alcance={resumo.dados.alcance}
    gerente={alcancaDepartamento(sessao.acesso, "financeiro", "gerente")}
    opcoes={opcoes.ok ? opcoes.dados : null}
    tarefas={tarefas.ok ? tarefas.dados : null}
    vencidos={vencidos.ok ? vencidos.dados : null}
    deHoje={deHoje.ok ? deHoje.dados : null}
    proximos={proximos.ok ? proximos.dados : null}
    abreConciliacao={podeAbrirPagina(sessao.acesso, "/financeiro/conciliacao")}
  />;
}
