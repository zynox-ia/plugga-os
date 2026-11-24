/** Regras recorrentes vigentes, não uma reconstrução histórica da legislação. */
export const CALENDARIO_MANAUS_VERSAO = "manaus-br-am-v1";

const DIA_MS = 86_400_000;
const formatoManaus = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Manaus", calendar: "gregory", numberingSystem: "latn",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

// Leis federais 662/1949 (10.607/2002), 6.802/1980 e 14.759/2023:
// https://www2.camara.leg.br/legin/fed/lei/2002/lei-10607-19-dezembro-2002-473572-publicacaooriginal-1-pl.html
// https://www2.camara.leg.br/legin/fed/lei/1980-1987/lei-6802-30-junho-1980-357065-publicacaooriginal-1-pl.html
// https://www2.camara.leg.br/legin/fed/lei/2023/lei-14759-21-dezembro-2023-795091-publicacaooriginal-170522-pl.html
// AM: Lei Promulgada 25/1977 — https://sapl.al.am.leg.br/norma/8919
// Manaus: LOM art.437 (24/10) e Lei 496/1999 (8/12), confirmados no DOM 6251:
// https://www.manaus.am.gov.br/wp-content/uploads/2026/02/Prefeitura-de-Manaus-publica-calendario-de-feriados-e-pontos-facultativos-municipais-no-Diario-Oficial.pdf
const feriadosFixos = new Set([
  "1-1", "4-21", "5-1", "9-7", "10-12", "11-2", "11-15", "11-20", "12-25",
  "9-5", "10-24", "12-8",
]);

/** Data/hora civil representada em UTC apenas para aritmética, sem usar o TZ do host. */
function civilManausComoUtc(instante: Date): Date {
  const partes = Object.fromEntries(formatoManaus.formatToParts(instante).map((parte) => [parte.type, parte.value]));
  const civil = new Date(0);
  civil.setUTCFullYear(Number(partes.year), Number(partes.month) - 1, Number(partes.day));
  civil.setUTCHours(Number(partes.hour), Number(partes.minute), Number(partes.second), 0);
  return civil;
}

/** Algoritmo gregoriano de Oudin, com divisão inteira: https://aa.usno.navy.mil/faq/easter */
function pascoa(ano: number): Date {
  const inteiro = Math.trunc;
  const seculo = inteiro(ano / 100);
  const ciclo = ano - 19 * inteiro(ano / 19);
  const correcao = inteiro((seculo - 17) / 25);
  let lua = seculo - inteiro(seculo / 4) - inteiro((seculo - correcao) / 3) + 19 * ciclo + 15;
  lua -= 30 * inteiro(lua / 30);
  lua -= inteiro(lua / 28) * (1 - inteiro(lua / 28) * inteiro(29 / (lua + 1))) * inteiro((21 - ciclo) / 11);
  let semana = ano + inteiro(ano / 4) + lua + 2 - seculo + inteiro(seculo / 4);
  semana -= 7 * inteiro(semana / 7);
  const diferenca = lua - semana;
  const mes = 3 + inteiro((diferenca + 40) / 44);
  const dia = diferenca + 28 - 31 * inteiro(mes / 4);
  const data = new Date(0);
  data.setUTCFullYear(ano, mes - 1, dia);
  return data;
}

function feriadosMoveis(ano: number): Set<number> {
  // Manaus: Carnaval (Lei 448/1998), Paixão (1.001/2006), Corpus Christi (970/2006), DOM 6251 acima.
  // Offsets: https://ouropreto.mg.gov.br/turismo/noticia/5575
  // Cinzas é feriado só até 12h pela Lei 448; André aprovou contá-la para este SLA às 18h (PLU-314).
  // https://sapl.cmm.am.gov.br/media/sapl/public/normajuridica/1998/3871/lei_n_448_de_11_nov_1998.pdf
  const domingo = pascoa(ano).getTime();
  return new Set([-47, -2, 60].map((dias) => domingo + dias * DIA_MS));
}

/** D+N exclui D0; pontos facultativos e emendas não excluem dias. Retorna um instante UTC. */
export function calcularPrazoManaus(entrada: Date, diasUteis: number): Date {
  if (!Number.isFinite(entrada.getTime()) || !Number.isSafeInteger(diasUteis) || diasUteis < 1) {
    throw new RangeError("Informe um instante válido e um prazo inteiro positivo em dias úteis.");
  }
  const dia = civilManausComoUtc(entrada);
  dia.setUTCHours(0, 0, 0, 0);
  const moveisPorAno = new Map<number, Set<number>>();
  let restantes = diasUteis;
  while (restantes > 0) {
    dia.setUTCDate(dia.getUTCDate() + 1);
    if (!Number.isFinite(dia.getTime())) throw new RangeError("O prazo excede o intervalo de datas suportado.");
    if (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) continue;
    if (feriadosFixos.has(`${dia.getUTCMonth() + 1}-${dia.getUTCDate()}`)) continue;
    const ano = dia.getUTCFullYear();
    let moveis = moveisPorAno.get(ano);
    if (!moveis) { moveis = feriadosMoveis(ano); moveisPorAno.set(ano, moveis); }
    if (!moveis.has(dia.getTime())) restantes--;
  }

  // Converte 18h civis usando o próprio fuso IANA, sem fixar um offset UTC nem depender do host.
  dia.setUTCHours(18, 0, 0, 0);
  let prazo = new Date(dia);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    prazo = new Date(prazo.getTime() + dia.getTime() - civilManausComoUtc(prazo).getTime());
  }
  return prazo;
}
