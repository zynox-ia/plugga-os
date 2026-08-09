import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra dos segredos que o sistema guarda para si.
 *
 * O `.env.example` deste projeto diz que credencial nunca vai para tabela. A
 * regra existe por um motivo concreto: o banco é copiado inteiro para o MinIO
 * todo dia às 00h10, então segredo em texto puro no banco é segredo em texto
 * puro em trinta cópias.
 *
 * Guardar cifrado preserva a propriedade que a regra protege — **o banco sozinho
 * não basta**. A chave-mestra fica no ambiente, que é o lugar de segredo que não
 * roda; o que roda com frequência, a chave da API, fica no banco e ganha tela.
 * Quem tiver só o dump não tem nada; quem tiver os dois já é root na VPS.
 *
 * AES-256-GCM porque autentica além de cifrar: um valor adulterado no banco
 * falha ao decifrar em vez de virar lixo silencioso na chamada.
 */

const ALGORITMO = "aes-256-gcm";

export class ChaveMestraAusenteError extends Error {
  constructor() {
    super(
      "SECRETS_ENCRYPTION_KEY não está configurada: sem ela o sistema não guarda " +
        "nem lê segredo. Gere uma com: openssl rand -base64 32",
    );
  }
}

export class SegredoCorrompidoError extends Error {
  constructor() {
    super("o segredo guardado não pôde ser decifrado com a chave-mestra atual");
  }
}

/**
 * A chave-mestra é lida a cada uso, de propósito: trocar a variável e reiniciar
 * é o caminho de rotação, e um valor memorizado em módulo tornaria o reinício
 * silenciosamente ineficaz em processo de vida longa.
 */
function chaveMestra(): Buffer {
  const bruta = process.env.SECRETS_ENCRYPTION_KEY;
  if (!bruta) throw new ChaveMestraAusenteError();

  const chave = Buffer.from(bruta, "base64");
  if (chave.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY tem ${chave.length} bytes depois de decodificada em base64; ` +
        "o AES-256 exige exatamente 32. Gere com: openssl rand -base64 32",
    );
  }
  return chave;
}

export function chaveMestraConfigurada(): boolean {
  try {
    chaveMestra();
    return true;
  } catch {
    return false;
  }
}

export type ValorCifrado = {
  /** Texto cifrado em base64. */
  conteudo: string;
  /** Vetor de inicialização, único por gravação. */
  iv: string;
  /** Etiqueta de autenticação do GCM, que denuncia adulteração. */
  tag: string;
};

export function cifrar(texto: string): ValorCifrado {
  // IV novo a cada gravação: reusar IV com a mesma chave quebra o GCM por
  // completo, e é o erro clássico de quem guarda um IV fixo em constante.
  const iv = randomBytes(12);
  const cifra = createCipheriv(ALGORITMO, chaveMestra(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);

  return {
    conteudo: conteudo.toString("base64"),
    iv: iv.toString("base64"),
    tag: cifra.getAuthTag().toString("base64"),
  };
}

export function decifrar(valor: ValorCifrado): string {
  try {
    const decifra = createDecipheriv(ALGORITMO, chaveMestra(), Buffer.from(valor.iv, "base64"));
    decifra.setAuthTag(Buffer.from(valor.tag, "base64"));
    return Buffer.concat([
      decifra.update(Buffer.from(valor.conteudo, "base64")),
      decifra.final(),
    ]).toString("utf8");
  } catch (erro) {
    if (erro instanceof ChaveMestraAusenteError) throw erro;
    // Chave-mestra trocada, valor adulterado ou registro truncado caem aqui.
    // Distinguir os três não muda a ação de quem opera: regravar a chave.
    throw new SegredoCorrompidoError();
  }
}

/**
 * O que a tela pode ver.
 *
 * Nunca a chave. Os últimos quatro caracteres bastam para alguém confirmar que
 * plugou a certa, e não ajudam ninguém a usá-la.
 */
export function mascarar(segredo: string): string {
  const fim = segredo.slice(-4);
  return fim.length === 4 ? `••••${fim}` : "••••";
}
