import { Module } from "@nestjs/common";

import { LimitadorDeUploads } from "./limitador-de-uploads";

/** Dono do `LimitadorDeUploads`: uma instância só, compartilhada por Compras e Obras. */
@Module({
  providers: [{ provide: LimitadorDeUploads, useFactory: () => new LimitadorDeUploads() }],
  exports: [LimitadorDeUploads],
})
export class UploadModule {}
