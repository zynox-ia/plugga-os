/**
 * Os dias da recorrência "Dias da semana" que o e2e marca, pelo dia em que
 * roda (em Manaus, como a API). A geração vai só até o domingo da semana
 * corrente, e a tarefa só aparece na lista com uma ocorrência: com dias fixos
 * (seg e qua), de quinta a domingo ela não aparecia e o teste falhava.
 *
 * - De segunda a sexta: hoje e o próximo dia útil (sexta: a segunda), então
 *   nasce a ocorrência de hoje e a tarefa aparece na lista.
 * - Sábado e domingo: o seletor só tem dias úteis, então nenhuma escolha gera
 *   ocorrência nesta semana (dúvida de produto aberta com o André); marca seg e
 *   qua, e o teste não abre a tarefa pela lista.
 */
export type DiasDaRecorrencia = {
  /** Os nomes dos botões do seletor, na ordem da semana. */
  dias: [string, string];
  /** Como a tela resume a recorrência (`seg, qua`). */
  texto: string;
  /** Se a tarefa ganha ocorrência nesta semana e aparece na lista. */
  apareceNestaSemana: boolean;
};

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** O dia da semana (0 = domingo) da data de `agora` em Manaus. */
export function diaDaSemanaEmManaus(agora: Date): number {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

export function diasDaRecorrenciaDoE2e(agora: Date): DiasDaRecorrencia {
  const hoje = diaDaSemanaEmManaus(agora);
  const util = hoje >= 1 && hoje <= 5;
  const indices = util ? [hoje, hoje === 5 ? 1 : hoje + 1] : [1, 3];
  const ordenados = [...indices].sort((a, b) => a - b);
  const dias = ordenados.map((i) => NOMES[i]!) as [string, string];
  return { dias, texto: dias.join(", "), apareceNestaSemana: util };
}
