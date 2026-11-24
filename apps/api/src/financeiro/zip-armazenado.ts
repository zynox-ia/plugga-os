import type { Readable, Writable } from "node:stream";

/**
 * Um .zip sem compressão ("stored"), escrito em fluxo, para o "Baixar comprovantes"
 * (PLU-337). PDF e imagem já vêm comprimidos, então guardar sem comprimir não
 * perde nada e evita uma dependência nova. Cada arquivo vai com o descritor de
 * dados depois do conteúdo (bit 3), então o CRC e o tamanho são calculados
 * enquanto o arquivo passa, sem carregar nada inteiro na memória. Sem ZIP64: o
 * chamador limita a 4 GiB no total e a 65.535 arquivos.
 */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Buffer, anterior = 0): number {
  let c = ~anterior >>> 0;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

export const LIMITE_DO_ZIP_BYTES = 0xffffffff;

export type ArquivoDoZip = { nome: string; data: Date; abrir: () => Promise<Readable> };

/** Data e hora no formato do MS-DOS, no fuso de Manaus (UTC-4, sem horário de verão). */
function dataDos(data: Date): { hora: number; dia: number } {
  const d = new Date(data.getTime() - 4 * 3_600_000);
  const ano = Math.max(d.getUTCFullYear(), 1980);
  return {
    hora: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    dia: ((ano - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function escrever(destino: Writable, dados: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (destino.write(dados)) resolve();
    else {
      destino.once("drain", resolve);
      destino.once("error", reject);
    }
  });
}

/**
 * Escreve o zip em `destino`, um arquivo por vez, na ordem dada. Nomes repetidos
 * ganham " (2)", " (3)". Devolve quantos arquivos e bytes de conteúdo entraram.
 */
export async function escreverZip(destino: Writable, arquivos: ArquivoDoZip[]): Promise<{ arquivos: number; bytes: number }> {
  if (arquivos.length > 0xffff) throw new Error("zip sem ZIP64 aceita até 65.535 arquivos");
  const central: Buffer[] = [];
  const usados = new Map<string, number>();
  let deslocamento = 0;
  let total = 0;

  for (const arquivo of arquivos) {
    const vezes = (usados.get(arquivo.nome) ?? 0) + 1;
    usados.set(arquivo.nome, vezes);
    const nome = vezes === 1 ? arquivo.nome : arquivo.nome.replace(/(\.[^.]*)?$/, (ext) => ` (${vezes})${ext}`);
    const nomeBytes = Buffer.from(nome, "utf8");
    const { hora, dia } = dataDos(arquivo.data);
    const inicio = deslocamento;

    // Cabeçalho local: CRC e tamanhos zerados, que vêm no descritor (bit 3); bit 11 = nome em UTF-8.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0808, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt16LE(nomeBytes.length, 26);
    await escrever(destino, Buffer.concat([local, nomeBytes]));
    deslocamento += 30 + nomeBytes.length;

    let crc = 0;
    let tamanho = 0;
    const fonte = await arquivo.abrir();
    for await (const pedaco of fonte) {
      const b = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco as Uint8Array);
      crc = crc32(b, crc);
      tamanho += b.length;
      if (deslocamento + tamanho > LIMITE_DO_ZIP_BYTES) throw new Error("zip passou de 4 GiB sem ZIP64");
      await escrever(destino, b);
    }
    deslocamento += tamanho;
    total += tamanho;

    const descritor = Buffer.alloc(16);
    descritor.writeUInt32LE(0x08074b50, 0);
    descritor.writeUInt32LE(crc, 4);
    descritor.writeUInt32LE(tamanho, 8);
    descritor.writeUInt32LE(tamanho, 12);
    await escrever(destino, descritor);
    deslocamento += 16;

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4);
    entrada.writeUInt16LE(20, 6);
    entrada.writeUInt16LE(0x0808, 8);
    entrada.writeUInt16LE(0, 10);
    entrada.writeUInt16LE(hora, 12);
    entrada.writeUInt16LE(dia, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(tamanho, 20);
    entrada.writeUInt32LE(tamanho, 24);
    entrada.writeUInt16LE(nomeBytes.length, 28);
    entrada.writeUInt32LE(inicio, 42);
    central.push(Buffer.concat([entrada, nomeBytes]));
  }

  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  await escrever(destino, Buffer.concat([diretorio, fim]));
  return { arquivos: arquivos.length, bytes: total };
}
