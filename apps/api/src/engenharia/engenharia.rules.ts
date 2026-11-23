import {
  CODIGO_CHECKIN_ANTECIPADO,
  COLUNA_DA_SITUACAO,
  alcancaTela,
  type Acesso,
  type AcaoDaOrdemDeServico,
  type AcaoPermitidaDaOrdemDeServico,
  type SituacaoDaOrdemDeServico,
  type Tela,
} from "@plugga/shared";

import { EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";
import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";

/**
 * Regras da ordem de serviço (PLU-345), puras: o que cada situação permite e o
 * que cada ação muda. O repositório aplica o plano com a O.S. travada.
 */

/** Quem entra nas O.S.: qualquer uma das telas de campo da Engenharia. */
export const TELAS_DAS_ORDENS = [
  "engenharia-obras.os",
  "engenharia-obras.instalacoes",
  "engenharia-obras.manutencao",
  "engenharia-obras.visitas",
] as const satisfies readonly Tela[];

export function operaOrdens(acesso: Acesso | undefined): boolean {
  return TELAS_DAS_ORDENS.some((tela) => alcancaTela(acesso, tela));
}

export const ENCERRADAS: readonly SituacaoDaOrdemDeServico[] = ["concluida", "cancelada"];
export const encerrada = (situacao: SituacaoDaOrdemDeServico): boolean => ENCERRADAS.includes(situacao);

/** Manaus não tem horário de verão: o dia começa às 04:00 UTC o ano todo. */
const MS_POR_MINUTO = 60_000;

/** O instante de `dia` às `horario` (HH:mm), em Manaus. */
export function instanteEmManaus(dia: string, horario: string): Date {
  const [hora, minuto] = horario.split(":").map(Number) as [number, number];
  return new Date(inicioDoDiaEmManaus(dia).getTime() + (hora * 60 + minuto) * MS_POR_MINUTO);
}

export const hojeEmManaus = (agora: Date): string => diaEmManaus(agora);

const ACOES_POR_SITUACAO: Record<SituacaoDaOrdemDeServico, readonly AcaoPermitidaDaOrdemDeServico[]> = {
  aberta: ["editar", "agendar", "cancelar", "pedir_material"],
  agendada: ["editar", "agendar", "check_in", "adiar", "cancelar", "pedir_material"],
  em_campo: ["editar", "enviar_foto", "registrar_laudo", "adiar", "cancelar", "pedir_material"],
  laudo: ["editar", "enviar_foto", "colher_termo", "cancelar", "pedir_material"],
  adiada: ["editar", "agendar", "cancelar", "pedir_material"],
  concluida: [],
  cancelada: [],
};

/** O que a pessoa pode fazer agora. Sem acesso às telas das O.S., nada. */
export function acoesPermitidas(situacao: SituacaoDaOrdemDeServico, acesso: Acesso | undefined): AcaoPermitidaDaOrdemDeServico[] {
  return operaOrdens(acesso) ? [...ACOES_POR_SITUACAO[situacao]] : [];
}

export function permite(situacao: SituacaoDaOrdemDeServico, acao: AcaoPermitidaDaOrdemDeServico): boolean {
  return ACOES_POR_SITUACAO[situacao].includes(acao);
}

const ROTULO: Record<SituacaoDaOrdemDeServico, string> = {
  aberta: "aberta",
  agendada: "agendada",
  em_campo: "em campo",
  laudo: "com laudo",
  concluida: "concluída",
  adiada: "adiada",
  cancelada: "cancelada",
};

export function exigirAcao(situacao: SituacaoDaOrdemDeServico, acao: AcaoPermitidaDaOrdemDeServico): void {
  if (!permite(situacao, acao)) throw new EstadoInvalido(`Esta ação não vale para uma O.S. ${ROTULO[situacao]}.`);
}

/** O dia não pode estar no passado (Manaus). */
export function garantirDiaNaoPassado(dia: string, agora: Date, campo: string): void {
  if (dia < hojeEmManaus(agora)) throw new RequisicaoInvalida("A data não pode estar no passado.", [{ campo, problema: "Escolha hoje ou uma data futura." }]);
}

export type EstadoDaOrdem = {
  situacao: SituacaoDaOrdemDeServico;
  tecnicoId: string | null;
  agendadaPara: Date | null;
  fotos: number;
};

/** Registro da linha do tempo que acompanha a ação. `dados` nunca leva documento de quem assina. */
export type RegistroDaAcao = { tipo: string; dados: Record<string, string | null>; detalhe: string | null };

export type PlanoDaAcao = {
  alteracoes: Record<string, unknown>;
  registro: RegistroDaAcao;
  /** Técnico e apoio a conferir como pessoas da Engenharia. */
  pessoas: string[];
};

/**
 * O que a ação muda. Recusa a ação fora da situação, a data no passado, o
 * laudo sem foto e o check-in antecipado sem confirmação.
 */
export function planejarAcao(estado: EstadoDaOrdem, acao: AcaoDaOrdemDeServico, agora: Date, porId: string): PlanoDaAcao {
  switch (acao.acao) {
    case "agendar": {
      exigirAcao(estado.situacao, "agendar");
      if (acao.apoioId && acao.apoioId === acao.tecnicoId) {
        throw new RequisicaoInvalida("O apoio precisa ser outra pessoa.", [{ campo: "apoioId", problema: "Escolha alguém diferente do técnico." }]);
      }
      const quando = instanteEmManaus(acao.data, acao.horario);
      if (quando.getTime() <= agora.getTime()) {
        throw new RequisicaoInvalida("O agendamento não pode estar no passado.", [{ campo: acao.data < hojeEmManaus(agora) ? "data" : "horario", problema: "Escolha uma data e um horário futuros." }]);
      }
      const remarcacao = estado.situacao === "agendada";
      return {
        alteracoes: {
          situacao: "agendada",
          tecnicoId: acao.tecnicoId,
          apoioId: acao.apoioId ?? null,
          agendadaPara: quando,
          adiamentoMotivo: null,
          adiadaPara: null,
          adiadaEm: null,
          adiadaPorId: null,
        },
        registro: {
          tipo: remarcacao ? "remarcada" : "agendada",
          dados: { agendadaPara: quando.toISOString(), tecnicoId: acao.tecnicoId, apoioId: acao.apoioId ?? null, antes: estado.agendadaPara?.toISOString() ?? null },
          detalhe: null,
        },
        pessoas: [acao.tecnicoId, ...(acao.apoioId ? [acao.apoioId] : [])],
      };
    }
    case "check_in": {
      exigirAcao(estado.situacao, "check_in");
      const agendada = estado.agendadaPara!;
      const antecipado = diaEmManaus(agendada) > hojeEmManaus(agora);
      if (antecipado && acao.confirmarAntecipado !== true) {
        throw new EstadoInvalido("A O.S. está agendada para outro dia. Confirme para remarcar para agora.", undefined, {
          motivo: CODIGO_CHECKIN_ANTECIPADO,
          agendadaPara: agendada.toISOString(),
        });
      }
      return {
        alteracoes: { situacao: "em_campo", checkinEm: agora, ...(antecipado ? { agendadaPara: agora } : {}) },
        registro: {
          tipo: antecipado ? "checkin_antecipado" : "checkin",
          dados: { agendadaPara: agendada.toISOString() },
          detalhe: null,
        },
        pessoas: [],
      };
    }
    case "registrar_laudo": {
      exigirAcao(estado.situacao, "registrar_laudo");
      if (estado.fotos === 0) throw new RequisicaoInvalida("O laudo precisa de ao menos uma foto.", [{ campo: "fotos", problema: "Envie as fotos do serviço antes do laudo." }]);
      return {
        alteracoes: {
          situacao: "laudo",
          laudoEncontrado: acao.encontrado,
          laudoFeito: acao.feito,
          laudoRecomendacao: acao.recomendacao ?? null,
          laudoEm: agora,
          laudoPorId: porId,
        },
        registro: { tipo: "laudo_registrado", dados: { fotos: String(estado.fotos) }, detalhe: null },
        pessoas: [],
      };
    }
    case "adiar": {
      exigirAcao(estado.situacao, "adiar");
      garantirDiaNaoPassado(acao.novaData, agora, "novaData");
      if (acao.horario && instanteEmManaus(acao.novaData, acao.horario).getTime() <= agora.getTime()) {
        throw new RequisicaoInvalida("A nova data não pode estar no passado.", [{ campo: "horario", problema: "Escolha um horário futuro." }]);
      }
      return {
        alteracoes: {
          situacao: "adiada",
          adiamentoMotivo: acao.motivo,
          adiadaPara: inicioDoDiaEmManaus(acao.novaData),
          adiadaEm: agora,
          adiadaPorId: porId,
          agendadaPara: null,
          checkinEm: null,
        },
        registro: { tipo: "adiada", dados: { novaData: acao.novaData, horario: acao.horario ?? null, situacaoAnterior: estado.situacao }, detalhe: acao.motivo },
        pessoas: [],
      };
    }
    case "cancelar": {
      exigirAcao(estado.situacao, "cancelar");
      return {
        alteracoes: {
          situacao: "cancelada",
          cancelamentoMotivo: acao.motivo,
          canceladaEm: agora,
          canceladaPorId: porId,
          canceladaEmSituacao: estado.situacao,
        },
        registro: { tipo: "cancelada", dados: { situacaoAnterior: estado.situacao }, detalhe: acao.motivo },
        pessoas: [],
      };
    }
  }
}

export type DadosParaAtraso = { situacao: SituacaoDaOrdemDeServico; prazo: Date; agendadaPara: Date | null };

/**
 * Atrasada: em andamento e com o prazo vencido, ou agendada para um dia que já
 * passou sem check-in. Conta pelo dia de Manaus: aparece no dia em que venceu.
 */
export function estaAtrasada(ordem: DadosParaAtraso, agora: Date): boolean {
  if (encerrada(ordem.situacao)) return false;
  const hoje = hojeEmManaus(agora);
  if (diaEmManaus(ordem.prazo) < hoje) return true;
  return ordem.situacao === "agendada" && ordem.agendadaPara !== null && diaEmManaus(ordem.agendadaPara) < hoje;
}

export const colunaDa = (situacao: SituacaoDaOrdemDeServico) => COLUNA_DA_SITUACAO[situacao];

/** OS-0012, os-12 ou 12 → 12. */
export function numeroDaBusca(busca: string): number | null {
  const encontrado = /^(?:os-?)?0*(\d{1,9})$/i.exec(busca.trim());
  return encontrado ? Number(encontrado[1]) : null;
}

/** Só os quatro últimos dígitos do documento de quem assinou: 123.456.789-01 vira "•••89-01". */
export function mascararDocumento(documento: string): string {
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length < 4) return "•••";
  return `•••${digitos.slice(-4, -2)}-${digitos.slice(-2)}`;
}
