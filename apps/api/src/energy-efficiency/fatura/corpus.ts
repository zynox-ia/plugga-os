import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import type { DocumentoNormalizado } from "./documento.js";

/**
 * O corpus de regressão do leitor de faturas — que mora fora do git.
 *
 * A fixture de auditoria precisa do dado real: nome, CNPJ, unidade consumidora,
 * endereço e valores. É isso que o leitor tem de provar que extrai e é isso que
 * o relatório entrega ao cliente. Anonimizar a fixture degradaria a prova até
 * ela não provar mais nada.
 *
 * O problema nunca foi o conteúdo — foi o **container**. Git é permanente,
 * replica em todo clone e não tem revogação; nenhuma escolha sobre *quais*
 * campos commitar conserta isso. Então a fixture continua inteira e sai do git:
 * vive num balde dedicado do MinIO, e chega à árvore local por download.
 *
 *     pnpm --filter @plugga/api corpus:publicar <arquivo>...
 *     pnpm --filter @plugga/api corpus:baixar
 *
 * Três propriedades sustentam o desenho:
 *
 * - **balde dedicado.** O corpus é material de teste, com ciclo de vida próprio;
 *   misturá-lo com as faturas de produção confunde retenção. Apontar os dois
 *   para o mesmo balde é erro de configuração, e é recusado aqui;
 * - **pasta ignorada pelo git.** A proteção não depende de ninguém lembrar;
 * - **sem a chave, pula.** Quem clona sem acesso roda menos teste e vê uma
 *   frase dizendo o quê e por quê — nunca um erro que mande procurar defeito
 *   onde não há.
 *
 * Ver a política que governa isto em `docs/` e no artefato "Política de dados
 * do cliente".
 */

/** Balde padrão do corpus; nunca o mesmo de produção. */
export const BALDE_PADRAO = "plugga-corpus-faturas";

/**
 * O corpus só guarda página normalizada congelada, e o nome do arquivo é a
 * chave no balde.
 *
 * O padrão é estreito de propósito: é ele que impede uma chave vinda do balde
 * de virar caminho na árvore local. Sem barra, sem `..`, sem maiúscula — o que
 * chega escreve dentro da pasta do corpus ou não escreve em lugar nenhum.
 */
const NOME_DE_FIXTURE = /^[a-z0-9][a-z0-9-]*\.pagina\.json$/;

/**
 * Onde o corpus baixado fica na árvore local.
 *
 * Resolvido a partir deste arquivo, não do diretório de trabalho: o teste roda
 * pelo turbo, pelo `pnpm --filter` e pelo editor, cada um com um `cwd`
 * diferente, e o corpus tem de ser o mesmo nos três.
 */
export function pastaDoCorpus(ambiente: NodeJS.ProcessEnv = process.env): string {
  return ambiente.CORPUS_LOCAL
    ? resolve(ambiente.CORPUS_LOCAL)
    : resolve(__dirname, "../../../test/corpus");
}

export type ConfiguracaoDoCorpus = {
  endpoint: string;
  regiao: string;
  balde: string;
  accessKey: string;
  secretKey: string;
};

/** Configuração que existe mas se contradiz — pior que configuração ausente. */
export class CorpusMalConfiguradoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CorpusMalConfiguradoError";
  }
}

/**
 * A configuração do balde do corpus, ou `null` quando não há credencial.
 *
 * `null` é resposta legítima e o caminho comum: quem clona o repositório sem
 * acesso ao corpus não configura nada, e os testes de corpus pulam.
 *
 * O endpoint e a região caem para os do armazenamento de produção porque é o
 * mesmo servidor MinIO. **A credencial não cai**: a chave do corpus é separada
 * e, na CI, somente-leitura. Reusar a de produção para ler fixture de teste
 * daria ao runner um poder que ele não precisa ter.
 */
export function configuracaoDoCorpus(
  ambiente: NodeJS.ProcessEnv = process.env,
): ConfiguracaoDoCorpus | null {
  const accessKey = ambiente.CORPUS_ACCESS_KEY;
  const secretKey = ambiente.CORPUS_SECRET_KEY;
  const endpoint = ambiente.CORPUS_ENDPOINT || ambiente.STORAGE_ENDPOINT;

  if (!accessKey || !secretKey || !endpoint) return null;

  const balde = ambiente.CORPUS_BUCKET || BALDE_PADRAO;

  if (ambiente.STORAGE_BUCKET && balde === ambiente.STORAGE_BUCKET) {
    throw new CorpusMalConfiguradoError(
      `CORPUS_BUCKET e STORAGE_BUCKET apontam para o mesmo balde (${balde}). ` +
        "O corpus é material de teste e tem ciclo de vida próprio: publicar nele " +
        "com o balde de produção junto mistura fixture com fatura de cliente.",
    );
  }

  return {
    endpoint,
    regiao: ambiente.CORPUS_REGION || ambiente.STORAGE_REGION || "us-east-1",
    balde,
    accessKey,
    secretKey,
  };
}

/**
 * O balde visto de fora, reduzido às três operações que o corpus usa.
 *
 * Existe para publicar e baixar serem testáveis sem MinIO no ar: o teste passa
 * um balde de mentira e verifica o que foi enviado, o que foi ignorado e o que
 * foi escrito em disco. O S3 de verdade entra por `abrirBalde`.
 */
export type BaldeDoCorpus = {
  listar(): Promise<string[]>;
  baixar(chave: string): Promise<Buffer>;
  enviar(chave: string, conteudo: Buffer): Promise<void>;
};

/** Cliente S3 de verdade, falado com o SDK da AWS — MinIO responde ao mesmo. */
export async function abrirBalde(configuracao: ConfiguracaoDoCorpus): Promise<BaldeDoCorpus> {
  const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = await import(
    "@aws-sdk/client-s3"
  );

  const cliente = new S3Client({
    endpoint: configuracao.endpoint,
    region: configuracao.regiao,
    // MinIO serve os baldes por caminho, não por subdomínio — mesma razão de
    // `armazenamento.ts`.
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuracao.accessKey,
      secretAccessKey: configuracao.secretKey,
    },
  });

  return {
    async listar() {
      const chaves: string[] = [];
      let continuacao: string | undefined;

      do {
        const pagina = await cliente.send(
          new ListObjectsV2Command({
            Bucket: configuracao.balde,
            ContinuationToken: continuacao,
          }),
        );
        for (const objeto of pagina.Contents ?? []) {
          if (objeto.Key) chaves.push(objeto.Key);
        }
        continuacao = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
      } while (continuacao);

      return chaves;
    },

    async baixar(chave) {
      const resposta = await cliente.send(
        new GetObjectCommand({ Bucket: configuracao.balde, Key: chave }),
      );
      const corpo = resposta.Body;
      if (!corpo) throw new Error(`objeto vazio no balde: ${chave}`);
      return Buffer.from(await corpo.transformToByteArray());
    },

    async enviar(chave, conteudo) {
      await cliente.send(
        new PutObjectCommand({
          Bucket: configuracao.balde,
          Key: chave,
          Body: conteudo,
          ContentType: "application/json",
        }),
      );
    },
  };
}

export type Publicacao = {
  publicados: string[];
  /** Arquivos recusados, com o motivo — nunca ignorados em silêncio. */
  recusados: { caminho: string; motivo: string }[];
};

/**
 * Sobe fixtures da árvore local para o balde.
 *
 * A chave no balde é o nome do arquivo, sem caminho: o corpus é plano de
 * propósito, e é isso que torna o download incapaz de escrever fora da pasta.
 */
export async function publicarCorpus(
  balde: BaldeDoCorpus,
  caminhos: readonly string[],
): Promise<Publicacao> {
  const publicacao: Publicacao = { publicados: [], recusados: [] };

  for (const caminho of caminhos) {
    const nome = basename(caminho);

    if (!NOME_DE_FIXTURE.test(nome)) {
      publicacao.recusados.push({
        caminho,
        motivo: `nome fora do padrão do corpus (minúsculas, hífen e o final ${".pagina.json"})`,
      });
      continue;
    }

    if (!existsSync(caminho)) {
      publicacao.recusados.push({ caminho, motivo: "arquivo não encontrado" });
      continue;
    }

    const conteudo = readFileSync(caminho);

    // Um JSON quebrado no balde só apareceria como teste vermelho meses depois,
    // em quem baixou. Conferir aqui custa um parse.
    try {
      JSON.parse(conteudo.toString("utf8"));
    } catch (erro) {
      publicacao.recusados.push({
        caminho,
        motivo: `não é JSON válido: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
      continue;
    }

    await balde.enviar(nome, conteudo);
    publicacao.publicados.push(nome);
  }

  return publicacao;
}

export type Download = {
  baixados: string[];
  /** Chaves do balde que não são fixture do corpus; ficam de fora, mas ditas. */
  ignorados: string[];
  destino: string;
};

/**
 * Traz o corpus inteiro do balde para a pasta local.
 *
 * Chave que não casa o padrão de fixture não é baixada. Isso não é zelo
 * estético: a chave vem do balde, e escrever num caminho ditado por ela seria
 * deixar quem escreve no balde escolher onde este comando escreve no disco.
 */
export async function baixarCorpus(balde: BaldeDoCorpus, destino: string): Promise<Download> {
  const download: Download = { baixados: [], ignorados: [], destino };

  mkdirSync(destino, { recursive: true });

  for (const chave of await balde.listar()) {
    if (!NOME_DE_FIXTURE.test(chave)) {
      download.ignorados.push(chave);
      continue;
    }

    writeFileSync(resolve(destino, chave), await balde.baixar(chave));
    download.baixados.push(chave);
  }

  return download;
}

/** As fixtures que já estão na árvore local, em ordem. */
export function fixturesLocais(pasta: string = pastaDoCorpus()): string[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((nome) => NOME_DE_FIXTURE.test(nome))
    .sort();
}

/**
 * A frase que o teste pulado deixa no lugar do resultado.
 *
 * Vale a pena ser longa. O caso comum é alguém que clonou o repositório, viu
 * uma suíte menor do que a descrita e precisa saber, sem perguntar a ninguém,
 * que isso é o desenho e não uma quebra.
 */
export function avisoDeCorpusAusente(nome: string, pasta: string = pastaDoCorpus()): string {
  return (
    `corpus ausente: ${nome} não está em ${pasta}. ` +
    "Esta fixture carrega fatura de cliente e por isso não vive no git — ela mora " +
    "no balde do corpus no MinIO. Com CORPUS_ACCESS_KEY e CORPUS_SECRET_KEY no " +
    "ambiente, rode `pnpm --filter @plugga/api corpus:baixar`. Sem a chave este " +
    "teste é pulado de propósito: não é falha, é menos cobertura."
  );
}

/**
 * Uma fixture do corpus local, ou `null` quando ela não foi baixada.
 *
 * `null` em vez de exceção porque quem chama é um teste decidindo se roda —
 * e essa decisão tem de acontecer na coleta, não no meio da asserção.
 */
export function fixtureDoCorpus(
  nome: string,
  pasta: string = pastaDoCorpus(),
): DocumentoNormalizado | null {
  if (!NOME_DE_FIXTURE.test(nome)) return null;

  const caminho = resolve(pasta, nome);
  if (!existsSync(caminho)) return null;

  return JSON.parse(readFileSync(caminho, "utf8")) as DocumentoNormalizado;
}
