import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { Controller, Post, UploadedFile, UseInterceptors, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UmArquivo } from "./upload";

const NOME = "Medição elétrica ção.png";

@Controller("teste-upload")
class Upload {
  @Post()
  @UseInterceptors(UmArquivo("arquivo", 1024))
  receber(@UploadedFile() arquivo: Express.Multer.File): { nome: string; tamanho: number } {
    return { nome: arquivo.originalname, tamanho: arquivo.size };
  }
}

describe("upload: o nome do arquivo em UTF-8", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await Test.createTestingModule({ controllers: [Upload] }).compile()).createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("o nome acentuado chega como foi enviado (não MediÃ§Ã£o)", async () => {
    const r = await request(app.getHttpServer()).post("/teste-upload").attach("arquivo", Buffer.from("%PDF-1.4"), NOME).expect(201);
    expect(r.body).toEqual({ nome: NOME, tamanho: 8 });
  });

  it("o limite de tamanho continua valendo", async () => {
    await request(app.getHttpServer()).post("/teste-upload").attach("arquivo", Buffer.alloc(2048), "grande.pdf").expect(413);
  });

  it("todo upload do API passa pelo helper: ninguém chama o FileInterceptor direto", () => {
    const raiz = path.resolve(__dirname, "..");
    const arquivos: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (statSync(p).isDirectory()) andar(p);
        else if (p.endsWith(".ts") && !p.endsWith(".spec.ts")) arquivos.push(p);
      }
    };
    andar(raiz);
    const diretos = arquivos.filter((p) => !p.endsWith(path.join("common", "upload.ts")) && /\b(File|Files|AnyFiles|FileFields)Interceptor\s*\(/.test(readFileSync(p, "utf8")));
    expect(diretos.map((p) => path.relative(raiz, p))).toEqual([]);
  });
});
