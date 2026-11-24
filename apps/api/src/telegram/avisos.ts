/** Texto dos avisos do Telegram. Funções puras: o que sai para o canal é decidido e testado aqui. */

export type DadosDeNovoLead = {
  cliente: string;
  origem?: string | null;
  responsavel?: string | null;
  pipeline?: string | null;
  /** Plugga ou Waze Energia: a empresa é etiqueta do negócio e vai no texto, não escolhe a conta. */
  empresa?: string | null;
};

export type DadosDeAtividadeAtrasada = {
  titulo: string;
  prazo: Date;
  responsavel?: string | null;
  negocio?: string | null;
  empresa?: string | null;
};

const LIMITE = 200;

/** O Telegram interpreta HTML: o que vem do cadastro nunca pode virar marcação. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function campo(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return escaparHtml(limpo.length > LIMITE ? `${limpo.slice(0, LIMITE - 1)}…` : limpo);
}

function linha(rotulo: string, valor: string | null | undefined): string | null {
  return valor && valor.trim() !== "" ? `${rotulo}: ${campo(valor)}` : null;
}

/** Data e hora no horário de Manaus (dd/mm/aaaa hh:mm), montadas das partes para não depender do formato da versão do ICU. */
export function dataHoraDeManaus(data: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Manaus",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(data)
      .map((parte) => [parte.type, parte.value]),
  ) as Record<string, string>;
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

export function avisoDeNovoLead(d: DadosDeNovoLead): string {
  return ["<b>Novo lead</b>", linha("Cliente", d.cliente), linha("Origem", d.origem), linha("Pipeline", d.pipeline), linha("Responsável", d.responsavel), linha("Empresa", d.empresa)]
    .filter((parte): parte is string => parte !== null)
    .join("\n");
}

export function avisoDeAtividadeAtrasada(d: DadosDeAtividadeAtrasada): string {
  return [
    "<b>Atividade atrasada</b>",
    linha("Atividade", d.titulo),
    linha("Prazo", dataHoraDeManaus(d.prazo)),
    linha("Responsável", d.responsavel),
    linha("Negócio", d.negocio),
    linha("Empresa", d.empresa),
  ]
    .filter((parte): parte is string => parte !== null)
    .join("\n");
}
