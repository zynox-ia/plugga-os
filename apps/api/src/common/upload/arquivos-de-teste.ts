import { deflateSync } from "node:zlib";

/**
 * Geradores de arquivos pequenos para os testes de upload: nada vem de disco e
 * nada é real. Os "hostis" só declaram o absurdo no cabeçalho (mil páginas,
 * bilhões de pixels); nenhum ocupa mais que alguns KB.
 */

/** PDF mínimo com `paginas` páginas, cada uma com MediaBox `largura × altura` pt. */
export function pdf(paginas = 1, largura = 595, altura = 842): Buffer {
  const objetos: string[] = [];
  const filhos = Array.from({ length: paginas }, (_, i) => `${3 + i} 0 R`).join(" ");
  objetos.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${filhos}] /Count ${paginas} >>\nendobj\n`);
  for (let i = 0; i < paginas; i += 1) {
    objetos.push(
      `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] >>\nendobj\n`,
    );
  }
  return Buffer.from(
    `%PDF-1.4\n${objetos.join("")}trailer\n<< /Root 1 0 R /Size ${objetos.length + 1} >>\nstartxref\n0\n%%EOF\n`,
    "latin1",
  );
}

/** PDF 1.5 com os objetos de página dentro de um fluxo de objetos comprimido (como os geradores modernos fazem). */
export function pdfComFluxoDeObjetos(paginas: number, largura = 595, altura = 842): Buffer {
  const filhos = Array.from({ length: paginas }, (_, i) => `${3 + i} 0 R`).join(" ");
  const corpos = [`<< /Type /Pages /Kids [${filhos}] /Count ${paginas} >>`];
  for (let i = 0; i < paginas; i += 1) {
    corpos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] >>`);
  }
  const cabecalho = corpos.map((_, i) => `${2 + i} 0`).join(" ");
  const conteudo = deflateSync(Buffer.from(`${cabecalho}\n${corpos.join("\n")}`, "latin1"));
  const antes = Buffer.from(
    `%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n9999 0 obj\n<< /Type /ObjStm /N ${corpos.length} /First ${cabecalho.length + 1} /Filter /FlateDecode /Length ${conteudo.length} >>\nstream\n`,
    "latin1",
  );
  const depois = Buffer.from("\nendstream\nendobj\nstartxref\n0\n%%EOF\n", "latin1");
  return Buffer.concat([antes, conteudo, depois]);
}

const FIM_PNG = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** PNG que declara `largura × altura` no IHDR e traz só um IDAT simbólico. */
export function png(largura = 10, altura = 10): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(largura, 8);
  ihdr.writeUInt32BE(altura, 12);
  ihdr.set([8, 2, 0, 0, 0], 16);
  const idat = Buffer.from([0, 0, 0, 4, 0x49, 0x44, 0x41, 0x54, 1, 2, 3, 4, 0, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, idat, FIM_PNG]);
}

/** JPEG com APP0 e SOF0 declarando `largura × altura`. */
export function jpeg(largura = 10, altura = 10): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof.writeUInt16BE(altura, 5);
  sof.writeUInt16BE(largura, 7);
  sof.set([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 9);
  const dados = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, dados]);
}

/** TIFF little-endian com uma IFD de largura e altura. */
export function tiff(largura = 10, altura = 10): Buffer {
  const b = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  b.write("II", 0, "latin1");
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4);
  b.writeUInt16LE(2, 8);
  const entrada = (i: number, etiqueta: number, valor: number): void => {
    const o = 10 + i * 12;
    b.writeUInt16LE(etiqueta, o);
    b.writeUInt16LE(4, o + 2); // LONG
    b.writeUInt32LE(1, o + 4);
    b.writeUInt32LE(valor, o + 8);
  };
  entrada(0, 256, largura);
  entrada(1, 257, altura);
  return b;
}

/** WebP sem perdas (VP8L) declarando `largura × altura`. */
export function webp(largura = 10, altura = 10): Buffer {
  const corpo = Buffer.alloc(10);
  corpo[0] = 0x2f;
  corpo.writeUInt32LE(((largura - 1) & 0x3fff) | (((altura - 1) & 0x3fff) << 14), 1);
  const bloco = Buffer.concat([Buffer.from("VP8L", "latin1"), u32(corpo.length), corpo]);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), u32(4 + bloco.length), Buffer.from("WEBP", "latin1"), bloco]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/** ZIP "armazenado" (sem compressão) com as entradas dadas; `tamanhoDeclarado` mente o tamanho descompactado. */
export function zip(entradas: readonly string[], tamanhoDeclarado = 4): Buffer {
  const locais: Buffer[] = [];
  const central: Buffer[] = [];
  let deslocamento = 0;
  for (const nome of entradas) {
    const nomeB = Buffer.from(nome, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nomeB.length, 26);
    const conteudo = Buffer.from("data");
    const registro = Buffer.concat([local, nomeB, conteudo]);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt32LE(conteudo.length, 20);
    cd.writeUInt32LE(tamanhoDeclarado, 24);
    cd.writeUInt16LE(nomeB.length, 28);
    cd.writeUInt32LE(deslocamento, 42);
    central.push(Buffer.concat([cd, nomeB]));
    locais.push(registro);
    deslocamento += registro.length;
  }
  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

export const xlsx = (tamanhoDeclarado?: number): Buffer =>
  zip(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"], tamanhoDeclarado);

export const docx = (): Buffer => zip(["[Content_Types].xml", "word/document.xml"]);

/** Cabeçalho de executável do Windows (MZ) com enchimento: o clássico "virus.pdf". */
export function executavel(): Buffer {
  const b = Buffer.alloc(512, 0x90);
  b.write("MZ", 0, "latin1");
  b.write("This program cannot be run in DOS mode.", 64, "latin1");
  return b;
}

export const MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
