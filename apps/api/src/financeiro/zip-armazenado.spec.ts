import { PassThrough, Readable } from "node:stream";
import * as zlib from "node:zlib";

import { describe, expect, it } from "vitest";

import { crc32, escreverZip } from "./zip-armazenado";

async function gerar(arquivos: { nome: string; conteudo: Buffer }[]): Promise<Buffer> {
  const saida = new PassThrough();
  const pedacos: Buffer[] = [];
  saida.on("data", (b: Buffer) => pedacos.push(b));
  await escreverZip(saida, arquivos.map((a) => ({ nome: a.nome, data: new Date("2026-11-23T14:00:00Z"), abrir: async () => Readable.from([a.conteudo.subarray(0, 3), a.conteudo.subarray(3)]) })));
  saida.end();
  return Buffer.concat(pedacos);
}

/** Leitura independente do diretório central: nome, tamanho e o CRC conferido contra o conteúdo. */
function ler(zip: Buffer): { nome: string; conteudo: Buffer }[] {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const quantos = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  const lidos: { nome: string; conteudo: Buffer }[] = [];
  for (let i = 0; i < quantos; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(p + 16);
    const tamanho = zip.readUInt32LE(p + 24);
    const nomeTam = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + nomeTam).toString("utf8");
    const inicio = local + 30 + zip.readUInt16LE(local + 26);
    const conteudo = zip.subarray(inicio, inicio + tamanho);
    expect(crc32(conteudo)).toBe(crc);
    lidos.push({ nome, conteudo });
    p += 46 + nomeTam;
  }
  return lidos;
}

describe("zip sem compressão", () => {
  it("o CRC-32 bate com o do zlib", () => {
    const dados = Buffer.from("Plugga OS · comprovante · R$ 1.742,18");
    const doZlib = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32;
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    if (doZlib) expect(crc32(dados)).toBe(doZlib(dados));
    // Em partes dá o mesmo que inteiro.
    expect(crc32(dados.subarray(5), crc32(dados.subarray(0, 5)))).toBe(crc32(dados));
  });

  it("os arquivos voltam inteiros, com nome em UTF-8 e repetidos numerados", async () => {
    const a = Buffer.from("%PDF-1.4 primeiro");
    const b = Buffer.from("%PDF-1.4 segundo, maior");
    const zip = await gerar([
      { nome: "2026-11-21 · CP-0401 · Prefeitura · R$ 1.742,18.pdf", conteudo: a },
      { nome: "2026-11-21 · CP-0401 · Prefeitura · R$ 1.742,18.pdf", conteudo: b },
    ]);
    const lidos = ler(zip);
    expect(lidos.map((l) => l.nome)).toEqual(["2026-11-21 · CP-0401 · Prefeitura · R$ 1.742,18.pdf", "2026-11-21 · CP-0401 · Prefeitura · R$ 1.742,18 (2).pdf"]);
    expect(lidos.map((l) => l.conteudo.toString())).toEqual([a.toString(), b.toString()]);
  });

  it("zip vazio é válido", async () => {
    const zip = await gerar([]);
    expect(zip.length).toBe(22);
    expect(ler(zip)).toEqual([]);
  });
});
