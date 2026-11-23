import {
  proximasOcorrencias,
  textoDaRecorrencia,
  type Acesso,
  type AtalhoDeTarefa,
  type AutomacaoDeTarefa,
  type DepartamentoComTarefas,
  type OcorrenciaDeTarefa,
  type Tarefa,
} from "@plugga/shared";

import { diaEmManaus } from "../compras/dias-uteis";
import { regraDaLinha, type LinhaDaOcorrencia, type LinhaDaTarefa, type Nomes } from "./prisma-tarefas.repository";
import { acoesPermitidas, colunaDaSituacao, situacaoDaOcorrencia } from "./tarefas.rules";

const BASE = "/tarefas";
const pessoa = (id: string | null, nomes: Nomes) => (id ? { id, nome: nomes.get(id) ?? "Pessoa sem acesso" } : null);
const registro = (porId: string | null, em: Date, nomes: Nomes) => ({ por: pessoa(porId, nomes), em: em.toISOString() });

function comum(t: LinhaDaTarefa, nomes: Nomes) {
  const regra = regraDaLinha(t.regra);
  const dia = diaEmManaus(t.dia);
  return {
    departamento: t.departamento as DepartamentoComTarefas,
    titulo: t.titulo,
    categoria: t.categoria,
    empresa: t.empresa,
    responsavel: pessoa(t.responsavelId, nomes)!,
    substituto: pessoa(t.substitutoId, nomes),
    tipo: t.tipo,
    origem: t.origem,
    recorrenciaTexto: textoDaRecorrencia({ tipo: t.tipo, regra, dia, horarioLimite: t.horarioLimite }),
    exigeEvidencia: t.exigeEvidencia,
    exigeResultado: t.exigeResultado,
    instrucoes: t.instrucoes.map((texto) => ({ texto })),
    automacao: t.automacao as AutomacaoDeTarefa | null,
    atalho: t.atalho as AtalhoDeTarefa | null,
  };
}

export function paraOcorrencia(o: LinhaDaOcorrencia, nomes: Nomes, acesso: Acesso | undefined, principalId: string, agora: Date): OcorrenciaDeTarefa {
  const dia = diaEmManaus(o.dia);
  const situacao = situacaoDaOcorrencia({ dia, prazoEm: o.prazoEm, concluidaEm: o.concluidaEm }, agora);
  const t = o.tarefa;
  return {
    id: o.id,
    tarefaId: o.tarefaId,
    ...comum(t, nomes),
    dia,
    prazoEm: o.prazoEm.toISOString(),
    situacao,
    coluna: colunaDaSituacao(situacao),
    conclusao: o.concluidaEm
      ? {
          ...registro(o.concluidaPorId, o.concluidaEm, nomes),
          resultado: o.resultado,
          evidencias: o.evidencias.map((e) => ({
            id: e.id,
            nome: e.arquivoNome,
            tamanhoBytes: e.arquivoTamanho,
            mime: e.arquivoTipo,
            url: `${BASE}/${t.departamento}/ocorrencias/${o.id}/evidencias/${e.id}`,
            enviado: registro(e.enviadoPorId, e.enviadoEm, nomes),
          })),
          checklist: t.instrucoes.map((texto, i) => ({ texto, feito: o.checklist[i] ?? false })),
          automatica: o.automatica,
        }
      : null,
    acoesPermitidas: acoesPermitidas({
      departamento: t.departamento as DepartamentoComTarefas,
      acesso,
      principalId,
      hoje: diaEmManaus(agora),
      tarefa: { origem: t.origem, criadoPorId: t.criadoPorId, encerrada: t.encerradaEm !== null, automacao: t.automacao },
      ocorrencia: { dia, concluida: o.concluidaEm !== null, cancelada: o.canceladaEm !== null },
    }),
  };
}

export function paraTarefa(t: LinhaDaTarefa, nomes: Nomes, agora: Date): Tarefa {
  const regra = regraDaLinha(t.regra);
  const dia = diaEmManaus(t.dia);
  const hoje = diaEmManaus(agora);
  const proximas = t.encerradaEm ? [] : t.tipo === "unica" ? (dia >= hoje ? [dia] : []) : proximasOcorrencias(regra!, dia > hoje ? dia : hoje, 5);
  return {
    id: t.id,
    ...comum(t, nomes),
    regra,
    dia,
    horarioLimite: t.horarioLimite,
    proximas,
    criada: registro(t.criadoPorId, t.createdAt, nomes),
    encerrada: t.encerradaEm && t.encerramentoMotivo ? { ...registro(t.encerradaPorId, t.encerradaEm, nomes), motivo: t.encerramentoMotivo } : null,
  };
}
