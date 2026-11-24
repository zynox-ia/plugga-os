import type { NestInterceptor, Type } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

/**
 * O único ponto de upload do API: um arquivo no campo `campo`, até `maxBytes`.
 * O nome do arquivo é lido em UTF-8: sem isso, o multer (busboy) lê o
 * `filename` do multipart como latin1 e "Medição.png" vira "MediÃ§Ã£o.png".
 * Os navegadores mandam o nome em UTF-8. Todo controller usa este helper (o
 * teste `upload.spec.ts` confere que ninguém chama o `FileInterceptor` direto).
 */
export function UmArquivo(campo: string, maxBytes: number): Type<NestInterceptor> {
  const opcoes: MulterOptions & { defParamCharset: "utf8" } = { limits: { fileSize: maxBytes }, defParamCharset: "utf8" };
  return FileInterceptor(campo, opcoes);
}
