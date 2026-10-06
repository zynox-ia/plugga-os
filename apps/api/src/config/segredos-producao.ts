/**
 * Recusa, na inicialização em produção, segredo que é claramente de exemplo,
 * vazio ou de baixa entropia (spec 002, US11, SEC/FR-051, SC-015).
 *
 * Regra de ouro: ser CONSERVADORA. Um falso positivo derruba o boot de uma
 * produção que está saudável; um falso negativo só deixa de avisar. Por isso só
 * se recusa o que é inequivocamente exemplo:
 *
 *  1. valor IGUAL a um dos exemplos conhecidos (`.env.example`, CI, testes);
 *  2. valor que CONTÉM um marcador de exemplo ("change_me", "changeme",
 *     "local_only", "example", "troque_isto");
 *  3. valor de baixa entropia: um caractere só repetido, menos de 8 caracteres
 *     distintos, ou entropia de Shannon abaixo de 2,5 bits por caractere
 *     (`openssl rand -base64 32` dá ~5; hexadecimal aleatório, ~4).
 *
 * Para `SECRETS_ENCRYPTION_KEY` (chave AES de 32 bytes em base64) a análise de
 * entropia é feita sobre os BYTES decodificados, não sobre o texto: a chave toda
 * zero é "AAAA…=" em base64, que tem poucos caracteres distintos, mas o que
 * importa é o conteúdo da chave.
 *
 * Variável AUSENTE ou vazia não é recusada aqui: cada uma tem a sua própria
 * regra de obrigatoriedade (`AUTH_SESSION_SECRET` já exige 32 caracteres; a
 * `SECRETS_ENCRYPTION_KEY` vazia só desliga o recurso que a usa, como hoje).
 */

/** Valores copiados dos exemplos do repositório. Qualquer um deles em produção é erro. */
export const SEGREDOS_DE_EXEMPLO: ReadonlySet<string> = new Set([
  // .env.example
  "local_only_change_me",
  "local_only_session_secret_change_me_at_least_32_chars",
  "plugga_local",
  "plugga_local_secret",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  // CI e testes
  "ci_local_only_change_me",
  "ci_local_only_session_secret_change_me_please",
  "test_only_session_secret_change_me_please",
  "local_test_only_change_me",
]);

const MARCADORES_DE_EXEMPLO = ["change_me", "changeme", "local_only", "troque_isto", "example"];

const MIN_CARACTERES_DISTINTOS = 8;
const MIN_ENTROPIA_BITS_POR_CARACTERE = 2.5;

/** Entropia de Shannon (bits por símbolo) de uma sequência de símbolos. */
export function entropiaDeShannon(simbolos: ArrayLike<string | number>): number {
  const total = simbolos.length;
  if (total === 0) return 0;
  const contagem = new Map<string | number, number>();
  for (let i = 0; i < total; i += 1) {
    const simbolo = simbolos[i] as string | number;
    contagem.set(simbolo, (contagem.get(simbolo) ?? 0) + 1);
  }
  let entropia = 0;
  for (const quantidade of contagem.values()) {
    const p = quantidade / total;
    entropia -= p * Math.log2(p);
  }
  return entropia;
}

/** Devolve o motivo da recusa de um segredo textual, ou `null` se ele é aceitável. */
export function motivoSegredoFraco(valor: string): string | null {
  if (SEGREDOS_DE_EXEMPLO.has(valor)) return "é um valor de exemplo conhecido";

  const minusculo = valor.toLowerCase();
  const marcador = MARCADORES_DE_EXEMPLO.find((m) => minusculo.includes(m));
  if (marcador) return `contém o marcador de exemplo "${marcador}"`;

  const caracteres = Array.from(valor);
  const distintos = new Set(caracteres).size;
  if (distintos < MIN_CARACTERES_DISTINTOS) {
    return `tem só ${distintos} caracteres distintos (baixa entropia)`;
  }
  if (entropiaDeShannon(caracteres) < MIN_ENTROPIA_BITS_POR_CARACTERE) {
    return "tem entropia baixa demais";
  }
  return null;
}

/** Motivo da recusa da chave-mestra (base64 de 32 bytes), ou `null`. */
export function motivoChaveMestraFraca(base64: string): string | null {
  if (SEGREDOS_DE_EXEMPLO.has(base64)) return "é um valor de exemplo conhecido";
  return motivoBytesFracos(Buffer.from(base64, "base64"));
}

/** Mesma análise sobre bytes já decodificados (usada também por `llm/cripto.ts`). */
export function motivoBytesFracos(bytes: Buffer): string | null {
  if (bytes.length > 0 && bytes.every((byte) => byte === bytes[0])) {
    return "é feita de um byte só repetido (por exemplo, toda zero)";
  }
  const distintos = new Set(bytes).size;
  if (distintos < MIN_CARACTERES_DISTINTOS) {
    return `tem só ${distintos} bytes distintos (baixa entropia)`;
  }
  if (entropiaDeShannon(Array.from(bytes)) < MIN_ENTROPIA_BITS_POR_CARACTERE) {
    return "tem entropia baixa demais";
  }
  return null;
}

export interface ProblemaDeSegredo {
  variavel: string;
  motivo: string;
}

function texto(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const aparado = valor.trim();
  return aparado === "" ? undefined : aparado;
}

/** Senha embutida numa URL de conexão (`postgresql://usuario:SENHA@host/...`). */
function senhaDaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const senha = decodeURIComponent(new URL(url).password);
    return senha === "" ? undefined : senha;
  } catch {
    return undefined;
  }
}

/**
 * Varre o ambiente de produção e lista cada segredo recusado. Chamada só quando
 * `NODE_ENV=production`; em teste e desenvolvimento os valores de exemplo são
 * o esperado.
 *
 * Segredos de EXEMPLO de verdade (os que o repositório publica) são recusados em
 * qualquer variável da lista; a checagem de entropia vale só para os segredos
 * que o sistema gera/guarda para si (`AUTH_SESSION_SECRET`,
 * `SECRETS_ENCRYPTION_KEY`, `SESSION_CACHE_HMAC_KEY`), porque senhas de serviços
 * externos (banco, storage) são escolhidas por quem opera o serviço.
 */
export function verificarSegredosDeProducao(ambiente: Record<string, unknown>): ProblemaDeSegredo[] {
  const problemas: ProblemaDeSegredo[] = [];

  const sessao = texto(ambiente.AUTH_SESSION_SECRET);
  if (sessao) {
    const motivo = motivoSegredoFraco(sessao);
    if (motivo) problemas.push({ variavel: "AUTH_SESSION_SECRET", motivo });
  }

  const hmac = texto(ambiente.SESSION_CACHE_HMAC_KEY);
  if (hmac) {
    const motivo = motivoSegredoFraco(hmac);
    if (motivo) problemas.push({ variavel: "SESSION_CACHE_HMAC_KEY", motivo });
  }

  const chaveMestra = texto(ambiente.SECRETS_ENCRYPTION_KEY);
  if (chaveMestra) {
    const motivo = motivoChaveMestraFraca(chaveMestra);
    if (motivo) problemas.push({ variavel: "SECRETS_ENCRYPTION_KEY", motivo });
  }

  // Credenciais de serviço: só o valor de exemplo publicado é recusado.
  const exatos: Array<[string, string | undefined]> = [
    ["SEED_ADMIN_PASSWORD", texto(ambiente.SEED_ADMIN_PASSWORD)],
    ["STORAGE_ACCESS_KEY", texto(ambiente.STORAGE_ACCESS_KEY)],
    ["STORAGE_SECRET_KEY", texto(ambiente.STORAGE_SECRET_KEY)],
    ["DATABASE_URL (senha)", senhaDaUrl(texto(ambiente.DATABASE_URL))],
    ["REDIS_URL (senha)", senhaDaUrl(texto(ambiente.REDIS_URL))],
  ];
  for (const [variavel, valor] of exatos) {
    if (valor && SEGREDOS_DE_EXEMPLO.has(valor)) {
      problemas.push({ variavel, motivo: "é um valor de exemplo conhecido" });
    }
  }

  return problemas;
}
