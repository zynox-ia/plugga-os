/**
 * Conversão do relatório em PDF.
 *
 * Chromium via Playwright, que é o mesmo caminho usado hoje pelo agente. O
 * SKILL.md é explícito quanto a **não** usar LibreOffice: ele destrói o layout
 * do documento. Como o Playwright já está no repositório para os testes de
 * navegação, não entra dependência nova.
 *
 * O HTML é carregado como conteúdo, não como arquivo: os logos vêm embutidos em
 * base64 e o CSS é inline, então o documento não depende de rede nem de caminho
 * de disco — o que também evita que uma falha de rede produza PDF sem marca.
 */

export type OpcoesDePdf = {
  /** Paisagem para o estudo de eficiência, que tem gráficos largos. */
  orientacao?: "retrato" | "paisagem";
};

/**
 * Erro de infraestrutura, separado do erro de dado.
 *
 * Sem navegador instalado o PDF não sai, mas o estudo continua íntegro e o HTML
 * continua servível. Quem chama precisa distinguir os dois casos para responder
 * "indisponível agora" em vez de "seu estudo está errado".
 */
export class NavegadorIndisponivelError extends Error {
  constructor(causa: unknown) {
    super(
      "não foi possível abrir o Chromium para gerar o PDF: instale o navegador " +
        "(pnpm exec playwright install chromium) ou aponte CHROMIUM_EXECUTABLE_PATH",
      { cause: causa },
    );
    this.name = "NavegadorIndisponivelError";
  }
}

/**
 * Uma conversão por vez.
 *
 * Cada Chromium custa algumas centenas de megabytes de RSS. Dez cliques em
 * "Baixar PDF" numa VPS pequena derrubariam a API inteira — e o resto do
 * sistema junto. Serializar troca alguns segundos de espera por não ficar sem
 * memória; o documento leva ~2 s, então a fila raramente é sentida.
 */
let fila: Promise<unknown> = Promise.resolve();
let esperando = 0;

/**
 * Teto da fila.
 *
 * Serializar limita a memória, mas não o tamanho da espera: o limite por IP no
 * controller não impede várias pessoas enfileirarem ao mesmo tempo, e quem
 * chega no fim de uma fila longa espera minutos por um arquivo que o navegador
 * já desistiu de receber. Melhor recusar na hora, com motivo.
 */
const ESPERA_MAXIMA = 8;

export class FilaCheiaError extends Error {
  constructor() {
    super("há conversões de PDF demais na fila; tente de novo em instantes");
    this.name = "FilaCheiaError";
  }
}

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  if (esperando >= ESPERA_MAXIMA) return Promise.reject(new FilaCheiaError());

  esperando += 1;
  const proxima = fila.then(tarefa).finally(() => {
    esperando -= 1;
  });
  // `fila` nunca rejeita: uma conversão que falha não pode travar as próximas.
  fila = proxima.catch(() => undefined);
  return proxima;
}

export function gerarPdf(html: string, opcoes: OpcoesDePdf = {}): Promise<Buffer> {
  return enfileirar(async () => {
    // Importado sob demanda: o Playwright é dependência de desenvolvimento, e a
    // API precisa subir sem ele quando ninguém for gerar PDF. Em contêiner o
    // navegador vem do gerenciador de pacotes, não do download do Playwright —
    // o binário do apt é bem menor que o pacote completo.
    let navegador;
    try {
      const { chromium } = await import("playwright");
      navegador = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        // O sandbox do Chromium depende de namespaces de usuário, que o perfil
        // seccomp padrão do Docker bloqueia. Desligar é aceitável só porque o
        // HTML é gerado por nós, com todo dado do caso escapado — nunca chega
        // conteúdo de terceiro aqui. Fora de contêiner o sandbox fica ligado.
        args: process.env.CHROMIUM_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
      });
    } catch (erro) {
      throw new NavegadorIndisponivelError(erro);
    }

    try {
      const pagina = await navegador.newPage();
      await pagina.setContent(html, { waitUntil: "load" });

      return await pagina.pdf({
        format: "A4",
        landscape: opcoes.orientacao !== "retrato",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
      });
    } finally {
      await navegador.close();
    }
  });
}
