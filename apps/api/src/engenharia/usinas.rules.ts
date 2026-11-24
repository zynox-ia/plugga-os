import { alcancaTela, pareceCredencial, type Acesso, type CardDePlataforma, type SituacaoDoMonitoramento, type TipoDeOrdemDeServico } from "@plugga/shared";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { operaOrdens } from "./engenharia.rules";

/** Regras das Usinas e do monitoramento do dia (PLU-347), puras. */

/** Quem é da Engenharia (alguma tela dela) ou da plataforma: lê usinas e monitoramento. */
export function daEngenharia(acesso: Acesso | undefined): boolean {
  if (!acesso) return false;
  if (acesso.plataforma !== null) return true;
  return acesso.departamentos.some((d) => d.departamento === "engenharia-obras" && (d.telas === undefined || d.telas.length > 0));
}

/** Cadastra usinas e confere as plataformas: a tela de Usinas. */
export const operaUsinas = (acesso: Acesso | undefined): boolean => alcancaTela(acesso, "engenharia-obras.usinas");

/** Cadastra e muda plataformas: o gerente da Engenharia com a tela de Usinas (o mesmo `tem_tela(usinas, gerente)` do RLS). */
export function gerenteDasUsinas(acesso: Acesso | undefined): boolean {
  if (!acesso) return false;
  if (acesso.plataforma !== null) return true;
  return acesso.departamentos.some((d) =>
    d.departamento === "engenharia-obras" && d.nivel === "gerente" && (d.telas === undefined || d.telas.includes("engenharia-obras.usinas")),
  );
}

/** Abrir a O.S. da anomalia: as telas de O.S. (o RLS das O.S. exige). */
export const podeAbrirOs = (acesso: Acesso | undefined): boolean => operaOrdens(acesso);

/** A observação de acesso diz onde está o acesso; texto com cara de credencial é recusado. */
export function conferirObservacaoDeAcesso(observacao: string | null | undefined): void {
  if (observacao && pareceCredencial(observacao)) {
    throw new RequisicaoInvalida("A observação de acesso não guarda senha nem login.", [
      { campo: "observacaoDeAcesso", problema: "Diga só onde está o acesso (ex.: login da Waze no cofre)." },
    ]);
  }
}

/**
 * O P2002 veio do índice de uma usina por O.S. de comissionamento? O Prisma
 * informa o alvo como o nome do índice ou a lista de colunas.
 */
export function violouUsinaDoComissionamento(meta: Record<string, unknown> | undefined): boolean {
  const alvo = meta?.target;
  const alvos = Array.isArray(alvo) ? alvo.map(String) : typeof alvo === "string" ? [alvo] : [];
  return alvos.some((a) => a === "usinas_uma_por_comissionamento" || a === "ordem_de_comissionamento_id" || a === "ordemDeComissionamentoId");
}

/** "Hypon Cloud" → "hypon-cloud"; "FusionSolar" → "fusionsolar". */
export function idDaPlataforma(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A O.S. que a exceção abre: anomalia vira manutenção; sem comunicação, configuração. */
export function tipoDaOrdemDaExcecao(situacao: Exclude<SituacaoDoMonitoramento, "normal">): TipoDeOrdemDeServico {
  return situacao === "anomalia" ? "manutencao" : "configuracao";
}

/** Pendentes primeiro; depois as com mais exceções; depois a ordem da plataforma. */
export function ordenarCards(cards: (CardDePlataforma & { ordem: number })[]): CardDePlataforma[] {
  return [...cards]
    .sort((a, b) => {
      const pendente = Number(a.conferencia !== null) - Number(b.conferencia !== null);
      if (pendente !== 0) return pendente;
      const excecoes = (b.conferencia?.excecoes.length ?? 0) - (a.conferencia?.excecoes.length ?? 0);
      if (excecoes !== 0) return excecoes;
      return a.ordem - b.ordem || a.empresa.localeCompare(b.empresa);
    })
    .map((card) => {
      const { ordem, ...resto } = card;
      void ordem;
      return resto;
    });
}

/** Soma de kWp em string com até 3 casas, sem erro de ponto flutuante. */
export function somarKwp(valores: string[]): string {
  const milesimos = valores.reduce((soma, v) => soma + Math.round(Number(v) * 1000), 0);
  return (milesimos / 1000).toFixed(3).replace(/\.?0+$/, "");
}

/** "12.750" → "12.75"; "8.000" → "8". */
export const kwpCurto = (valor: string): string => valor.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
